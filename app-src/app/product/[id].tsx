import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Image, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { colors, radius } from '../../src/lib/theme';
import { ghs } from '../../src/lib/format';
import { Button, Section } from '../../src/components/ui';
import { ProductCard } from '../../src/components/ProductCard';
import { useCart } from '../../src/state/cart';
import { useAuth } from '../../src/state/auth';
import { track } from '../../src/lib/tracking';

const W = Dimensions.get('window').width;
const SLOT_LABEL: Record<string, string> = { in_use: 'Out of the box / in use', box: 'In the box' };

export default function ProductPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const cart = useCart();
  const [p, setP] = useState<any>(null);
  const [media, setMedia] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [wished, setWished] = useState(false);
  const [page, setPage] = useState(0);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    (async () => {
      const [f, m, v, r] = await Promise.all([
        supabase.from('product_feed').select('*').eq('id', id).single(),
        supabase.from('product_media').select('*').eq('product_id', id).order('position'),
        supabase.from('product_variants').select('*').eq('product_id', id).eq('is_active', true),
        supabase.rpc('related_products', { p_product: id, p_limit: 10 }),
      ]);
      setP(f.data); setMedia(m.data ?? []); setVariants(v.data ?? []); setRelated((r.data as any) ?? []);
      const first = (v.data ?? []).find((x: any) => x.stock_qty > 0) ?? (v.data ?? [])[0];
      setSel(first?.id ?? null);
      if (session) {
        const w = await supabase.from('wishlist_items').select('product_id').eq('product_id', id).maybeSingle();
        setWished(!!w.data);
      }
    })();
  }, [id, session?.user.id]);

  // Dwell time: how long the shopper stayed on this product.
  useEffect(() => {
    openedAt.current = Date.now();
    return () => {
      const secs = Math.round((Date.now() - openedAt.current) / 1000);
      if (secs >= 2) track({ event_type: 'view', product_id: id, category_id: p?.category_id, duration_seconds: Math.min(secs, 3600) });
    };
  }, [id, p?.category_id]);

  if (!p) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const gallery = media.length ? media : [{ id: 'x', url: p.image_url, slot: 'view' }];
  const variant = variants.find((v) => v.id === sel);
  const unit = variant?.price_override ?? p.display_price;
  const off = p.price > 0 ? Math.round((1 - p.display_price / p.price) * 100) : 0;
  const outOfStock = !variant || variant.stock_qty <= 0;

  const addToCart = () => {
    if (!variant) return;
    cart.add({ variantId: variant.id, productId: p.id, title: p.title, variantLabel: variant.label, price: unit,
      image: p.image_url, stock: variant.stock_qty, shopName: p.shop_name });
    track({ event_type: 'cart_add', product_id: p.id, category_id: p.category_id });
    Alert.alert('Added to cart', p.title, [{ text: 'Keep shopping' }, { text: 'View cart', onPress: () => router.push('/cart') }]);
  };

  const toggleWish = async () => {
    if (!session) return router.push('/login');
    if (wished) await supabase.from('wishlist_items').delete().eq('product_id', p.id).eq('user_id', session.user.id);
    else { await supabase.from('wishlist_items').insert({ user_id: session.user.id, product_id: p.id }); track({ event_type: 'wishlist_add', product_id: p.id, category_id: p.category_id }); }
    setWished(!wished);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView>
        <View>
          <FlatList horizontal pagingEnabled showsHorizontalScrollIndicator={false} data={gallery}
            keyExtractor={(m) => m.id} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
            renderItem={({ item }) => <Image source={{ uri: item.url }} style={{ width: W, height: W, backgroundColor: colors.surface }} resizeMode="contain" />} />
          {!!SLOT_LABEL[gallery[page]?.slot] && (
            <View style={{ position: 'absolute', left: 12, bottom: 12, backgroundColor: 'rgba(31,26,27,0.75)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{SLOT_LABEL[gallery[page].slot]}</Text></View>)}
          {gallery.length > 1 && (
            <View style={{ position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(31,26,27,0.75)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{page + 1}/{gallery.length}</Text></View>)}
        </View>

        <View style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: colors.text }}>{p.title}</Text>
            <Pressable onPress={toggleWish} hitSlop={12}><Ionicons name={wished ? 'heart' : 'heart-outline'} size={26} color={colors.primary} /></Pressable>
            <Pressable onPress={() => Share.share({ message: `${p.title} — ${ghs(p.display_price)} on Ebenoba GH` })} hitSlop={12} style={{ marginLeft: 14 }}>
              <Ionicons name="share-outline" size={26} color={colors.deep} /></Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8, gap: 10 }}>
            <Text style={{ fontSize: 26, fontWeight: '900', color: colors.primary }}>{ghs(unit)}</Text>
            {off > 0 && <Text style={{ color: colors.muted, textDecorationLine: 'line-through' }}>{ghs(p.price)}</Text>}
            {off > 0 && <View style={{ backgroundColor: colors.blush, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: colors.primary, fontWeight: '800' }}>-{off}%</Text></View>}
          </View>

          {/* Shop only appears here, as in Jumia: "Sold by" */}
          <View style={{ marginTop: 12, padding: 12, backgroundColor: colors.navySoft, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="storefront-outline" size={19} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Sold by</Text>
              <Text style={{ fontWeight: '800', color: colors.navy }}>{p.shop_name}</Text></View>
            {p.shop_rating > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="star" size={14} color={colors.gold} /><Text style={{ fontWeight: '700', color: colors.navy }}>{Number(p.shop_rating).toFixed(1)}</Text></View>}
          </View>
          <View style={{ marginTop: 8, padding: 10, backgroundColor: colors.tealSoft, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="bicycle-outline" size={18} color={colors.teal} />
            <Text style={{ color: colors.tealText, fontWeight: '600', flex: 1 }}>Delivery to your door · pay with MoMo or card</Text>
          </View>

          {variants.length > 1 && (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontWeight: '700', marginBottom: 8 }}>Options</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {variants.map((v) => (
                  <Pressable key={v.id} disabled={v.stock_qty <= 0} onPress={() => setSel(v.id)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5,
                      borderColor: sel === v.id ? colors.primary : colors.border, backgroundColor: sel === v.id ? colors.blush : '#fff', opacity: v.stock_qty <= 0 ? 0.4 : 1 }}>
                    <Text style={{ color: sel === v.id ? colors.primary : colors.text, fontWeight: '600' }}>{v.label}</Text>
                  </Pressable>))}
              </View>
            </View>)}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill,
              backgroundColor: outOfStock ? colors.blush : variant.stock_qty <= 5 ? colors.goldSoft : colors.successSoft }}>
              <Text style={{ fontWeight: '800', fontSize: 12, color: outOfStock ? colors.primary : variant.stock_qty <= 5 ? colors.goldText : colors.greenText }}>
                {outOfStock ? 'Out of stock' : variant.stock_qty <= 5 ? `Only ${variant.stock_qty} left` : 'In stock'}</Text></View>
            {p.rating_count > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="star" size={14} color={colors.gold} /><Text style={{ color: colors.muted }}>{Number(p.rating_avg).toFixed(1)} ({p.rating_count})</Text></View>}
          </View>

          {!!p.description && <><Text style={{ fontWeight: '800', marginTop: 20, color: colors.deep }}>Description</Text>
            <Text style={{ color: colors.text, marginTop: 6, lineHeight: 21 }}>{p.description}</Text></>}

          {p.specs && Object.keys(p.specs).length > 0 && <><Text style={{ fontWeight: '800', marginTop: 20, color: colors.deep }}>Specifications</Text>
            {Object.entries(p.specs).map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.border }}>
                <Text style={{ width: 130, color: colors.muted }}>{k}</Text><Text style={{ flex: 1 }}>{String(v)}</Text></View>))}</>}
        </View>

        {related.length > 0 && <Section title="You may also like">
          <FlatList horizontal data={related} keyExtractor={(r) => r.id} contentContainerStyle={{ paddingHorizontal: 8 }} showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => <ProductCard p={item} width={150} />} /></Section>}
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: colors.border }}>
        <Button title={outOfStock ? 'Out of stock' : 'Add to cart'} disabled={outOfStock} onPress={addToCart} />
      </View>
    </View>
  );
}
