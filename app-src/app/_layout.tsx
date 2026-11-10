import React, { useEffect, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/state/auth';
import { CartProvider } from '../src/state/cart';
import { loadTrackingState, setConsent } from '../src/lib/tracking';
import { Button } from '../src/components/ui';
import { colors } from '../src/lib/theme';
import { getNotifications } from '../src/lib/notifications';

export default function RootLayout() {
  const [askConsent, setAskConsent] = useState(false);

  useEffect(() => {
    loadTrackingState().then((c) => { if (c === null) setAskConsent(true); });
  }, []);

  // Tapping a notification opens the order or product it is about.
  useEffect(() => {
    const Notifications = getNotifications();
    if (!Notifications) return; // Expo Go has no push
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const d: any = r.notification.request.content.data ?? {};
      if (d.kind === 'seller_new_order') router.push('/seller/orders');
      else if (d.kind === 'seller_approved') router.push('/shop');
      else if (d.order_id) router.push(`/order/${d.order_id}`);
      else if (d.product_id) router.push(`/product/${d.product_id}`);
    });
    return () => sub.remove();
  }, []);

  const answer = async (v: 'yes' | 'no') => { await setConsent(v); setAskConsent(false); };

  return (
    <AuthProvider>
      <CartProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerTintColor: colors.deep, headerTitleStyle: { color: colors.text }, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="product/[id]" options={{ title: '' }} />
          <Stack.Screen name="order/[id]" options={{ title: 'Order tracking' }} />
          <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
          <Stack.Screen name="login" options={{ title: 'Sign in', presentation: 'modal' }} />
          <Stack.Screen name="wishlist" options={{ title: 'Wishlist' }} />
          <Stack.Screen name="seller/apply" options={{ title: 'Sell on Ebenoba GH' }} />
          <Stack.Screen name="seller/profile" options={{ title: 'Business profile' }} />
          <Stack.Screen name="seller/products" options={{ title: 'My products' }} />
          <Stack.Screen name="seller/product" options={{ title: 'Product' }} />
          <Stack.Screen name="seller/orders" options={{ title: 'Shop orders' }} />
        </Stack>

        <Modal visible={askConsent} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.deep }}>Better picks, fewer annoyances</Text>
              <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>
                Ebenoba GH can remember what you look at and search for, so we can recommend products you may like and
                tell you when they go on sale — never more than a few times a week. You can turn this off any time in Account.
              </Text>
              <Button title="Allow" onPress={() => answer('yes')} style={{ marginTop: 16 }} />
              <Button title="No thanks" variant="soft" onPress={() => answer('no')} style={{ marginTop: 8 }} />
            </View>
          </View>
        </Modal>
      </CartProvider>
    </AuthProvider>
  );
}
