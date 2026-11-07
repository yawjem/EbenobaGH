'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, Empty, PageHeader, dt } from '@/lib/ui';

// People apply from the app (My Shop tab). Approving creates their shop, makes them a seller and notifies them.
export default function Applications() {
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('pending');
  const [sel, setSel] = useState<any>(null);
  const [commission, setCommission] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const { data } = await supabase.from('seller_applications')
      .select('*, applicant:profiles!user_id(full_name,email,phone)').order('created_at', { ascending: false }).limit(200);
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const shown = rows.filter((r) => filter === 'all' || r.status === filter);
  const open = (r: any) => { setSel(r); setCommission(''); setReason(''); };

  const approve = async () => {
    setBusy(true);
    const c = commission.trim() === '' ? null : Number(commission);
    if (c !== null && (Number.isNaN(c) || c < 0 || c > 100)) { setBusy(false); return setMsg({ ok: false, text: 'Commission must be between 0 and 100.' }); }
    const { error } = await supabase.rpc('approve_seller_application', { p_id: sel.id, p_commission: c });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `${sel.shop_name} approved. They now see the My Shop tab in the app.` }); setSel(null); load();
  };
  const reject = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('reject_seller_application', { p_id: sel.id, p_reason: reason || null });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: 'Application rejected and the applicant was told.' }); setSel(null); load();
  };

  return (
    <>
      <PageHeader title="Seller applications" sub="Approve to create the shop and unlock the My Shop tab for that person." />
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div className="tabs">{['pending', 'approved', 'rejected', 'all'].map((s) => <span key={s} className={`tab ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>{s}</span>)}</div>
      {shown.length === 0 ? <Empty text="Nothing here." /> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Shop</th><th>Applicant</th><th>Where</th><th>Status</th><th>Applied</th><th></th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id}>
              <td><b>{r.shop_name}</b><div className="muted small">{r.description?.slice(0, 80)}</div></td>
              <td>{r.applicant?.full_name || '—'}<div className="muted small">{r.applicant?.email} · {r.phone}</div></td>
              <td>{r.city}, {r.region}</td>
              <td><Badge s={r.status} /></td>
              <td className="nowrap">{dt(r.created_at)}</td>
              <td className="right">{r.status === 'pending' && <button className="btn soft sm" onClick={() => open(r)}>Review</button>}</td>
            </tr>))}</tbody></table></div>)}

      {sel && (
        <div className="modal-bg" onClick={() => setSel(null)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>{sel.shop_name}</h2>
          <p className="muted">{sel.description || 'No description.'}</p>
          <p className="small">{sel.address_text ? sel.address_text + ', ' : ''}{sel.city}, {sel.region}<br />Phone {sel.phone}<br />Applicant: {sel.applicant?.full_name || '—'} ({sel.applicant?.email})</p>
          <div className="field"><label>Commission % (leave blank for the platform default)</label>
            <input value={commission} onChange={(e) => setCommission(e.target.value)} inputMode="decimal" placeholder="e.g. 10" /></div>
          <div className="field"><label>If rejecting: reason shown to the applicant</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Please add a clear business address" /></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => setSel(null)}>Cancel</button>
            <button className="btn ghost" disabled={busy} onClick={reject}>Reject</button>
            <button className="btn" disabled={busy} onClick={approve}>Approve shop</button>
          </div>
        </div></div>)}
    </>
  );
}
