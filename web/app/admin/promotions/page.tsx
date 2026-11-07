'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, Empty, PageHeader, dt, money } from '@/lib/ui';

type Kind = 'shop' | 'brand' | 'category' | 'product';
const blank = { name: '', discount_type: 'percent', discount_value: '', starts_at: '', ends_at: '', budget_cap: '', banner_url: '' };
const toIso = (local: string) => new Date(local).toISOString();

export default function Promotions() {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [kind, setKind] = useState<Kind>('shop');
  const [picked, setPicked] = useState<{ kind: Kind; id: string; name: string }[]>([]);
  const [opts, setOpts] = useState<Record<Kind, { id: string; name: string }[]>>({ shop: [], brand: [], category: [], product: [] });
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const { data } = await supabase.from('campaigns').select('*, campaign_targets(kind,target_id)').order('created_at', { ascending: false });
    setList(data ?? []);
  };
  useEffect(() => {
    load();
    (async () => {
      const [s, b, c, p] = await Promise.all([
        supabase.from('shops').select('id,name').order('name'), supabase.from('brands').select('id,name').order('name'),
        supabase.from('categories').select('id,name').order('name'), supabase.from('products').select('id,title').eq('status', 'active').order('title').limit(500)]);
      setOpts({ shop: s.data ?? [], brand: b.data ?? [], category: c.data ?? [], product: (p.data ?? []).map((x: any) => ({ id: x.id, name: x.title })) });
    })();
  }, []);

  const visible = useMemo(() => opts[kind].filter((o) => o.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 60), [opts, kind, filter]);
  const isPicked = (k: Kind, id: string) => picked.some((p) => p.kind === k && p.id === id);
  const toggle = (k: Kind, o: { id: string; name: string }) =>
    setPicked((cur) => isPicked(k, o.id) ? cur.filter((p) => !(p.kind === k && p.id === o.id)) : [...cur, { kind: k, id: o.id, name: o.name }]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (!picked.length) return setMsg({ ok: false, text: 'Choose at least one shop, brand, category or product.' });
    const value = Number(f.discount_value);
    if (f.discount_type === 'percent' && (value <= 0 || value > 90)) return setMsg({ ok: false, text: 'Percentage must be between 1 and 90.' });
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: c, error } = await supabase.from('campaigns').insert({
        name: f.name.trim(), discount_type: f.discount_type, discount_value: value, starts_at: toIso(f.starts_at), ends_at: toIso(f.ends_at),
        budget_cap: f.budget_cap ? Number(f.budget_cap) : null, banner_url: f.banner_url || null, created_by: user?.id,
      }).select('id').single();
      if (error) throw error;
      const t = await supabase.from('campaign_targets').insert(picked.map((p) => ({ campaign_id: c.id, kind: p.kind, target_id: p.id })));
      if (t.error) throw t.error;
      setMsg({ ok: true, text: 'Promotion scheduled. It activates and ends automatically.' });
      setF(blank); setPicked([]); setOpen(false); load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); }
    setBusy(false);
  };

  const toggleActive = async (c: any) => { await supabase.from('campaigns').update({ is_active: !c.is_active }).eq('id', c.id); load(); };
  const remove = async (c: any) => { if (confirm(`Delete “${c.name}”? Past orders keep the discount they received.`)) { await supabase.from('campaigns').delete().eq('id', c.id); load(); } };
  const phase = (c: any) => { const n = Date.now(); return !c.is_active ? 'paused' : n < +new Date(c.starts_at) ? 'scheduled' : n > +new Date(c.ends_at) ? 'ended' : 'live'; };

  return (
    <>
      <PageHeader title="Promotions" sub="Platform-funded offers (Black Friday, festivals). You pay for these; sellers still earn on their normal price.">
        <button className="btn" onClick={() => setOpen(true)}>+ New promotion</button>
      </PageHeader>
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Promotion</th><th>Offer</th><th>Runs</th><th>Targets</th><th className="right">Spent / cap</th><th>State</th><th></th></tr></thead>
        <tbody>{list.map((c) => {
          const ph = phase(c);
          return (<tr key={c.id}>
            <td><b>{c.name}</b></td><td>{c.discount_type === 'percent' ? `${Number(c.discount_value)}% off` : `${money(c.discount_value)} off`}</td>
            <td className="small muted nowrap">{dt(c.starts_at)}<br />→ {dt(c.ends_at)}</td>
            <td className="small">{(c.campaign_targets ?? []).length} item(s)<div className="muted">{[...new Set((c.campaign_targets ?? []).map((t: any) => t.kind))].join(', ')}</div></td>
            <td className="right nowrap">{money(c.budget_spent)} / {c.budget_cap ? money(c.budget_cap) : '∞'}</td>
            <td><Badge s={ph === 'live' ? 'active' : ph === 'scheduled' ? 'pending' : 'closed'} text={ph} /></td>
            <td className="right nowrap"><button className="btn ghost sm" onClick={() => toggleActive(c)}>{c.is_active ? 'Pause' : 'Resume'}</button> <button className="btn ghost sm" onClick={() => remove(c)}>Delete</button></td>
          </tr>);
        })}</tbody>
      </table>{!list.length && <Empty text="No promotions yet." />}</div>
      <p className="muted small">If two promotions cover the same product, the bigger discount wins (no stacking). A seller’s own sale price is also compared and the lowest price is shown.</p>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <form className="modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()} onSubmit={create}>
            <h2>New promotion</h2>
            <div className="field"><label>Name (shown on the app banner)</label><input required value={f.name} placeholder="Black Friday" onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="grid g3">
              <div className="field"><label>Discount type</label><select value={f.discount_type} onChange={(e) => setF({ ...f, discount_type: e.target.value })}><option value="percent">Percentage</option><option value="fixed">Fixed amount (GH₵)</option></select></div>
              <div className="field"><label>{f.discount_type === 'percent' ? 'Percent off' : 'Amount off (GH₵)'}</label><input required type="number" min="1" step="0.01" value={f.discount_value} onChange={(e) => setF({ ...f, discount_value: e.target.value })} /></div>
              <div className="field"><label>Budget cap (GH₵, optional)</label><input type="number" min="0" value={f.budget_cap} onChange={(e) => setF({ ...f, budget_cap: e.target.value })} /></div>
              <div className="field"><label>Starts</label><input required type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></div>
              <div className="field"><label>Ends</label><input required type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></div>
              <div className="field"><label>Banner image URL (optional)</label><input value={f.banner_url} onChange={(e) => setF({ ...f, banner_url: e.target.value })} /></div>
            </div>
            <label>Who gets the discount?</label>
            <div className="tabs">{(['shop', 'brand', 'category', 'product'] as Kind[]).map((k) => <span key={k} className={`tab ${kind === k ? 'on' : ''}`} onClick={() => { setKind(k); setFilter(''); }}>{k === 'shop' ? 'Shops' : k === 'brand' ? 'Brands' : k === 'category' ? 'Categories' : 'Products'}</span>)}</div>
            <input placeholder={`Search ${kind}s…`} value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 8 }} />
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 6 }}>
              {visible.map((o) => (<label key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 6px', margin: 0, fontWeight: 400, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={isPicked(kind, o.id)} onChange={() => toggle(kind, o)} />{o.name}</label>))}
              {!visible.length && <span className="muted small">Nothing found.</span>}
            </div>
            <div className="row" style={{ marginTop: 8 }}>{picked.map((p) => <span key={p.kind + p.id} className="badge brand" style={{ cursor: 'pointer' }} onClick={() => toggle(p.kind, { id: p.id, name: p.name })}>{p.kind}: {p.name} ✕</span>)}</div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 14 }}><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Schedule promotion'}</button></div>
          </form>
        </div>)}
    </>
  );
}
