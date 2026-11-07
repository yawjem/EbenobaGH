'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createUser } from '@/lib/createUser';
import { Empty, PageHeader, dt } from '@/lib/ui';

const blank = { full_name: '', phone: '', email: '', password: '' };

export default function Riders() {
  const [riders, setRiders] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [r, p] = await Promise.all([
      supabase.from('profiles').select('id,full_name,phone,email,created_at').eq('role', 'rider').order('full_name'),
      supabase.from('packages').select('rider_id,status,delivered_at').not('rider_id', 'is', null),
    ]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    setRiders((r.data ?? []).map((x: any) => {
      const mine = (p.data ?? []).filter((k: any) => k.rider_id === x.id);
      return { ...x,
        active: mine.filter((k: any) => ['assigned', 'dispatched', 'in_transit'].includes(k.status)).length,
        today: mine.filter((k: any) => k.delivered_at && new Date(k.delivered_at) >= today).length,
        total: mine.filter((k: any) => ['delivered', 'completed'].includes(k.status)).length };
    }));
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const r = await createUser({ ...f, role: 'rider' });
      setMsg({ ok: true, text: r.created ? 'Rider created. Share the email and password; they sign in at /login.' : 'Existing account promoted to rider.' });
      setF(blank); setOpen(false); load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Riders" sub="Your own delivery team. They sign in to the rider site to see assigned deliveries.">
        <button className="btn" onClick={() => setOpen(true)}>+ Add rider</button>
      </PageHeader>
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Rider</th><th>Phone</th><th className="right">Active now</th><th className="right">Delivered today</th><th className="right">Delivered total</th><th>Added</th></tr></thead>
        <tbody>{riders.map((r) => (
          <tr key={r.id}><td><b>{r.full_name || '—'}</b><div className="muted small">{r.email}</div></td><td>{r.phone}</td>
            <td className="right" style={{ fontWeight: r.active > 3 ? 800 : 400, color: r.active > 3 ? 'var(--primary)' : undefined }}>{r.active}</td>
            <td className="right">{r.today}</td><td className="right">{r.total}</td><td className="muted">{dt(r.created_at)}</td></tr>))}</tbody>
      </table>{!riders.length && <Empty text="No riders yet. Add your first rider." />}</div>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={create}>
            <h2>New rider</h2>
            <div className="field"><label>Full name</label><input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div className="field"><label>Email (used to sign in)</label><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="field"><label>Temporary password (8+ chars)</label><input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create rider'}</button></div>
          </form>
        </div>)}
    </>
  );
}
