// "See all" page for an offer banner: every product the offer applies to, biggest discount first.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { colors, radius } from '../../src/lib/theme';
import { ProductCard, FeedProduct } from '../../src/components/ProductCard';
import { Empty } from '../../src/components/ui';
import { useResponsive } from '../../src/lib/responsive';

export default function Campaign() {
  const { cols } = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState('Offers');
  const [items, setItems] = useState<FeedProduct[] | null>(null);

  useEffect(() => {
    (async () => {
      const [c, p] = await Promise.all([
        supabase.from('campaigns').select('name').eq('id', id).maybeSingle(),
        supabase.rpc('campaign_products', { p_campaign: id, p_limit: 120 }),
      ]);
      if (c.data?.name) setName(c.data.name);
      setItems((p.data as any) ?? []);
    })();
  }, [id]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: name }} />
      {items === null ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        : !items.length ? <Empty text="This offer has ended or has no products right now." />
        : (
          <FlatList key={`c${cols}`} data={items} keyExtractor={(p) => p.id} numColumns={cols}
            columnWrapperStyle={{ gap: 8, paddingHorizontal: 12 }} contentContainerStyle={{ paddingBottom: 24 }}
            ListHeaderComponent={
              <View style={{ margin: 12, padding: 12, backgroundColor: colors.blush, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="pricetag" size={18} color={colors.primary} />
                <Text style={{ color: colors.deep, fontWeight: '700', flex: 1 }}>{items.length} product{items.length === 1 ? '' : 's'} on {name}</Text>
              </View>}
            renderItem={({ item }) => <ProductCard p={item} />} />)}
    </View>
  );
}
