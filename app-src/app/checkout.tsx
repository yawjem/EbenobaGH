import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../src/lib/supabase';
import { useCart } from '../src/state/cart';
import { useAuth } from '../src/state/auth';
import { colors, radius } from '../src/lib/theme';
import { ghs } from '../src/lib/format';
import { toE164Gh, toLocalGh } from '../src/lib/phone';
import { Button } from '../src/components/ui';
import { countryName } from '../src/lib/countries';
import { column } from '../src/lib/responsive';

type Opt = { method: string; method_label: string; kind: string; speed: string; speed_label: string; fee: number; min_days: number; max_days: number };
const METHOD_HINT: Record<string, string> = {
  ebenoba_rider: 'Our own riders. You get a delivery code to confirm hand-over.',
  shaq_express: 'Fast courier service within Ghana.',
  seamless: 'Courier service within Ghana.',
  fedex: 'International courier with tracking.',
};
const eta = (a: number, b: number) => (b === 0 ? 'Arrives today' : a === b ? `Arrives in ${a} day${a === 1 ? '' : 's'}` : `Arrives in ${a}–${b} days`);

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Oti', 'Savannah', 'North East', 'Western North'];

export default function Checkout() {
  const { items, subtotal } = useCart();
  const { session, profile } = useAuth();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addrId, setAddrId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ recipient_name: profile?.full_name ?? '', phone: toLocalGh(profile?.phone), region: 'Ashanti', city: '', street: '', landmark: '', digital_address: '', region_text: '' });
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState('GH');
  const [countries, setCountries] = useState<string[]>([]);
  const [opts, setOpts] = useState<Opt[] | null>(null);   // null = loading
  const [method, setMethod] = useState<string | null>(null);
  const [speed, setSpeed] = useState<string | null>(null);
  const intl = country !== 'GH';

  useEffect(() => { supabase.rpc('delivery_countries').then(({ data }) => setCountries(((data as string[]) ?? []).filter((c) => c !== 'GH'))); }, []);

  // Live prices: ask the server what each delivery method and speed would cost for THIS cart and address.
  const cartKey = items.map((i) => `${i.variantId}:${i.qty}`).join(',');
  useEffect(() => {
    if (!addrId || !session) { setOpts([]); return; }
    let live = true; setOpts(null);
    supabase.rpc('delivery_quote', { p_address: addrId, p_items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })) }).then(({ data, error }) => {
      if (!live) return;
      const list: Opt[] = error ? [] : ((data as any[]) ?? []).map((o) => ({ ...o, fee: Number(o.fee) }));
      setOpts(list);
      setMethod((m) => (m && list.some((o) => o.method === m) ? m : list[0]?.method ?? null));
    });
    return () => { live = false; };
  }, [addrId, cartKey, session?.user.id]);

  const methods = Array.from(new Map((opts ?? []).map((o) => [o.method, o])).values());
  const speeds = (opts ?? []).filter((o) => o.method === method);
  useEffect(() => {
    if (!speeds.length) { setSpeed(null); return; }
    setSpeed((s) => (s && speeds.some((o) => o.speed === s) ? s : (speeds.find((o) => o.speed === 'three_days') ?? speeds[0]).speed));
  }, [method, opts]);
  const chosen = speeds.find((o) => o.speed === speed) ?? null;

  const load = async () => {
    const { data } = await supabase.from('addresses').select('*').order('is_default', { ascending: false });
    setAddresses(data ?? []);
    if (data?.length) setAddrId((cur) => cur ?? data[0].id); else setAdding(true);
  };
  useEffect(() => { if (session) load(); }, [session?.user.id]);

  const saveAddress = async () => {
    if (!f.recipient_name || !f.phone || !f.city) return Alert.alert('Missing details', 'Name, phone and city are required.');
    let phone = f.phone.trim();
    if (!intl) {
      if (!toE164Gh(f.phone)) return Alert.alert('Check the phone number', 'Use a Ghana mobile number, e.g. 024 412 3456. The rider will call it.');
    } else {
      phone = phone.replace(/[^\d+]/g, '');
      if (phone.replace(/\D/g, '').length < 7) return Alert.alert('Check the phone number', 'Include the country code, e.g. +44 7700 900123.');
      if (!f.street.trim()) return Alert.alert('Street address needed', 'Couriers need the full street address.');
    }
    const { region_text, ...rest } = f;
    const { data, error } = await supabase.from('addresses').insert({ ...rest, phone, country_code: country, region: intl ? (region_text || f.city) : f.region, user_id: session!.user.id, is_default: addresses.length === 0 }).select().single();
    if (error) return Alert.alert('Could not save address', error.message);
    // Keep a phone on the profile so shipping SMS reach people who signed up with email.
    if (!intl && !profile?.phone) await supabase.from('profiles').update({ phone: toE164Gh(f.phone) }).eq('id', session!.user.id);
    setAdding(false); setAddrId(data.id); load();
  };

  const pay = async () => {
    if (!addrId) return Alert.alert('Choose a delivery address');
    if (!chosen) return Alert.alert('Choose how you want it delivered');
    setBusy(true);
    // The server re-prices the cart, calculates delivery per package, creates the order
    // and returns a Paystack link. (Edge Function `checkout` — built next.)
    const { data, error } = await supabase.functions.invoke('checkout', {
      body: { address_id: addrId, method: chosen.method, speed: chosen.speed, items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })) },
    });
    setBusy(false);
    if (error || !data?.authorization_url) {
      return Alert.alert('Checkout is not ready yet', error?.message ?? 'The payment service has not been connected.');
    }
    // The cart is only emptied once payment is confirmed (see the order screen), so a cancelled payment loses nothing.
    await WebBrowser.openBrowserAsync(data.authorization_url);
    router.replace(`/order/${data.order_id}`);
  };

  const inp = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 8, backgroundColor: '#fff' } as const;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ ...column, padding: 16 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.deep }}>Delivery address</Text>
      {addresses.map((a) => (
        <Pressable key={a.id} onPress={() => setAddrId(a.id)} style={{ marginTop: 8, padding: 12, borderRadius: radius.md, borderWidth: 1.5,
          borderColor: addrId === a.id ? colors.primary : colors.border, backgroundColor: addrId === a.id ? colors.blush : '#fff' }}>
          <Text style={{ fontWeight: '700' }}>{a.recipient_name} · {a.phone}</Text>
          <Text style={{ color: colors.muted }}>{[a.street, a.landmark, a.city, a.region, a.country_code !== 'GH' ? countryName(a.country_code) : null].filter(Boolean).join(', ')}</Text>
        </Pressable>))}
      {!adding && <Button title="Add new address" variant="soft" onPress={() => setAdding(true)} style={{ marginTop: 10 }} />}
      {adding && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ color: colors.muted, fontWeight: '600', fontSize: 12 }}>Deliver to</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {['GH', ...countries].map((c) => (
              <Pressable key={c} onPress={() => setCountry(c)} style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: radius.pill, backgroundColor: country === c ? colors.navy : colors.navySoft }}>
                <Text style={{ color: country === c ? '#fff' : colors.navy, fontWeight: '600' }}>{countryName(c)}</Text></Pressable>))}
          </ScrollView>
          {intl && <Text style={{ color: colors.tealText, fontSize: 12, marginTop: 6 }}>International orders are shipped by FedEx. Delivery price depends on weight and speed.</Text>}
          <TextInput placeholder="Recipient name" style={inp} value={f.recipient_name} onChangeText={(v) => setF({ ...f, recipient_name: v })} />
          <TextInput placeholder={intl ? 'Phone with country code (e.g. +44 7700 900123)' : 'Phone (e.g. 024xxxxxxx)'} keyboardType="phone-pad" style={inp} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
          {intl ? <TextInput placeholder="State / province (optional)" style={inp} value={f.region_text} onChangeText={(v) => setF({ ...f, region_text: v })} /> : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {REGIONS.map((r) => (
              <Pressable key={r} onPress={() => setF({ ...f, region: r })} style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: radius.pill, backgroundColor: f.region === r ? colors.primary : colors.blush }}>
                <Text style={{ color: f.region === r ? '#fff' : colors.deep }}>{r}</Text></Pressable>))}
          </ScrollView>)}
          <TextInput placeholder="City / town" style={inp} value={f.city} onChangeText={(v) => setF({ ...f, city: v })} />
          <TextInput placeholder="Street / house no." style={inp} value={f.street} onChangeText={(v) => setF({ ...f, street: v })} />
          <TextInput placeholder="Landmark (optional)" style={inp} value={f.landmark} onChangeText={(v) => setF({ ...f, landmark: v })} />
          {!intl && <TextInput placeholder="Ghana Post digital address (optional)" autoCapitalize="characters" style={inp} value={f.digital_address} onChangeText={(v) => setF({ ...f, digital_address: v })} />}
          <Button title="Save address" onPress={saveAddress} style={{ marginTop: 12 }} />
        </View>)}

      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.deep, marginTop: 24 }}>Delivery method</Text>
      {opts === null && <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />}
      {opts !== null && !methods.length && (
        <Text style={{ color: colors.muted, marginTop: 8 }}>{addrId ? 'We cannot deliver this order to that address yet. Try another address or country.' : 'Choose an address to see delivery options.'}</Text>)}
      {methods.map((m) => {
        const on = method === m.method; const cheapest = Math.min(...(opts ?? []).filter((o) => o.method === m.method).map((o) => o.fee));
        return (
          <Pressable key={m.method} onPress={() => setMethod(m.method)} style={{ marginTop: 8, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? colors.teal : colors.border, backgroundColor: on ? colors.tealSoft : '#fff', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name={m.kind === 'international' ? 'airplane-outline' : 'bicycle-outline'} size={22} color={colors.teal} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>{m.method_label}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{METHOD_HINT[m.method] ?? ''}</Text></View>
            <Text style={{ color: colors.tealText, fontWeight: '700', fontSize: 12 }}>from {ghs(cheapest)}</Text>
          </Pressable>);
      })}

      {speeds.length > 0 && (<>
        <Text style={{ fontSize: 17, fontWeight: '800', color: colors.deep, marginTop: 20 }}>Delivery time</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Faster delivery costs more. Slower delivery costs less.</Text>
        {speeds.map((o) => {
          const on = speed === o.speed;
          return (
            <Pressable key={o.speed} onPress={() => setSpeed(o.speed)} style={{ marginTop: 8, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.blush : '#fff', flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text }}>{o.speed_label}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{eta(o.min_days, o.max_days)}</Text></View>
              <Text style={{ fontWeight: '800', color: on ? colors.primary : colors.text }}>{ghs(o.fee)}</Text>
            </Pressable>);
        })}</>)}

      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.deep, marginTop: 24 }}>Summary</Text>
      <View style={{ marginTop: 8, padding: 14, backgroundColor: colors.sand, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldSoft }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text>Items ({items.reduce((n, i) => n + i.qty, 0)})</Text><Text style={{ fontWeight: '700' }}>{ghs(subtotal)}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text>Delivery{chosen ? ` · ${chosen.method_label}` : ''}</Text><Text style={{ fontWeight: '700' }}>{chosen ? ghs(chosen.fee) : '—'}</Text></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderColor: colors.goldSoft }}>
          <Text style={{ fontWeight: '800' }}>Total</Text><Text style={{ fontWeight: '900', fontSize: 16 }}>{chosen ? ghs(subtotal + chosen.fee) : ghs(subtotal)}</Text></View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>Item prices are confirmed again when you pay, so a price change never surprises you.</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12, padding: 12, backgroundColor: colors.tealSoft, borderRadius: radius.md }}>
        <Ionicons name="shield-checkmark" size={22} color={colors.teal} />
        <Text style={{ flex: 1, color: colors.tealText, fontWeight: '600' }}>Secure payment with MTN MoMo, Telecel Cash, AT Money or card.</Text>
      </View>
      <Button title={chosen ? `Pay ${ghs(subtotal + chosen.fee)}` : 'Pay now'} disabled={!chosen} loading={busy} onPress={pay} style={{ marginTop: 16 }} />
    </ScrollView>
  );
}
