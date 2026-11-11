import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useMyShop } from '../../src/lib/seller';
import { colors, radius } from '../../src/lib/theme';
import { dateTime, ghs, STATUS_LABEL, STATUS_TEXT, STATUS_TINT } from '../../src/lib/format';
import { Button, Empty } from '../../src/components/ui';
import { column } from '../../src/lib/responsive';

const TABS: [string, string[]][] = [
  ['To pack', ['paid', 'processing']],
  ['Ready', ['ready', 'assigned']],
  ['On the way', ['dispatched', 'in_transit', 'awaiting_pickup']],
  ['Done', ['delivered', 'completed']],
  ['Returns', []],
];
const REASON: Record<string, string> = { defective: 'Item is defective', wrong_item: 'Wrong item sent', not_as_described: 'Not as described', changed_mind: 'Changed their mind', other: 'Other' };

export default function SellerOrders() {
  const { shop } = useMyShop();
  const [tab, setTab] = useState(0);
  const [pkgs, setPkgs] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<any>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!shop) return;
    const [p, r] = await Promise.all([
      supabase.from('packages').select('id,order_number,status,subtotal,shop_earnings,ship_to,created_at,courier_name,tracking_number,delivery_method,order_items(title,quantity,variant_label)')
        .eq('shop_id', shop.id).neq('status', 'new').order('created_at', { ascending: false }).limit(200),
      supabase.from('return_requests').select('id,reason,details,status,created_at,seller_due_at,packages(order_number),order_items(title,quantity)')
        .eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(100),
    ]);
    setPkgs(p.data ?? []); setReturns(r.data ?? []); setLoading(false);
  }, [shop?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    const { error } = await supabase.from('packages').update({ status }).eq('id', id);
    setBusy(null);
    if (error) return Alert.alert('Could not update', error.message);
    load();
  };
  const cancel = (p: any) => Alert.alert('Cancel this package?',
    'Use this only if you cannot supply the items. The customer will be told, and Ebenoba GH will refund them.',
    [{ text: 'Keep it' }, { text: 'Cancel package', style: 'destructive', onPress: () => setStatus(p.id, 'cancelled') }]);

  const answer = async (r: any, status: 'approved' | 'rejected') => {
    const go = async (note?: string) => {
      setBusy(r.id);
      const { error } = await supabase.from('return_requests').update({ status, seller_note: note ?? null }).eq('id', r.id);
      setBusy(null);
      if (error) return Alert.alert('Could not update', error.message);
      load();
    };
    if (status === 'approved') return go('Approved');
    setReason(''); setRejecting(r); // works on Android and iOS (Alert.prompt is iOS-only)
  };
  const confirmReject = async () => {
    const r = rejecting; if (!r) return;
    if (!reason.trim()) return Alert.alert('Add a reason', 'Tell the customer why the return is rejected.');
    setRejecting(null); setBusy(r.id);
    const { error } = await supabase.from('return_requests').update({ status: 'rejected', seller_note: reason.trim() }).eq('id', r.id);
    setBusy(null);
    if (error) return Alert.alert('Could not update', error.message);
    load();
  };

  const statuses = TABS[tab][1];
  const term = q.trim().toLowerCase();
  const shown = pkgs.filter((p) => (term ? p.order_number?.toLowerCase().includes(term) : statuses.includes(p.status)));
  const newReturns = returns.filter((r) => r.status === 'requested').length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TextInput value={q} onChangeText={setQ} placeholder="Find by order number, e.g. EB-261106-10000" placeholderTextColor={colors.muted} autoCapitalize="characters"
        style={{ margin: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface }} />
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, flexWrap: 'wrap' }}>
        {TABS.map(([name, st], i) => {
          const n = st.length ? pkgs.filter((p) => st.includes(p.status)).length : newReturns;
          return (
            <Pressable key={name} onPress={() => { setTab(i); setQ(''); }} style={{ margin: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: tab === i && !term ? colors.navy : colors.surface, borderWidth: 1, borderColor: tab === i && !term ? colors.navy : colors.border }}>
              <Text style={{ color: tab === i && !term ? '#fff' : colors.muted, fontWeight: '700' }}>{name}{n ? ` (${n})` : ''}</Text></Pressable>);
        })}
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} /> : tab === 4 && !term ? (
        <FlatList data={returns} keyExtractor={(r) => r.id} contentContainerStyle={{ ...column, padding: 12 }} ListEmptyComponent={<Empty text="No return requests." />}
          renderItem={({ item: r }) => (
            <View style={{ padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10 }}>
              <Text style={{ fontWeight: '800' }}>{r.packages?.order_number} · {r.order_items?.title ?? 'Item'} × {r.order_items?.quantity ?? 1}</Text>
              <Text style={{ color: colors.deep, fontWeight: '700', marginTop: 4 }}>{REASON[r.reason] ?? r.reason}</Text>
              {r.details ? <Text style={{ color: colors.muted, marginTop: 2 }}>{r.details}</Text> : null}
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Status: {r.status.replace('_', ' ')}{r.status === 'requested' && r.seller_due_at ? ` · reply by ${dateTime(r.seller_due_at)}` : ''}</Text>
              {r.status === 'requested' && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <Button title="Approve" loading={busy === r.id} onPress={() => answer(r, 'approved')} style={{ flex: 1, paddingVertical: 10 }} />
                  <Button title="Reject" variant="outline" disabled={busy === r.id} onPress={() => answer(r, 'rejected')} style={{ flex: 1, paddingVertical: 10 }} />
                </View>)}
            </View>)} />
      ) : (
        <FlatList data={shown} keyExtractor={(p) => p.id} contentContainerStyle={{ ...column, padding: 12 }} ListEmptyComponent={<Empty text={term ? 'No order with that number.' : 'Nothing here right now.'} />}
          renderItem={({ item: p }) => (
            <View style={{ padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '800', color: colors.navy }}>{p.order_number}</Text>
                <View style={{ backgroundColor: STATUS_TINT(p.status), borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: STATUS_TEXT(p.status), fontWeight: '700', fontSize: 12 }}>{STATUS_LABEL[p.status] ?? p.status}</Text></View>
              </View>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{dateTime(p.created_at)}</Text>
              {(p.order_items ?? []).map((it: any, i: number) => (
                <Text key={i} style={{ marginTop: 6 }}>{it.quantity} × {it.title}{it.variant_label && it.variant_label !== 'Default' ? ` (${it.variant_label})` : ''}</Text>))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: colors.muted }}>Deliver to {p.ship_to?.city ?? p.ship_to?.region ?? '—'}</Text>
                <Text style={{ fontWeight: '800', color: colors.greenText }}>You earn {ghs(p.shop_earnings)}</Text>
              </View>
              {p.courier_name ? <Text style={{ color: colors.tealText, fontSize: 12, marginTop: 4 }}>Courier: {p.courier_name}{p.tracking_number ? ` · ${p.tracking_number}` : ''}</Text> : null}
              {['paid', 'processing'].includes(p.status) && (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <Button title={p.status === 'paid' ? 'Start packing' : 'Packed — ready to ship'} loading={busy === p.id}
                    onPress={() => setStatus(p.id, p.status === 'paid' ? 'processing' : 'ready')} style={{ flex: 2, paddingVertical: 10 }} />
                  <Button title="Can't supply" variant="outline" disabled={busy === p.id} onPress={() => cancel(p)} style={{ flex: 1, paddingVertical: 10 }} />
                </View>)}
              {p.status === 'ready' && <Text style={{ color: colors.tealText, fontSize: 12, marginTop: 8 }}>Ebenoba GH will assign a rider or courier to collect this package.</Text>}
            </View>)} />)}
      <Modal visible={!!rejecting} transparent animationType="fade" onRequestClose={() => setRejecting(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: radius.lg, padding: 18 }}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: colors.navy }}>Reject return</Text>
            <Text style={{ color: colors.muted, marginTop: 4 }}>The customer will see your reason and can escalate to Ebenoba GH.</Text>
            <TextInput value={reason} onChangeText={setReason} multiline placeholder="Reason" style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, marginTop: 10, minHeight: 70, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Button title="Back" variant="soft" onPress={() => setRejecting(null)} style={{ flex: 1 }} />
              <Button title="Reject" onPress={confirmReject} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
