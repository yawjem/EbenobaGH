'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/lib/ui';

const REGIONS = ['ANY', 'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Oti', 'Savannah', 'North East', 'Western North'];

export default function Settings() {
  const [settings, setSettings] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [nr, setNr] = useState({ from_region: 'ANY', to_region: 'ANY', fee: '', eta_min_days: '1', eta_max_days: '3' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const [s, r] = await Promise.all([supabase.from('platform_settings').select('*').order('key'), supabase.from('delivery_rates').select('*').order('from_region').order('to_region')]);
    setSettings(s.data ?? []); setRates(r.data ?? []);
  };
  useEffect(() => { load(); }, []);

  const saveSetting = async (key: string, raw: string) => {
    const value = raw === 'true' || raw === 'false' ? raw === 'true' : Number(raw);
    if (typeof value === 'number' && Number.isNaN(value)) return setMsg({ ok: false, text: 'Enter a number.' });
    const { error } = await supabase.from('platform_settings').update({ value }).eq('key', key);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `Saved ${key}.` });
  };
  const saveRate = async (r: any, patch: any) => { const { error } = await supabase.from('delivery_rates').update(patch).eq('id', r.id); setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Rate saved.' }); };
  const addRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('delivery_rates').insert({ from_region: nr.from_region, to_region: nr.to_region, fee: Number(nr.fee), eta_min_days: Number(nr.eta_min_days), eta_max_days: Number(nr.eta_max_days) });
    if (error) return setMsg({ ok: false, text: error.message });
    setNr({ ...nr, fee: '' }); load();
  };
  const delRate = async (id: string) => { if (confirm('Delete this rate?')) { await supabase.from('delivery_rates').delete().eq('id', id); load(); } };

  return (
    <>
      <PageHeader title="Settings" sub="Rules the whole marketplace follows." />
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <h2>Marketplace rules</h2>
      <div className="table-wrap" style={{ marginBottom: 24 }}><table>
        <thead><tr><th>Setting</th><th>What it does</th><th style={{ width: 140 }}>Value</th></tr></thead>
        <tbody>{settings.map((s) => {
          const v = String(s.value);
          return (<tr key={s.key}><td><code>{s.key}</code></td><td className="muted">{s.description}</td>
            <td>{v === 'true' || v === 'false'
              ? <select defaultValue={v} onChange={(e) => saveSetting(s.key, e.target.value)}><option value="true">On</option><option value="false">Off</option></select>
              : <input type="number" defaultValue={v} onBlur={(e) => e.target.value !== v && saveSetting(s.key, e.target.value)} />}</td></tr>);
        })}</tbody>
      </table></div>
      <p className="muted small" style={{ marginTop: -14, marginBottom: 24 }}>Promo-push limits here are what stops customers being spammed. Order-status messages are never limited.</p>

      <h2>Delivery fees (per package)</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>From (shop region)</th><th>To (customer region)</th><th>Fee (GH₵)</th><th>Days (min–max)</th><th></th></tr></thead>
        <tbody>{rates.map((r) => (
          <tr key={r.id}><td>{r.from_region}</td><td>{r.to_region}</td>
            <td style={{ width: 120 }}><input type="number" step="0.5" defaultValue={r.fee} onBlur={(e) => Number(e.target.value) !== Number(r.fee) && saveRate(r, { fee: Number(e.target.value) })} /></td>
            <td className="nowrap"><input style={{ width: 60 }} type="number" defaultValue={r.eta_min_days} onBlur={(e) => saveRate(r, { eta_min_days: Number(e.target.value) })} /> – <input style={{ width: 60 }} type="number" defaultValue={r.eta_max_days} onBlur={(e) => saveRate(r, { eta_max_days: Number(e.target.value) })} /></td>
            <td className="right"><button className="btn ghost sm" onClick={() => delRate(r.id)}>Delete</button></td></tr>))}
          <tr><td colSpan={5} style={{ background: 'var(--surface)' }}>
            <form className="row" onSubmit={addRate}>
              <select style={{ width: 160 }} value={nr.from_region} onChange={(e) => setNr({ ...nr, from_region: e.target.value })}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
              <span>→</span>
              <select style={{ width: 160 }} value={nr.to_region} onChange={(e) => setNr({ ...nr, to_region: e.target.value })}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
              <input style={{ width: 100 }} required type="number" step="0.5" placeholder="Fee" value={nr.fee} onChange={(e) => setNr({ ...nr, fee: e.target.value })} />
              <input style={{ width: 70 }} type="number" value={nr.eta_min_days} onChange={(e) => setNr({ ...nr, eta_min_days: e.target.value })} /> –
              <input style={{ width: 70 }} type="number" value={nr.eta_max_days} onChange={(e) => setNr({ ...nr, eta_max_days: e.target.value })} />
              <button className="btn sm">Add rate</button>
            </form></td></tr>
        </tbody>
      </table></div>
      <p className="muted small">“ANY → ANY” is the fallback when no specific pair matches (e.g. long distance, handled by a nationwide courier).</p>
    </>
  );
}
