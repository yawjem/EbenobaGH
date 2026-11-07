import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../src/lib/supabase';
import { useMyShop } from '../../src/lib/seller';
import { colors, radius } from '../../src/lib/theme';
import { ghs } from '../../src/lib/format';
import { BarChart, Delta, ProgressBar } from '../../src/components/charts';
import { Button, Empty, Section } from '../../src/components/ui';

const RANGES = [7, 30, 90];
const shortDay = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}`; };

export default function MyShop() {
  const { shop, loading, reload } = useMyShop();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<any>(null);
  const [month, setMonth] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!shop) return;
    // Accra is UTC+0 all year, so the UTC day-of-month is the shop's day-of-month.
    const dom = new Date().getUTCDate();
    const [a, b] = await Promise.all([
      supabase.rpc('seller_stats', { p_shop: shop.id, p_days: days }),
      supabase.rpc('seller_stats', { p_shop: shop.id, p_days: dom }),
    ]);
    setStats(a.data); setMonth(b.data);
  }, [shop?.id, days]);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
  if (!shop) return <Empty text="Your shop is not set up yet. If you applied, we will notify you when it is approved." />;

  const todo = stats?.to_do ?? {};
  const bal = stats?.balance ?? {};
  const tile = (icon: any, label: string, value: number, tint: string, fg: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={{ flex: 1, minWidth: '45%', backgroundColor: tint, borderRadius: radius.md, padding: 12 }}>
      <Ionicons name={icon} size={20} color={fg} />
      <Text style={{ fontSize: 22, fontWeight: '900', color: colors.navy, marginTop: 4 }}>{value ?? 0}</Text>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </Pressable>);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary}
      onRefresh={async () => { setRefreshing(true); await reload(); await load(); setRefreshing(false); }} />}>
      <LinearGradient colors={[colors.navy, '#2B4160']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20, paddingTop: 44 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {shop.logo_url
            ? <Image source={{ uri: shop.logo_url }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' }} />
            : <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 22 }}>{shop.name.charAt(0).toUpperCase()}</Text></View>}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{shop.name}</Text>
            <Text style={{ color: colors.goldSoft, fontWeight: '600' }}>
              {shop.status === 'active' ? '● Live on Ebenoba GH' : shop.status === 'suspended' ? '● Suspended — contact Ebenoba GH' : '● Waiting for approval'}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/seller/profile')} style={{ padding: 8 }}><Ionicons name="create-outline" size={22} color="#fff" /></Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <Button title="Add product" onPress={() => router.push('/seller/product')} style={{ flex: 1, paddingVertical: 11 }} />
          <Button title="My products" variant="soft" onPress={() => router.push('/seller/products')} style={{ flex: 1, paddingVertical: 11 }} />
        </View>
      </LinearGradient>

      {/* Needs your attention */}
      <Section title="Needs your attention">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12 }}>
          {tile('cube-outline', 'To pack', todo.to_pack, colors.blush, colors.deep, () => router.push('/seller/orders'))}
          {tile('bicycle-outline', 'Ready for pickup', todo.ready, colors.tealSoft, colors.tealText, () => router.push('/seller/orders'))}
          {tile('refresh-outline', 'Open returns', todo.open_returns, colors.goldSoft, colors.goldText, () => router.push('/seller/orders'))}
          {tile('alert-circle-outline', 'Low stock', todo.low_stock, colors.navySoft, colors.navy, () => router.push('/seller/products'))}
        </View>
      </Section>

      {/* Progress: monthly goal */}
      <Section title="This month">
        <View style={{ marginHorizontal: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.sand, borderWidth: 1, borderColor: colors.goldSoft }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Sales so far</Text>
          <Text style={{ fontSize: 26, fontWeight: '900', color: colors.navy }}>{ghs(month?.sales)}</Text>
          {Number(shop.monthly_goal) > 0
            ? <View style={{ marginTop: 8 }}><ProgressBar value={Number(month?.sales ?? 0)} goal={Number(shop.monthly_goal)} />
                <Text style={{ color: colors.muted, fontSize: 12 }}>Goal {ghs(shop.monthly_goal)}</Text></View>
            : <Pressable onPress={() => router.push('/seller/profile')}><Text style={{ color: colors.goldText, fontWeight: '700', marginTop: 6 }}>Set a monthly sales goal →</Text></Pressable>}
        </View>
      </Section>

      {/* Sales graph */}
      <Section title="Sales">
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, marginBottom: 10 }}>
          {RANGES.map((r) => (
            <Pressable key={r} onPress={() => setDays(r)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: days === r ? colors.primary : colors.surface, borderWidth: 1, borderColor: days === r ? colors.primary : colors.border }}>
              <Text style={{ color: days === r ? '#fff' : colors.muted, fontWeight: '700' }}>{r} days</Text></Pressable>))}
        </View>
        <View style={{ marginHorizontal: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border }}>
          {!stats ? <ActivityIndicator color={colors.primary} /> : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                <View><Text style={{ color: colors.muted, fontSize: 12 }}>Sales</Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: colors.navy }}>{ghs(stats.sales)}</Text>
                  <Delta now={Number(stats.sales)} before={Number(stats.prev_sales)} /></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={{ color: colors.muted, fontSize: 12 }}>You earn (after commission)</Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: colors.greenText }}>{ghs(stats.earnings)}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{stats.orders} orders · {stats.units} items</Text></View>
              </View>
              <BarChart data={(stats.series ?? []).map((d: any) => ({ label: shortDay(d.day), value: Number(d.sales), sub: `${d.orders} order${d.orders === 1 ? '' : 's'}` }))} />
            </>)}
        </View>
      </Section>

      {/* Money */}
      <Section title="Your money">
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 12 }}>
          {[['On hold', bal.pending, colors.goldSoft, colors.goldText], ['Ready to pay out', bal.available, colors.successSoft, colors.greenText], ['Paid out', bal.paid_out, colors.navySoft, colors.navy]].map(([l, v, bg, fg]: any) => (
            <View key={l} style={{ flex: 1, backgroundColor: bg, borderRadius: radius.md, padding: 10 }}>
              <Text style={{ color: fg, fontWeight: '700', fontSize: 11 }}>{l}</Text>
              <Text style={{ color: colors.navy, fontWeight: '900', marginTop: 4 }}>{ghs(v)}</Text></View>))}
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, paddingHorizontal: 12, marginTop: 8 }}>
          Earnings are held for a few days after delivery in case of returns, then paid to your MoMo or bank account.</Text>
      </Section>

      {/* Best sellers */}
      <Section title={`Best sellers (${days} days)`}>
        <View style={{ marginHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          {(stats?.top_products ?? []).length === 0
            ? <Text style={{ padding: 16, color: colors.muted }}>Your best sellers will show here after your first sales.</Text>
            : (stats.top_products as any[]).map((p, i) => (
              <View key={p.title} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: i === 0 ? colors.gold : colors.navySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontWeight: '800', color: colors.navy, fontSize: 12 }}>{i + 1}</Text></View>
                <Text numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>{p.title}</Text>
                <View style={{ alignItems: 'flex-end' }}><Text style={{ fontWeight: '800' }}>{ghs(p.revenue)}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{p.units} sold</Text></View>
              </View>))}
        </View>
      </Section>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}
