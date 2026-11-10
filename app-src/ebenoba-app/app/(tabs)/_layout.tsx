import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/lib/theme';
import { useCart } from '../../src/state/cart';
import { useAuth } from '../../src/state/auth';

export default function TabsLayout() {
  const { count } = useCart();
  const { profile } = useAuth();
  const isSeller = profile?.role === 'seller'; // My Shop appears only after an admin approves the application
  const icon = (name: any) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} size={size} color={color} />;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, headerTintColor: colors.deep }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore', tabBarIcon: icon('search-outline') }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarIcon: icon('cart-outline'),
        tabBarBadge: count > 0 ? count : undefined, tabBarBadgeStyle: { backgroundColor: colors.primary } }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen name="shop" options={{ title: 'My Shop', headerShown: false, tabBarIcon: icon('storefront-outline'),
        href: isSeller ? undefined : null, tabBarActiveTintColor: colors.navy }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-outline') }} />
    </Tabs>
  );
}
