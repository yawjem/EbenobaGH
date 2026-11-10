import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../lib/theme';
import { ghs } from '../lib/format';

export type FeedProduct = {
  id: string; title: string; price: number; display_price: number;
  image_url: string | null; in_stock: boolean; rating_avg: number; rating_count: number;
};

// Every tile in the app (home, search, wishlist, recommendations…) opens the same product page.
export function ProductCard({ p, width }: { p: FeedProduct; width?: number }) {
  const off = p.price > 0 ? Math.round((1 - p.display_price / p.price) * 100) : 0;
  return (
    <Pressable style={[s.card, width ? { width } : { flex: 1 }]} onPress={() => router.push(`/product/${p.id}`)}>
      <View>
        <Image source={{ uri: p.image_url ?? undefined }} style={s.img} />
        {off > 0 && <View style={s.badge}><Text style={s.badgeText}>-{off}%</Text></View>}
        {!p.in_stock && <View style={s.sold}><Text style={s.soldText}>Out of stock</Text></View>}
      </View>
      <Text numberOfLines={2} style={s.title}>{p.title}</Text>
      <Text style={s.price}>{ghs(p.display_price)}</Text>
      {off > 0 && <Text style={s.old}>{ghs(p.price)}</Text>}
      {p.rating_count > 0 && (
        <View style={s.ratingRow}>
          <Ionicons name="star" size={12} color={colors.gold} />
          <Text style={s.rating}>{Number(p.rating_avg).toFixed(1)} ({p.rating_count})</Text>
        </View>)}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 8, margin: 4 },
  img: { width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.sand },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  sold: { position: 'absolute', bottom: 6, left: 6, backgroundColor: colors.navy, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  soldText: { color: '#fff', fontSize: 11 },
  title: { color: colors.text, fontSize: 13, marginTop: 8, minHeight: 34 },
  price: { color: colors.primary, fontWeight: '800', fontSize: 15, marginTop: 4 },
  old: { color: colors.muted, textDecorationLine: 'line-through', fontSize: 12 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  rating: { color: colors.muted, fontSize: 11 },
});
