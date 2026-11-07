'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, Empty, PageHeader, dt, money } from '@/lib/ui';

const STATUSES = ['requested', 'approved', 'rejected', 'escalated', 'item_returning', 'received', 'refunded', 'closed'];

export default function Returns() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('open');
  const [sel, setSel] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const { data } = await supabase.from('return_requests')
      .select('*, shops(name), buyer:profiles!buyer_id(full_name,phone), packages(order_number), order_items(title,quantity,line_total)').order('created_at', { ascending: false }).limit(200);
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const shown = rows.filter((r) => filter === 'all' ? true : filter === 'open' ? !['refunded', 'closed', 'rejected'].includes(r.status) : r.status === filter);

  const save = async () => {
    const { error } = await supabase.from('return_requests').update({
      status: sel.status, admin_note: sel.admin_note || null, refund_amount: sel.refund_amount === '' || sel.refund_amount == null ? null : Number(sel.refund_amount),
      return_shipping_paid_by: sel.return_shipping_paid_by || null,
    }).eq('id', sel.id);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: 'Return updated. Remember: money refunds are paid out from the Paystack dashboard for now.' }); setSel(null); load();
  };

  return (
    <>
      <PageHeader title="Returns" sub="Sellers answer within 48 hours; rejected requests can be escalated to you." />
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div className="tabs">{['open', 'all', ...STATUSES].map((s) => <span key={s} className={`tab ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>{s.replace('_', ' ')}</span>)}</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Order</th><th>Item</th><th>Shop</th><th>Customer</th><th>Reason</th><th>Status</th><th>Opened</th><th></th></tr></thead>
        <tbody>{shown.map((r) => (
          <tr key={r.id}>
            <td><b>{r.packages?.order_number}</b></td><td>{r.order_items ? `${r.order_items.quantity} × ${r.order_items.title}` : 'Whole package'}</td>
            <td>{r.shops?.name}</td><td>{r.buyer?.full_name}<div className="muted small">{r.buyer?.phone}</div></td>
            <td>{r.reason.replace('_', ' ')}{r.details && <div className="muted small">{r.details}</div>}</td>
            <td><Badge s={r.status} /></td><td className="muted nowrap">{dt(r.created_at)}</td>
            <td><button className="btn soft sm" onClick={() => setSel({ ...r })}>Review</button></td>
          </tr>))}</tbody>
      </table>{!shown.length && <Empty text="No returns here." />}</div>

      {sel && (
        <div className="modal-bg" onClick={() => setSel(null)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Return · {sel.packages?.order_number}</h2>
          <p className="muted">{sel.reason.replace('_', ' ')} — {sel.details || 'no details'}</p>
          {sel.seller_note && <div className="notice err">Seller said: {sel.seller_note}</div>}
          {sel.photos?.length > 0 && <p className="small muted">{sel.photos.length} photo(s) attached (private bucket — viewing in the dashboard comes in v1.1).</p>}
          <div className="grid g2">
            <div className="field"><label>Status</label><select value={sel.status} onChange={(e) => setSel({ ...sel, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
            <div className="field"><label>Refund amount (GH₵)</label><input type="number" min="0" step="0.01" value={sel.refund_amount ?? ''} onChange={(e) => setSel({ ...sel, refund_amount: e.target.value })} /></div>
          </div>
          <div className="field"><label>Who pays return shipping</label><select value={sel.return_shipping_paid_by ?? ''} onChange={(e) => setSel({ ...sel, return_shipping_paid_by: e.target.value })}>
            <option value="">—</option><option value="seller">Seller (their fault)</option><option value="buyer">Buyer (changed mind)</option><option value="platform">Ebenoba GH</option></select></div>
          <div className="field"><label>Admin note</label><textarea rows={3} value={sel.admin_note ?? ''} onChange={(e) => setSel({ ...sel, admin_note: e.target.value })} /></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setSel(null)}>Cancel</button><button className="btn" onClick={save}>Save</button></div>
        </div></div>)}
    </>
  );
}
