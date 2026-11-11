import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { pickImage, REGIONS, uploadImage, useMyShop } from '../../src/lib/seller';
import { colors, radius } from '../../src/lib/theme';
import { Button } from '../../src/components/ui';
import { column } from '../../src/lib/responsive';

const NETWORKS = ['MTN', 'Telecel', 'AT'];

export default function ShopProfile() {
  const { shop, loading, reload } = useMyShop();
  const [f, setF] = useState<any>(null);
  const [pay, setPay] = useState({ momo_network: 'MTN', momo_number: '', bank_name: '', bank_account_number: '' });
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    if (!shop || f) return;
    setF({ name: shop.name ?? '', description: shop.description ?? '', phone: shop.phone ?? '', address_text: shop.address_text ?? '', region: shop.region ?? 'Greater Accra', city: shop.city ?? '', monthly_goal: shop.monthly_goal ? String(shop.monthly_goal) : '', logo_url: shop.logo_url });
    supabase.from('shop_payout_details').select('*').eq('shop_id', shop.id).maybeSingle().then(({ data }) => { if (data) setPay((p) => ({ ...p, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)) })); });
  }, [shop?.id]);

  if (loading || !f) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;

  const changeLogo = async () => {
    const uri = await pickImage(true); if (!uri) return;
    setLogoBusy(true);
    try {
      const url = await uploadImage('shop-assets', shop.id, uri);
      const { error } = await supabase.from('shops').update({ logo_url: url }).eq('id', shop.id);
      if (error) throw new Error(error.message);
      setF({ ...f, logo_url: url }); reload();
    } catch (e: any) { Alert.alert('Could not upload the picture', e.message); }
    setLogoBusy(false);
  };

  const save = async () => {
    if (f.name.trim().length < 2) return Alert.alert('Shop name is required');
    const goal = f.monthly_goal.trim() === '' ? null : Number(f.monthly_goal);
    if (goal !== null && (Number.isNaN(goal) || goal < 0)) return Alert.alert('Monthly goal must be a number');
    if (pay.momo_number && !/^0\d{9}$/.test(pay.momo_number.replace(/\s/g, ''))) return Alert.alert('Check the MoMo number', 'Use the 10-digit number, e.g. 0241234567.');
    setBusy(true);
    const a = await supabase.from('shops').update({ name: f.name.trim(), description: f.description.trim() || null, phone: f.phone.trim() || null, address_text: f.address_text.trim() || null, region: f.region, city: f.city.trim() || null, monthly_goal: goal }).eq('id', shop.id);
    const b = await supabase.from('shop_payout_details').upsert({ shop_id: shop.id, momo_network: pay.momo_number ? pay.momo_network : null, momo_number: pay.momo_number.replace(/\s/g, '') || null, bank_name: pay.bank_name || null, bank_account_number: pay.bank_account_number || null, updated_at: new Date().toISOString() });
    setBusy(false);
    if (a.error || b.error) return Alert.alert('Could not save', (a.error ?? b.error)!.message);
    reload(); Alert.alert('Saved', 'Your business profile is updated.', [{ text: 'OK', onPress: () => router.back() }]);
  };

  const inp = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 6, backgroundColor: '#fff' } as const;
  const lab = { color: colors.muted, fontWeight: '600', fontSize: 12, marginTop: 14 } as const;
  const head = (t: string, c: string) => <Text style={{ fontSize: 16, fontWeight: '800', color: c, marginTop: 26 }}>{t}</Text>;

  return (
    <ScrollView contentContainerStyle={{ ...column, padding: 16 }} keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.bg }}>
      <View style={{ alignItems: 'center' }}>
        <Pressable onPress={changeLogo}>
          {f.logo_url ? <Image source={{ uri: f.logo_url }} style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface }} />
            : <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.blush, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="storefront-outline" size={40} color={colors.primary} /></View>}
          <View style={{ position: 'absolute', right: 0, bottom: 0, backgroundColor: colors.primary, borderRadius: 16, padding: 7 }}>
            {logoBusy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="camera" size={16} color="#fff" />}</View>
        </Pressable>
        <Text style={{ color: colors.muted, marginTop: 8 }}>Tap to change your business picture</Text>
      </View>

      {head('Business profile', colors.navy)}
      <Text style={lab}>Shop name</Text><TextInput style={inp} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
      <Text style={lab}>About your shop</Text><TextInput style={[inp, { minHeight: 90, textAlignVertical: 'top' }]} multiline value={f.description} onChangeText={(v) => setF({ ...f, description: v })} placeholder="What you sell, your story, why customers can trust you" />
      <Text style={lab}>Business phone</Text><TextInput style={inp} keyboardType="phone-pad" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
      <Text style={lab}>Where items are collected</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
        {REGIONS.map((r) => (
          <Pressable key={r} onPress={() => setF({ ...f, region: r })} style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: radius.pill, backgroundColor: f.region === r ? colors.primary : colors.blush }}>
            <Text style={{ color: f.region === r ? '#fff' : colors.deep }}>{r}</Text></Pressable>))}
      </ScrollView>
      <TextInput style={inp} placeholder="City / town" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} />
      <TextInput style={inp} placeholder="Street / landmark" value={f.address_text} onChangeText={(v) => setF({ ...f, address_text: v })} />
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Delivery fees are worked out from your region, so keep it accurate.</Text>

      {head('Sales goal', colors.goldText)}
      <Text style={lab}>Monthly sales goal (GH₵)</Text>
      <TextInput style={inp} keyboardType="decimal-pad" value={f.monthly_goal} onChangeText={(v) => setF({ ...f, monthly_goal: v })} placeholder="e.g. 5000" />

      {head('Where we pay you', colors.tealText)}
      <Text style={{ color: colors.muted, marginTop: 4 }}>Only you and Ebenoba GH can see this.</Text>
      <Text style={lab}>Mobile money network</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {NETWORKS.map((n) => (
          <Pressable key={n} onPress={() => setPay({ ...pay, momo_network: n })} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: pay.momo_network === n ? colors.teal : colors.tealSoft }}>
            <Text style={{ color: pay.momo_network === n ? '#fff' : colors.tealText, fontWeight: '700' }}>{n}</Text></Pressable>))}
      </View>
      <TextInput style={inp} keyboardType="phone-pad" placeholder="MoMo number" value={pay.momo_number} onChangeText={(v) => setPay({ ...pay, momo_number: v })} />
      <Text style={lab}>Or bank account (optional)</Text>
      <TextInput style={inp} placeholder="Bank name" value={pay.bank_name} onChangeText={(v) => setPay({ ...pay, bank_name: v })} />
      <TextInput style={inp} keyboardType="number-pad" placeholder="Account number" value={pay.bank_account_number} onChangeText={(v) => setPay({ ...pay, bank_account_number: v })} />

      <Button title="Save profile" loading={busy} onPress={save} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}
