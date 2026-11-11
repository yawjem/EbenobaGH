import React, { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, tileTints } from '../../src/lib/theme';
import { categoryIcon } from '../../src/lib/categoryIcon';
import { ProductCard, FeedProduct } from '../../src/components/ProductCard';
import { Section } from '../../src/components/ui';
import { useAuth } from '../../src/state/auth';
import { useResponsive } from '../../src/lib/responsive';

const COLS = 'id,title,price,display_price,image_url,in_stock,rating_avg,rating_count';

export default function Home() {
  const { session } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [recommended, setRecommended] = useState<FeedProduct[]>([]);
  const [deals, setDeals] = useState<FeedProduct[]>([]);
  const [fresh, setFresh] = useState<FeedProduct[]>([]);
  const [featured, setFeatured] = useState<FeedProduct[]>([]);
  const [q, setQ] = useState('');

  const load = async () => {
    const nowIso = new Date().toISOString();
    const [c, f, n, d, k] = await Promise.all([
      supabase.from('campaigns').select('id,name,banner_url').eq('is_active', true).lte('starts_at', nowIso).gte('ends_at', nowIso),
      supabase.from('product_feed').select(COLS).eq('is_featured', true).limit(10),
      supabase.from('product_feed').select(COLS).order('created_at', { ascending: false }).limit(10),
      supabase.from('product_feed').select(COLS).limit(60),
      supabase.from('categories').select('id,name').is('parent_id', null).order('position').limit(12),
    ]);
    setCampaigns(c.data ?? []); setCats(k.data ?? []);
    setFeatured((f.data as any) ?? []); setFresh((n.data as any) ?? []);
    // "Hot deals" = biggest % off among a recent slice
    setDeals(((d.data as any[]) ?? []).filter((p) => p.display_price < p.price)
      .sort((a, b) => (b.price - b.display_price) / b.price - (a.price - a.display_price) / a.price).slice(0, 10));
    if (session) { const r = await supabase.rpc('recommended_products', { p_limit: 10 }); setRecommended((r.data as any) ?? []); }
    else setRecommended([]);
  };

  useFocusEffect(useCallback(() => { load(); }, [session?.user.id]));

  const { card, banner } = useResponsive();
  const row = (data: FeedProduct[]) => (
    <FlatList horizontal data={data} keyExtractor={(p) => p.id} showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 8 }} renderItem={({ item }) => <ProductCard p={item} width={card} />} />
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}>
        <View style={{ paddingHorizontal: 12, paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 44, height: 44 }} resizeMode="contain" />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 }}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search products" placeholderTextColor={colors.muted} returnKeyType="search"
              onSubmitEditing={() => router.push({ pathname: '/explore', params: { q } })} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8 }} />
          </View>
        </View>

        {/* Promo banners: crimson gradient with a gold accent */}
        {campaigns.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 10 }}>
            {campaigns.map((c) => (
              <Pressable key={c.id} onPress={() => router.push(`/campaign/${c.id}`)} accessibilityRole="button" accessibilityLabel={`${c.name} offers`}>
              <LinearGradient colors={[colors.primary, colors.darkest]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: banner, height: 120, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'center', padding: 16 }}>
                {c.banner_url ? <Image source={{ uri: c.banner_url }} style={{ position: 'absolute', width: '100%', height: '100%' }} /> : null}
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>{c.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Ionicons name="flash" size={16} color={colors.goldSoft} /><Text style={{ color: colors.goldSoft, fontWeight: '700' }}>See all offers</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.goldSoft} />
                </View>
              </LinearGradient>
              </Pressable>))}
          </ScrollView>)}

        {/* Category tiles, each with its own tint */}
        {cats.length > 0 && (
          <Section title="Shop by category">
            <FlatList horizontal data={cats} keyExtractor={(c) => c.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 12 }}
              renderItem={({ item, index }) => {
                const t = tileTints[index % tileTints.length];
                return (
                  <Pressable onPress={() => router.push({ pathname: '/explore', params: { cat: item.id } })} style={{ alignItems: 'center', width: 76 }}>
                    <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={categoryIcon(item.name) as any} size={28} color={t.fg} />
                    </View>
                    <Text numberOfLines={2} style={{ marginTop: 6, fontSize: 12, textAlign: 'center', color: colors.text }}>{item.name}</Text>
                  </Pressable>);
              }} />
          </Section>)}

        {recommended.length > 0 && <Section title="Picked for you">{row(recommended)}</Section>}

        {/* Dark navy feature band so the page has rhythm, not one flat white scroll */}
        {deals.length > 0 && (
          <View style={{ marginTop: 20, backgroundColor: colors.navy, paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, marginBottom: 8 }}>
              <Ionicons name="flame" size={20} color={colors.gold} />
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>Hot deals</Text>
            </View>
            {row(deals)}
          </View>)}

        {featured.length > 0 && (
          <Section title="Featured" action={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.goldSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
            <Ionicons name="star" size={12} color="#B97A00" /><Text style={{ color: colors.goldText, fontSize: 12, fontWeight: '700' }}>Top picks</Text></View>}>
            {row(featured)}</Section>)}

        <Section title="New arrivals" action={<View style={{ backgroundColor: colors.tealSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
          <Text style={{ color: colors.tealText, fontSize: 12, fontWeight: '700' }}>Just in</Text></View>}>{row(fresh)}</Section>

        {/* Trust strip */}
        <View style={{ flexDirection: 'row', margin: 12, marginTop: 20, backgroundColor: colors.tealSoft, borderRadius: radius.lg, padding: 14, justifyContent: 'space-around' }}>
          {[['shield-checkmark-outline', 'Secure pay'], ['bicycle-outline', 'Fast delivery'], ['refresh-outline', '7-day returns']].map(([icon, label]) => (
            <View key={label} style={{ alignItems: 'center', gap: 4 }}><Ionicons name={icon as any} size={22} color={colors.teal} />
              <Text style={{ color: colors.tealText, fontWeight: '700', fontSize: 12 }}>{label}</Text></View>))}
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
