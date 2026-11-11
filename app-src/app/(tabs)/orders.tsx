import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/state/auth';
import { colors, radius } from '../../src/lib/theme';
import { dateTime, ghs, STATUS_LABEL, STATUS_TEXT, STATUS_TINT } from '../../src/lib/format';
import { Button, Empty } from '../../src/components/ui';
import { column } from '../../src/lib/responsive';

export default function Orders() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);

  useFocusEffect(useCallback(() => {
    if (!session) return;
    supabase.from('orders').select('id,order_number,total,status,created_at,packages(id,status)')
      .order('created_at', { ascending: false }).then(({ data }) => setOrders(data ?? []));
  }, [session?.user.id]));

  if (!session) return <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}><Empty text="Sign in to see your orders." /><Button title="Sign in" onPress={() => router.push('/login')} /></View>;
  if (!orders.length) return <Empty text="No orders yet." />;

  return (
    <FlatList data={orders} keyExtractor={(o) => o.id} contentContainerStyle={{ ...column, padding: 12 }} style={{ backgroundColor: colors.bg }}
      renderItem={({ item: o }) => {
        const pkgs = o.packages ?? [];
        const st = o.status !== 'paid' ? o.status : (pkgs.every((p: any) => p.status === 'delivered') ? 'delivered' : pkgs[0]?.status ?? 'paid');
        return (
          <Pressable onPress={() => router.push(`/order/${o.id}`)} style={{ padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontWeight: '800', color: colors.navy }}>{o.order_number}</Text>
              <View style={{ backgroundColor: STATUS_TINT(st), paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill }}>
                <Text style={{ color: STATUS_TEXT(st), fontWeight: '800', fontSize: 12 }}>{STATUS_LABEL[st] ?? st.replace('_', ' ')}</Text></View>
            </View>
            <Text style={{ color: colors.muted, marginTop: 4 }}>{dateTime(o.created_at)} · {pkgs.length} package{pkgs.length === 1 ? '' : 's'}</Text>
            <Text style={{ marginTop: 6, fontWeight: '700', color: colors.primary }}>{ghs(o.total)}</Text>
          </Pressable>);
      }} />
  );
}
