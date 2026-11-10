import React from 'react';
import { FlatList, Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../../src/state/cart';
import { useAuth } from '../../src/state/auth';
import { colors, radius } from '../../src/lib/theme';
import { ghs } from '../../src/lib/format';
import { Button, Empty } from '../../src/components/ui';

export default function Cart() {
  const { items, subtotal, setQty, remove } = useCart();
  const { session } = useAuth();

  if (!items.length) return <Empty text="Your cart is empty. Browse products and tap “Add to cart”." />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList data={items} keyExtractor={(i) => i.variantId} contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', gap: 12, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10 }}>
            <Image source={{ uri: item.image ?? undefined }} style={{ width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.surface }} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={{ fontWeight: '600' }}>{item.title}</Text>
              {item.variantLabel !== 'Default' && <Text style={{ color: colors.muted, fontSize: 12 }}>{item.variantLabel}</Text>}
              <Text style={{ color: colors.primary, fontWeight: '800', marginTop: 4 }}>{ghs(item.price)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 14 }}>
                <Pressable onPress={() => setQty(item.variantId, item.qty - 1)} style={q}><Text style={qt}>−</Text></Pressable>
                <Text style={{ fontWeight: '700' }}>{item.qty}</Text>
                <Pressable onPress={() => setQty(item.variantId, item.qty + 1)} style={q}><Text style={qt}>+</Text></Pressable>
                <Pressable onPress={() => remove(item.variantId)} style={{ marginLeft: 'auto' }}><Text style={{ color: colors.muted }}>Remove</Text></Pressable>
              </View>
            </View>
          </View>
        )} />
      <View style={{ padding: 16, borderTopWidth: 1, borderColor: colors.border, backgroundColor: '#fff' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.muted }}>Subtotal</Text><Text style={{ fontWeight: '800', fontSize: 18 }}>{ghs(subtotal)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 8, padding: 8, backgroundColor: colors.tealSoft, borderRadius: radius.sm }}>
          <Ionicons name="bicycle-outline" size={16} color={colors.teal} />
          <Text style={{ color: colors.tealText, fontSize: 12, fontWeight: '600', flex: 1 }}>Delivery is calculated per package at checkout.</Text>
        </View>
        <Button title={session ? 'Checkout' : 'Sign in to checkout'} onPress={() => router.push(session ? '/checkout' : '/login')} />
      </View>
    </View>
  );
}
const q = { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.blush, alignItems: 'center', justifyContent: 'center' } as const;
const qt = { color: colors.primary, fontWeight: '800', fontSize: 18 } as const;
