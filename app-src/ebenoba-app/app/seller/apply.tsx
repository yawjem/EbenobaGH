import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/state/auth';
import { friendlyError, REGIONS } from '../../src/lib/seller';
import { colors, radius } from '../../src/lib/theme';
import { Button } from '../../src/components/ui';

export default function Apply() {
  const { session, profile, refreshProfile } = useAuth();
  const [app, setApp] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ shop_name: '', description: '', phone: profile?.phone ?? '', region: 'Greater Accra', city: '', address: '' });

  const load = async () => {
    if (!session) return;
    const { data } = await supabase.from('seller_applications').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setApp(data); setReady(true);
    if (data?.status === 'approved') refreshProfile();
  };
  useEffect(() => { load(); }, [session?.user.id]);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('apply_as_seller', { p_shop_name: f.shop_name, p_description: f.description, p_phone: f.phone, p_region: f.region, p_city: f.city, p_address: f.address });
    setBusy(false);
    if (error) return Alert.alert('Could not send', friendlyError(error.message));
    load();
  };

  if (!session) return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><Button title="Sign in to apply" onPress={() => router.replace('/login')} /></View>;
  if (!ready) return null;

  if (app?.status === 'pending') return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
      <View style={{ backgroundColor: colors.goldSoft, borderRadius: radius.lg, padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.goldText }}>Application received</Text>
        <Text style={{ marginTop: 8, color: colors.text, lineHeight: 20 }}>“{app.shop_name}” is waiting for approval. We will notify you as soon as it is reviewed, and a My Shop tab will appear in the app.</Text>
      </View>
    </View>);

  if (app?.status === 'approved' || profile?.role === 'seller') return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
      <View style={{ backgroundColor: colors.successSoft, borderRadius: radius.lg, padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.greenText }}>You are approved 🎉</Text>
        <Text style={{ marginTop: 8, lineHeight: 20 }}>Open the My Shop tab to add your products and set up your business profile.</Text>
        <Button title="Go to My Shop" onPress={() => router.replace('/shop')} style={{ marginTop: 14 }} />
      </View>
    </View>);

  const inp = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 8, backgroundColor: '#fff' } as const;
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.bg }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.navy }}>Sell on Ebenoba GH</Text>
      <Text style={{ color: colors.muted, marginTop: 4 }}>Tell us about your business. Ebenoba GH reviews every application before the shop goes live.</Text>
      {app?.status === 'rejected' && (
        <View style={{ backgroundColor: colors.blush, borderRadius: radius.md, padding: 12, marginTop: 12 }}>
          <Text style={{ color: colors.deep, fontWeight: '700' }}>Your last application was not approved.</Text>
          {app.reject_reason ? <Text style={{ color: colors.deep, marginTop: 2 }}>Reason: {app.reject_reason}</Text> : null}
          <Text style={{ color: colors.deep, marginTop: 2 }}>You can fix the details and apply again.</Text>
        </View>)}
      <TextInput placeholder="Business / shop name" style={inp} value={f.shop_name} onChangeText={(v) => setF({ ...f, shop_name: v })} />
      <TextInput placeholder="What do you sell? (short description)" multiline style={[inp, { minHeight: 80, textAlignVertical: 'top' }]} value={f.description} onChangeText={(v) => setF({ ...f, description: v })} />
      <TextInput placeholder="Business phone (e.g. 024xxxxxxx)" keyboardType="phone-pad" style={inp} value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        {REGIONS.map((r) => (
          <Pressable key={r} onPress={() => setF({ ...f, region: r })} style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: radius.pill, backgroundColor: f.region === r ? colors.primary : colors.blush }}>
            <Text style={{ color: f.region === r ? '#fff' : colors.deep }}>{r}</Text></Pressable>))}
      </ScrollView>
      <TextInput placeholder="City / town" style={inp} value={f.city} onChangeText={(v) => setF({ ...f, city: v })} />
      <TextInput placeholder="Shop address / landmark (where items are collected)" style={inp} value={f.address} onChangeText={(v) => setF({ ...f, address: v })} />
      <Button title="Send application" loading={busy} onPress={submit} style={{ marginTop: 16 }} />
    </ScrollView>
  );
}
