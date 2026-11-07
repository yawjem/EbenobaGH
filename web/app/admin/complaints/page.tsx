'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, Empty, PageHeader, dt } from '@/lib/ui';

const STATUSES = ['open', 'in_review', 'resolved', 'closed'];

export default function Complaints() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('open');
  const [sel, setSel] = useState<any>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [reply, setReply] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const { data } = await supabase.from('complaints')
      .select('*, who:profiles!created_by(full_name,phone), shops(name), orders(order_number)').order('created_at', { ascending: false }).limit(200);
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const openTicket = async (c: any) => {
    setSel({ ...c });
    const { data } = await supabase.from('complaint_messages').select('*, sender:profiles!sender_id(full_name,role)').eq('complaint_id', c.id).order('created_at');
    setThread(data ?? []);
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('complaint_messages').insert({ complaint_id: sel.id, sender_id: user!.id, body: reply.trim() });
    if (error) return setMsg({ ok: false, text: error.message });
    setReply(''); openTicket(sel);
  };

  const save = async () => {
    const { error } = await supabase.from('complaints').update({
      status: sel.status, ruling: sel.ruling || null, cost_borne_by: sel.cost_borne_by || null,
      ruling_amount: sel.ruling_amount === '' || sel.ruling_amount == null ? null : Number(sel.ruling_amount),
    }).eq('id', sel.id);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: 'Complaint updated.' }); setSel(null); load();
  };

  const shown = rows.filter((r) => filter === 'all' ? true : filter === 'open' ? ['open', 'in_review'].includes(r.status) : r.status === filter);

  return (
    <>
      <PageHeader title="Complaints" sub="Anything that is not a simple return: late or missing deliveries, seller or rider behaviour, payment problems." />
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div className="tabs">{['open', 'all', ...STATUSES].map((s) => <span key={s} className={`tab ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>{s.replace('_', ' ')}</span>)}</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Subject</th><th>Category</th><th>Customer</th><th>Order</th><th>Shop</th><th>Status</th><th>Opened</th><th></th></tr></thead>
        <tbody>{shown.map((c) => (
          <tr key={c.id}><td><b>{c.subject}</b></td><td>{c.category.replace('_', ' ')}</td><td>{c.who?.full_name}<div className="muted small">{c.who?.phone}</div></td>
            <td>{c.orders?.order_number ?? '—'}</td><td>{c.shops?.name ?? '—'}</td><td><Badge s={c.status} /></td><td className="muted nowrap">{dt(c.created_at)}</td>
            <td><button className="btn soft sm" onClick={() => openTicket(c)}>Open</button></td></tr>))}</tbody>
      </table>{!shown.length && <Empty text="No complaints here." />}</div>

      {sel && (
        <div className="modal-bg" onClick={() => setSel(null)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>{sel.subject}</h2>
          <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--surface)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
            {thread.map((m) => <div key={m.id} style={{ marginBottom: 8 }}><b className="small">{m.sender?.full_name ?? 'User'}</b> <span className="muted small">{dt(m.created_at)}</span><div>{m.body}</div></div>)}
            {!thread.length && <span className="muted small">No messages yet.</span>}
          </div>
          <div className="row" style={{ marginBottom: 14 }}><input placeholder="Reply to the customer…" value={reply} onChange={(e) => setReply(e.target.value)} /><button className="btn sm" onClick={sendReply}>Send</button></div>
          <div className="grid g2">
            <div className="field"><label>Status</label><select value={sel.status} onChange={(e) => setSel({ ...sel, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
            <div className="field"><label>Cost borne by</label><select value={sel.cost_borne_by ?? ''} onChange={(e) => setSel({ ...sel, cost_borne_by: e.target.value })}><option value="">—</option><option value="seller">Seller</option><option value="platform">Ebenoba GH</option><option value="buyer">Buyer</option><option value="none">No cost</option></select></div>
            <div className="field"><label>Ruling amount (GH₵)</label><input type="number" min="0" step="0.01" value={sel.ruling_amount ?? ''} onChange={(e) => setSel({ ...sel, ruling_amount: e.target.value })} /></div>
          </div>
          <div className="field"><label>Ruling / resolution note</label><textarea rows={3} value={sel.ruling ?? ''} onChange={(e) => setSel({ ...sel, ruling: e.target.value })} /></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setSel(null)}>Close</button><button className="btn" onClick={save}>Save ruling</button></div>
        </div></div>)}
    </>
  );
}
