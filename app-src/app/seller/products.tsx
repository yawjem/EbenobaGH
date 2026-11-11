import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useMyShop } from '../../src/lib/seller';
import { colors, radius } from '../../src/lib/theme';
import { ghs } from '../../src/lib/format';
import { Button, Empty } from '../../src/components/ui';
import { column } from '../../src/lib/responsive';

export default function SellerProducts() {
  const { shop } = useMyShop();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!shop) return;
    const { data } = await supabase.from('products')
      .select('id,title,price,sale_price,status,product_media(url,is_primary,position),product_variants(stock_qty,is_active)')
      .eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(300);
    setRows(data ?? []); setLoading(false);
  }, [shop?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : (
        <FlatList data={rows} keyExtractor={(p) => p.id} contentContainerStyle={{ ...column, padding: 12, paddingBottom: 90 }}
          ListEmptyComponent={<Empty text="No products yet. Tap “Add product” to list your first item." />}
          renderItem={({ item: p }) => {
            const media = [...(p.product_media ?? [])].sort((a: any, b: any) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position)[0];
            const stock = (p.product_variants ?? []).filter((v: any) => v.is_active).reduce((n: number, v: any) => n + v.stock_qty, 0);
            const low = p.status === 'active' && stock <= 3;
            return (
              <Pressable onPress={() => router.push({ pathname: '/seller/product', params: { id: p.id } })} style={{ flexDirection: 'row', gap: 12, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10 }}>
                {media ? <Image source={{ uri: media.url }} style={{ width: 70, height: 70, borderRadius: radius.sm, backgroundColor: colors.surface }} />
                  : <View style={{ width: 70, height: 70, borderRadius: radius.sm, backgroundColor: colors.blush, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="image-outline" size={24} color={colors.primary} /></View>}
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={{ fontWeight: '700' }}>{p.title}</Text>
                  <Text style={{ marginTop: 2 }}><Text style={{ color: colors.primary, fontWeight: '800' }}>{ghs(p.sale_price ?? p.price)}</Text>
                    {p.sale_price ? <Text style={{ color: colors.muted, textDecorationLine: 'line-through' }}>  {ghs(p.price)}</Text> : null}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: p.status === 'active' ? colors.successSoft : colors.goldSoft }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: p.status === 'active' ? colors.greenText : colors.goldText }}>{p.status === 'active' ? 'Live' : p.status === 'draft' ? 'Hidden' : 'Archived'}</Text></View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: stock === 0 ? colors.blush : low ? colors.goldSoft : colors.navySoft }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: stock === 0 ? colors.deep : low ? colors.goldText : colors.navy }}>{stock === 0 ? 'Out of stock' : `${stock} in stock`}</Text></View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ alignSelf: 'center' }} />
              </Pressable>);
          }} />)}
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: 16 }}>
        <Button title="Add product" onPress={() => router.push('/seller/product')} />
      </View>
    </View>
  );
}
