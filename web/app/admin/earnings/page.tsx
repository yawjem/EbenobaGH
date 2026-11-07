'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Empty, PageHeader, dt, money } from '@/lib/ui';

// Balance per shop = (earnings past the return window, not yet paid) − payouts already recorded.
export default function Earnings() {
  const [rows, setRows] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [method, setMethod] = useState('momo');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const [s, l, p] = await Promise.all([
      supabase.from('shops').select('id,name,commission_pct'),
      supabase.from('ledger_entries').select('shop_id,entry_type,amount,status'),
      supabase.from('payouts').select('*, shops(name)').order('created_at', { ascending: false }).limit(30),
    ]);
    setRows((s.data ?? []).map((shop: any) => {
      const mine = (l.data ?? []).filter((e: any) => e.shop_id === shop.id);
      const sum = (f: (e: any) => boolean) => mine.filter(f).reduce((n: number, e: any) => n + Number(e.amount), 0);
      const held = sum((e) => e.entry_type === 'sale_earning' && e.status === 'pending');
      const avail = sum((e) => e.entry_type === 'sale_earning' && e.status === 'available') + sum((e) => e.entry_type === 'payout');
      const paid = -sum((e) => e.entry_type === 'payout');
      return { ...shop, held, available: Math.max(avail, 0), paid };
    }));
    setPayouts(p.data ?? []);
  };
  useEffect(() => { load(); }, []);

  const record = async () => {
    const amt = Number(amount);
    if (!(amt > 0) || amt > sel.available) return setMsg({ ok: false, text: `Amount must be between 0.01 and ${money(sel.available)}.` });
    const { data: { user } } = await supabase.auth.getUser();
    const p = await supabase.from('payouts').insert({ shop_id: sel.id, amount: amt, method, reference: ref || null, status: 'paid', created_by: user!.id });
    if (p.error) return setMsg({ ok: false, text: p.error.message });
    const l = await supabase.from('ledger_entries').insert({ shop_id: sel.id, entry_type: 'payout', amount: -amt, status: 'paid_out', note: `Payout ${ref || ''}`.trim() });
    if (l.error) return setMsg({ ok: false, text: l.error.message });
    setMsg({ ok: true, text: `Recorded ${money(amt)} payout to ${sel.name}. Send the money (MoMo/bank) separately — this only records it.` });
    setSel(null); setAmount(''); setRef(''); load();
  };

  return (
    <>
      <PageHeader title="Earnings & payouts" sub="Shops are owed their sales (minus commission) once the return window has passed." />
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Shop</th><th>Commission</th><th className="right">On hold (return window)</th><th className="right">Ready to pay out</th><th className="right">Paid so far</th><th></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td><b>{r.name}</b></td><td>{Number(r.commission_pct)}%</td><td className="right">{money(r.held)}</td>
            <td className="right"><b style={{ color: r.available > 0 ? 'var(--primary)' : undefined }}>{money(r.available)}</b></td><td className="right">{money(r.paid)}</td>
            <td className="right"><button className="btn soft sm" disabled={r.available <= 0} onClick={() => { setSel(r); setAmount(String(r.available)); }}>Record payout</button></td></tr>))}</tbody>
      </table>{!rows.length && <Empty text="No shops yet." />}</div>

      <h2 style={{ marginTop: 24 }}>Recent payouts</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Date</th><th>Shop</th><th>Method</th><th>Reference</th><th className="right">Amount</th></tr></thead>
        <tbody>{payouts.map((p) => <tr key={p.id}><td className="muted">{dt(p.created_at)}</td><td>{p.shops?.name}</td><td>{p.method}</td><td>{p.reference}</td><td className="right">{money(p.amount)}</td></tr>)}</tbody>
      </table>{!payouts.length && <Empty text="No payouts recorded yet." />}</div>

      {sel && (
        <div className="modal-bg" onClick={() => setSel(null)}><div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Payout to {sel.name}</h2><p className="muted">Available: <b>{money(sel.available)}</b></p>
          <div className="field"><label>Amount (GH₵)</label><input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field"><label>Method</label><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="momo">Mobile money</option><option value="bank">Bank transfer</option><option value="cash">Cash</option></select></div>
          <div className="field"><label>Transaction reference</label><input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn ghost" onClick={() => setSel(null)}>Cancel</button><button className="btn" onClick={record}>Record payout</button></div>
        </div></div>)}
    </>
  );
}
