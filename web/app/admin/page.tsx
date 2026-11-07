'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, PageHeader, Stat, dt, money } from '@/lib/ui';

const count = async (q: any) => (await q).count ?? 0;

export default function Overview() {
  const [s, setS] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const iso = today.toISOString();
      const head = { count: 'exact' as const, head: true };
      const [ordersToday, paidToday, toAssign, inTransit, review, returns, complaints, lowStock, pendingShops] = await Promise.all([
        count(supabase.from('orders').select('id', head).gte('created_at', iso)),
        supabase.from('orders').select('total').eq('status', 'paid').gte('created_at', iso),
        count(supabase.from('packages').select('id', head).in('status', ['paid', 'processing', 'ready'])),
        count(supabase.from('packages').select('id', head).in('status', ['assigned', 'dispatched', 'in_transit'])),
        count(supabase.from('orders').select('id', head).eq('needs_review', true)),
        count(supabase.from('return_requests').select('id', head).in('status', ['requested', 'escalated'])),
        count(supabase.from('complaints').select('id', head).in('status', ['open', 'in_review'])),
        count(supabase.from('product_variants').select('id', head).eq('is_active', true).lte('stock_qty', 5)),
        count(supabase.from('shops').select('id', head).eq('status', 'pending')),
      ]);
      setS({
        ordersToday, toAssign, inTransit, review, returns, complaints, lowStock, pendingShops,
        revenueToday: (paidToday.data ?? []).reduce((n: number, o: any) => n + Number(o.total), 0),
      });
      const r = await supabase.from('orders')
        .select('id,order_number,total,status,created_at,needs_review,packages(status)')
        .order('created_at', { ascending: false }).limit(8);
      setRecent(r.data ?? []);
    })();
  }, []);

  if (!s) return <p className="muted">Loading…</p>;
  return (
    <>
      <PageHeader title="Overview" sub="What needs attention right now" />
      <div className="grid g4">
        <Stat label="Orders today" value={s.ordersToday} tone="navy" />
        <Stat label="Paid revenue today" value={money(s.revenueToday)} tone="green" />
        <Stat label="Packages to process / assign" value={s.toAssign} tone="gold" />
        <Stat label="Out for delivery" value={s.inTransit} tone="teal" />
        <Stat label="Orders needing review" value={s.review} warn={s.review > 0} hint="Paid but stock ran out, or amount mismatch" />
        <Stat label="Open returns" value={s.returns} warn={s.returns > 0} />
        <Stat label="Open complaints" value={s.complaints} warn={s.complaints > 0} />
        <Stat label="Low-stock variants (≤5)" value={s.lowStock} tone="gold" />
      </div>
      {s.pendingShops > 0 && <div className="notice err" style={{ marginTop: 14 }}>{s.pendingShops} shop(s) waiting for approval — <Link href="/admin/shops">review</Link></div>}

      <h2 style={{ marginTop: 24 }}>Latest orders</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Order</th><th>Date</th><th>Packages</th><th className="right">Total</th><th>Payment</th></tr></thead>
        <tbody>
          {recent.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/admin/orders/${o.id}`}><b>{o.order_number}</b></Link> {o.needs_review && <Badge s="warn" text="needs review" />}</td>
              <td className="muted">{dt(o.created_at)}</td>
              <td><div className="row">{(o.packages ?? []).map((p: any, i: number) => <Badge key={i} s={p.status} />)}</div></td>
              <td className="right">{money(o.total)}</td><td><Badge s={o.status} /></td>
            </tr>))}
          {!recent.length && <tr><td colSpan={5} className="empty">No orders yet.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}
