import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View, Pressable } from 'react-native';
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

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Oti', 'Savannah', 'North East', 'Western North'];

export default function Checkout() {
  const { items, subtotal } = useCart();
  const { session, profile } = useAuth();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addrId, setAddrId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ recipient_name: profile?.full_name ?? '', phone: toLocalGh(profile?.phone), region: 'Ashanti', city: '', street: '', landmark: '', digital_address: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('addresses').select('*').order('is_default', { ascending: false });
    setAddresses(data ?? []);
    if (data?.length) setAddrId((cur) => cur ?? data[0].id); else setAdding(true);
  };
  useEffect(() => { if (session) load(); }, [session?.user.id]);

  const saveAddress = async () => {
    if (!f.recipient_name || !f.phone || !f.city) return Alert.alert('Missing details', 'Name, phone and city are required.');
    if (!toE164Gh(f.phone)) return Alert.alert('Check the phone number', 'Use a Ghana mobile number, e.g. 024 412 3456. The rider will call it.');
    const { data, error } = await supabase.from('addresses').insert({ ...f, user_id: session!.user.id, is_default: addresses.length === 0 }).select().single();
    if (error) return Alert.alert('Could not save address', error.message);
    // Keep a phone on the profile so shipping SMS reach people who signed up with email.
    if (!profile?.phone) await supabase.from('profiles').update({ phone: toE164Gh(f.phone) }).eq('id', session!.user.id);
    setAdding(false); setAddrId(data.id); load();
  };

  const pay = async () => {
    if (!addrId) return Alert.alert('Choose a delivery address');
    setBusy(true);
    // The server re-prices the cart, calculates delivery per package, creates the order
    // and returns a Paystack link. (Edge Function `checkout` — built next.)
    const { data, error } = await supabase.functions.invoke('checkout', {
      body: { address_id: addrId, items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty })) },
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
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.deep }}>Delivery address</Text>
      {addresses.map((a) => (
        <Pressable key={a.id} onPress={() => setAddrId(a.id)} style={{ marginTop: 8, padding: 12, borderRadius: radius.md, borderWidth: 1.5,
          borderColor: addrId === a.id ? colors.primary : colors.border, backgroundColor: addrId === a.id ? colors.blush : '#fff' }}>
          <Text style={{ fontWeight: '700' }}>{a.recipient_name} · {a.phone}</Text>
          <Text style={{ color: colors.muted }}>{[a.street, a.landmark, a.city, a.region].filter(Boolean).join(', ')}</Text>
        </Pressable>))}
      {!adding && <Button title="Add new address" variant="soft" onPress={() => setAdding(true)} style={{ marginTop: 10 }} />}
      {adding && (
        <View style={{ marginTop: 8 }}>
          <TextInput placeholder="Recipient name" style={inp} value={f.recipient_name} onChangeText={(v) => setF({ ...f, recipient_name: v })} />
          <TextInput placeholder="Phone (e.g. 024xxxxxxx)" keyboardType="phone-pad" style={inp} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {REGIONS.map((r) => (
              <Pressable key={r} onPress={() => setF({ ...f, region: r })} style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: radius.pill, backgroundColor: f.region === r ? colors.primary : colors.blush }}>
                <Text style={{ color: f.region === r ? '#fff' : colors.deep }}>{r}</Text></Pressable>))}
          </ScrollView>
          <TextInput placeholder="City / town" style={inp} value={f.city} onChangeText={(v) => setF({ ...f, city: v })} />
          <TextInput placeholder="Street / house no." style={inp} value={f.street} onChangeText={(v) => setF({ ...f, street: v })} />
          <TextInput placeholder="Landmark (optional)" style={inp} value={f.landmark} onChangeText={(v) => setF({ ...f, landmark: v })} />
          <TextInput placeholder="Ghana Post digital address (optional)" autoCapitalize="characters" style={inp} value={f.digital_address} onChangeText={(v) => setF({ ...f, digital_address: v })} />
          <Button title="Save address" onPress={saveAddress} style={{ marginTop: 12 }} />
        </View>)}

      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.deep, marginTop: 24 }}>Summary</Text>
      <View style={{ marginTop: 8, padding: 14, backgroundColor: colors.sand, borderRadius: radius.md, borderWidth: 1, borderColor: colors.goldSoft }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text>Items ({items.reduce((n, i) => n + i.qty, 0)})</Text><Text style={{ fontWeight: '700' }}>{ghs(subtotal)}</Text></View>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Delivery is charged per package and the exact total is shown on the payment page.</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12, padding: 12, backgroundColor: colors.tealSoft, borderRadius: radius.md }}>
        <Ionicons name="shield-checkmark" size={22} color={colors.teal} />
        <Text style={{ flex: 1, color: colors.tealText, fontWeight: '600' }}>Secure payment with MTN MoMo, Telecel Cash, AT Money or card.</Text>
      </View>
      <Button title="Pay now" loading={busy} onPress={pay} style={{ marginTop: 16 }} />
    </ScrollView>
  );
}
