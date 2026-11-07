import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { colors, radius } from '../../src/lib/theme';
import { dateTime, ghs, STATUS_LABEL, STATUS_TEXT, STATUS_TINT, TIMELINE } from '../../src/lib/format';
import { useCart } from '../../src/state/cart';

// Tracking page: one order, one card per package ("Package 1 of 2"), each with its own live status.
export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cart = useCart();
  const [order, setOrder] = useState<any>(null);
  const [pkgs, setPkgs] = useState<any[]>([]);
  const [pins, setPins] = useState<Record<string, string>>({});

  const load = async () => {
    const [o, p] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('packages').select('*, shops(name), order_items(*), package_status_history(status,created_at)').eq('order_id', id).order('package_index'),
    ]);
    setOrder(o.data); setPkgs(p.data ?? []);
    // Delivery codes: only the buyer can read these (the rider cannot).
    const ids = (p.data ?? []).map((x: any) => x.id);
    if (ids.length) {
      const { data: pn } = await supabase.from('package_pins').select('package_id,pin').in('package_id', ids);
      setPins(Object.fromEntries((pn ?? []).map((x: any) => [x.package_id, x.pin])));
    }
  };

  useEffect(() => {
    load();
    // Live updates when payment is confirmed or a seller/rider/admin changes a package status.
    const ch = supabase.channel('order-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'packages', filter: `order_id=eq.${id}` }, load)
      .subscribe();
    // Safety net while waiting for payment (e.g. realtime blip): re-check every 5 seconds.
    const t = setInterval(() => { if (order?.status === 'awaiting_payment' || !order) load(); }, 5000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [id, order?.status]);

  // Once the order is paid, take exactly what was bought out of the on-device cart.
  useEffect(() => {
    if (order?.status === 'paid') pkgs.forEach((p) => (p.order_items ?? []).forEach((it: any) => cart.remove(it.variant_id)));
  }, [order?.status, pkgs.length]);

  if (!order) return null;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '900', color: colors.navy }}>{order.order_number}</Text>
      <Text style={{ color: colors.muted }}>Placed {dateTime(order.created_at)} · Total {ghs(order.total)}</Text>
      {order.status === 'awaiting_payment' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.goldSoft }}>
          <Ionicons name="time-outline" size={20} color="#B97A00" />
          <Text style={{ flex: 1, color: '#7A5200' }}>Waiting for payment confirmation. If you already approved the MoMo prompt, this updates by itself in a few seconds.</Text>
        </View>)}
      {(order.status === 'cancelled' || order.status === 'expired') && (
        <View style={{ marginTop: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface }}>
          <Text style={{ color: colors.muted }}>This order was not paid and has been cancelled.</Text></View>)}

      {pkgs.map((p, idx) => {
        const reached = new Set((p.package_status_history ?? []).map((h: any) => h.status));
        const when = Object.fromEntries((p.package_status_history ?? []).map((h: any) => [h.status, h.created_at]));
        return (
          <View key={p.id} style={{ marginTop: 16, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: colors.navySoft }}>
              <View><Text style={{ fontWeight: '800', color: colors.navy }}>Package {idx + 1} of {pkgs.length}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Sold by {p.shops?.name}</Text></View>
              <View style={{ backgroundColor: STATUS_TINT(p.status), paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
                <Text style={{ fontWeight: '800', color: STATUS_TEXT(p.status), fontSize: 12 }}>{STATUS_LABEL[p.status] ?? p.status}</Text></View>
            </View>

            <View style={{ padding: 14 }}>
              {(p.order_items ?? []).map((it: any) => (
                <View key={it.id} style={{ flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                  <Image source={{ uri: it.image_url ?? undefined }} style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: colors.sand }} />
                  <Text style={{ flex: 1 }} numberOfLines={2}>{it.quantity} × {it.title}</Text>
                  <Text style={{ fontWeight: '700' }}>{ghs(it.line_total)}</Text>
                </View>))}

              {/* Timeline: teal = done, crimson = where it is now */}
              <View style={{ marginTop: 6 }}>
                {TIMELINE.map((s, i) => {
                  const done = reached.has(s), current = p.status === s;
                  return (
                    <View key={s} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, marginRight: 10, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: current ? colors.primary : done ? colors.teal : colors.border }}>
                        {done && !current && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                      <Text style={{ flex: 1, color: done ? colors.text : colors.muted, fontWeight: current ? '800' : '400' }}>{STATUS_LABEL[s]}</Text>
                      {when[s] && <Text style={{ color: colors.muted, fontSize: 12 }}>{dateTime(when[s])}</Text>}
                    </View>);
                })}
              </View>

              {pins[p.id] && p.delivery_method === 'rider' && ['assigned', 'dispatched', 'in_transit'].includes(p.status) && (
                <View style={{ marginTop: 6, marginBottom: 6, padding: 14, backgroundColor: colors.goldSoft, borderRadius: radius.md, alignItems: 'center' }}>
                  <Text style={{ color: colors.goldText, fontWeight: '800' }}>Your delivery code</Text>
                  <Text style={{ fontSize: 34, fontWeight: '900', letterSpacing: 10, color: colors.navy, marginVertical: 4 }}>{pins[p.id]}</Text>
                  <Text style={{ color: colors.goldText, textAlign: 'center', fontSize: 12 }}>Tell this code to the rider only when you have your items in your hands. Never share it with anyone else.</Text>
                </View>)}

              {(p.courier_name || p.tracking_number) && (
                <View style={{ marginTop: 6, padding: 12, backgroundColor: colors.tealSoft, borderRadius: radius.md, flexDirection: 'row', gap: 10 }}>
                  <Ionicons name="cube-outline" size={20} color={colors.teal} />
                  <View><Text style={{ color: colors.tealText, fontWeight: '800' }}>Courier: {p.courier_name ?? '—'}</Text>
                    {p.tracking_number && <Text style={{ color: colors.tealText }}>Tracking number: {p.tracking_number}</Text>}</View>
                </View>)}
              {p.eta_from && <Text style={{ marginTop: 10, color: colors.tealText, fontWeight: '600' }}>
                <Ionicons name="calendar-outline" size={13} color={colors.teal} /> Estimated delivery: {p.eta_from}{p.eta_to ? ` – ${p.eta_to}` : ''}</Text>}
              <Text style={{ marginTop: 6, color: colors.muted, fontSize: 12 }}>Delivery fee {ghs(p.delivery_fee)}</Text>
            </View>
          </View>);
      })}
    </ScrollView>
  );
}
