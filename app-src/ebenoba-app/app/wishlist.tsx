import React, { useCallback, useState } from 'react';
import { FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { ProductCard } from '../src/components/ProductCard';
import { Empty } from '../src/components/ui';
import { colors } from '../src/lib/theme';

export default function Wishlist() {
  const [items, setItems] = useState<any[]>([]);
  useFocusEffect(useCallback(() => {
    (async () => {
      const w = await supabase.from('wishlist_items').select('product_id').order('created_at', { ascending: false });
      const ids = (w.data ?? []).map((x: any) => x.product_id);
      if (!ids.length) return setItems([]);
      const { data } = await supabase.from('product_feed').select('id,title,price,display_price,image_url,in_stock,rating_avg,rating_count').in('id', ids);
      setItems(data ?? []);
    })();
  }, []));
  return <FlatList style={{ backgroundColor: colors.bg }} data={items} numColumns={2} keyExtractor={(p) => p.id} contentContainerStyle={{ padding: 8 }}
    renderItem={({ item }) => <ProductCard p={item} />} ListEmptyComponent={<Empty text="Tap the heart on a product to save it here." />} />;
}
