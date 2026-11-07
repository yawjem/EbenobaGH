'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, Empty, PageHeader, STATUS_LABEL, dt, money } from '@/lib/ui';

const FILTERS = ['all', 'paid', 'processing', 'ready', 'assigned', 'dispatched', 'in_transit', 'delivered', 'cancelled'];

export default function Orders() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      let qb = supabase.from('orders')
        .select('id,order_number,total,status,created_at,needs_review,buyer:profiles!buyer_id(full_name,phone),packages(id,status,package_index,shops(name),rider:profiles!rider_id(full_name))')
        .order('created_at', { ascending: false }).limit(150);
      if (q.trim()) qb = qb.ilike('order_number', `%${q.trim()}%`);
      const { data } = await qb;
      setRows(data ?? []); setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const shown = rows.filter((o) => filter === 'all' || (o.packages ?? []).some((p: any) => p.status === filter));

  return (
    <>
      <PageHeader title="Orders" sub="Search by order number, e.g. EB-241104-10001">
        <input style={{ width: 280 }} placeholder="Order number…" value={q} onChange={(e) => setQ(e.target.value)} />
      </PageHeader>
      <div className="tabs">{FILTERS.map((f) => <span key={f} className={`tab ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : STATUS_LABEL[f]}</span>)}</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Order</th><th>Customer</th><th>Packages</th><th className="right">Total</th><th>Payment</th><th>Placed</th></tr></thead>
        <tbody>
          {shown.map((o) => (
            <tr key={o.id}>
              <td className="nowrap"><Link href={`/admin/orders/${o.id}`}><b>{o.order_number}</b></Link>{o.needs_review && <> <Badge s="warn" text="review" /></>}</td>
              <td>{o.buyer?.full_name || '—'}<div className="muted small">{o.buyer?.phone}</div></td>
              <td>{(o.packages ?? []).sort((a: any, b: any) => a.package_index - b.package_index).map((p: any) => (
                <div key={p.id} className="row" style={{ marginBottom: 3 }}><Badge s={p.status} /><span className="muted small">{p.shops?.name}{p.rider?.full_name ? ` · 🏍 ${p.rider.full_name}` : ''}</span></div>))}</td>
              <td className="right nowrap">{money(o.total)}</td><td><Badge s={o.status} /></td><td className="muted nowrap">{dt(o.created_at)}</td>
            </tr>))}
        </tbody>
      </table>{!shown.length && <Empty text={loading ? 'Loading…' : 'No orders match.'} />}</div>
    </>
  );
}
