import React from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../src/lib/supabase';
import { clearPushToken } from '../../src/lib/push';
import { useAuth } from '../../src/state/auth';
import { colors, radius } from '../../src/lib/theme';
import { Button } from '../../src/components/ui';
import { getConsent, setConsent } from '../../src/lib/tracking';
import { toLocalGh } from '../../src/lib/phone';

export default function Account() {
  const { session, profile, refreshProfile } = useAuth();
  const [track, setTrack] = React.useState(getConsent() === 'yes');
  useFocusEffect(React.useCallback(() => { if (session) refreshProfile(); }, [session?.user.id]));

  if (!session) return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg }}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.deep, textAlign: 'center' }}>Welcome to Ebenoba GH</Text>
      <Text style={{ color: colors.muted, textAlign: 'center', marginVertical: 12 }}>Sign in to order, save favourites and track deliveries.</Text>
      <Button title="Sign in or create account" onPress={() => router.push('/login')} />
    </View>);

  const row = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ padding: 16, borderBottomWidth: 1, borderColor: colors.border }}><Text style={{ fontWeight: '600' }}>{label}</Text></Pressable>);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }}>
      <LinearGradient colors={[colors.primary, colors.darkest]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 24, paddingTop: 36 }}>
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{(profile?.full_name || profile?.email || profile?.phone || '?').charAt(0).toUpperCase()}</Text></View>
        <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>{profile?.full_name || 'My account'}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{profile?.email || toLocalGh(profile?.phone)}</Text>
        {profile?.role === 'seller' && <Text style={{ color: colors.goldSoft, fontWeight: '700', marginTop: 6 }}>Shop owner — open the My Shop tab</Text>}
        {(profile?.role === 'admin' || profile?.role === 'rider') && <Text style={{ color: colors.goldSoft, fontWeight: '700', marginTop: 6 }}>Role: {profile.role} (use the web portal)</Text>}
      </LinearGradient>
      {row('My wishlist', () => router.push('/wishlist'))}
      {row('My orders', () => router.push('/orders'))}
      {profile?.role === 'buyer' && row('Sell on Ebenoba GH — open a shop', () => router.push('/seller/apply'))}

      <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flex: 1, paddingRight: 12 }}><Text style={{ fontWeight: '600' }}>Offer notifications</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Occasional discounts on things you liked. Order updates are always sent.</Text></View>
        <Switch value={!!profile?.promo_push_enabled} trackColor={{ true: colors.primary }}
          onValueChange={async (v) => { await supabase.from('profiles').update({ promo_push_enabled: v }).eq('id', session.user.id); refreshProfile(); }} />
      </View>

      <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flex: 1, paddingRight: 12 }}><Text style={{ fontWeight: '600' }}>Personalised recommendations</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Turning this off deletes the activity we saved about you.</Text></View>
        <Switch value={track} trackColor={{ true: colors.primary }}
          onValueChange={async (v) => { setTrack(v); await setConsent(v ? 'yes' : 'no'); refreshProfile(); }} />
      </View>

      <View style={{ padding: 16 }}>
        <Button variant="outline" title="Sign out" onPress={() => Alert.alert('Sign out?', '', [{ text: 'Cancel' }, { text: 'Sign out', style: 'destructive', onPress: async () => { await clearPushToken(session.user.id); await supabase.auth.signOut(); } }])} />
      </View>
    </ScrollView>
  );
}
