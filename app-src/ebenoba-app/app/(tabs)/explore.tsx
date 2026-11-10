import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { colors, radius } from '../../src/lib/theme';
import { ProductCard, FeedProduct } from '../../src/components/ProductCard';
import { Empty } from '../../src/components/ui';
import { track } from '../../src/lib/tracking';

const COLS = 'id,title,price,display_price,image_url,in_stock,rating_avg,rating_count,category_id';
const SORTS = [
  { key: 'new', label: 'Newest' }, { key: 'low', label: 'Price ↑' }, { key: 'high', label: 'Price ↓' },
];

export default function Explore() {
  const params = useLocalSearchParams<{ q?: string; cat?: string }>();
  const [q, setQ] = useState(params.q ?? '');
  const [cats, setCats] = useState<any[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [sort, setSort] = useState('new');
  const [inStock, setInStock] = useState(false);
  const [items, setItems] = useState<FeedProduct[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (params.q) setQ(params.q); }, [params.q]);
  useEffect(() => { if (params.cat) setCat(params.cat); }, [params.cat]);
  useEffect(() => { supabase.from('categories').select('id,name,parent_id').order('position').then(({ data }) => setCats(data ?? [])); }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      let qb = supabase.from('product_feed').select(COLS);
      const term = q.trim().replace(/[%,()]/g, ' ');
      if (term) qb = qb.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
      if (cat) {
        const ids = [cat, ...cats.filter((c) => c.parent_id === cat).map((c) => c.id)];
        qb = qb.in('category_id', ids);
      }
      if (inStock) qb = qb.eq('in_stock', true);
      qb = sort === 'low' ? qb.order('display_price', { ascending: true })
        : sort === 'high' ? qb.order('display_price', { ascending: false })
        : qb.order('created_at', { ascending: false });
      const { data } = await qb.limit(60);
      setItems((data as any) ?? []);
      setLoading(false);
      if (term.length > 2) track({ event_type: 'search', search_query: term });
    }, 400);
    return () => clearTimeout(t);
  }, [q, cat, sort, inStock, cats.length]);

  const parents = cats.filter((c) => !c.parent_id);
  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <Pressable key={key} onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, marginRight: 8,
      backgroundColor: active ? colors.primary : colors.blush }}>
      <Text style={{ color: active ? '#fff' : colors.deep, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 12 }}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search by name or description" placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colors.border }} />
        <FlatList horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} data={[{ id: null, name: 'All' }, ...parents]}
          keyExtractor={(c) => String(c.id)} renderItem={({ item }) => chip(item.name, cat === item.id, () => setCat(item.id), String(item.id))} />
        <FlatList horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}
          data={[...SORTS.map((s) => ({ ...s, kind: 'sort' })), { key: 'stock', label: 'In stock only', kind: 'stock' }]} keyExtractor={(s) => s.key}
          renderItem={({ item }) => item.kind === 'sort'
            ? chip(item.label, sort === item.key, () => setSort(item.key), item.key)
            : chip(item.label, inStock, () => setInStock((v) => !v), item.key)} />
      </View>
      <FlatList data={items} numColumns={2} keyExtractor={(p) => p.id} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 24 }}
        renderItem={({ item }) => <ProductCard p={item} />} refreshing={loading} onRefresh={() => setQ((v) => v + '')}
        ListEmptyComponent={loading ? null : <Empty text="No products found. Try another word or category." />} />
    </View>
  );
}
