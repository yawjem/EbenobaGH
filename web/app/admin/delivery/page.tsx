'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/lib/ui';

// Delivery price = (base fee) x (method factor) x (speed multiplier).
// Ghana base fees live in Settings -> Delivery fees. International base = zone base + per-kg x weight.
export default function Delivery() {
  const [methods, setMethods] = useState<any[]>([]);
  const [speeds, setSpeeds] = useState<any[]>([]);
  const [avail, setAvail] = useState<Set<string>>(new Set());
  const [zones, setZones] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [nz, setNz] = useState({ name: '', countries: '', base_fee: '', per_kg_fee: '' });

  const load = async () => {
    const [m, s, a, z] = await Promise.all([
      supabase.from('delivery_methods').select('*').order('sort'),
      supabase.from('delivery_speeds').select('*').order('sort'),
      supabase.from('delivery_method_speeds').select('*'),
      supabase.from('delivery_zones').select('*').order('base_fee'),
    ]);
    setMethods(m.data ?? []); setSpeeds(s.data ?? []); setZones(z.data ?? []);
    setAvail(new Set((a.data ?? []).map((x: any) => `${x.method_code}|${x.speed_code}`)));
  };
  useEffect(() => { load(); }, []);

  const done = (error: any, text: string) => setMsg(error ? { ok: false, text: error.message } : { ok: true, text });
  const saveMethod = async (code: string, patch: any) => done((await supabase.from('delivery_methods').update(patch).eq('code', code)).error, 'Method saved.');
  const saveSpeed = async (code: string, patch: any) => done((await supabase.from('delivery_speeds').update(patch).eq('code', code)).error, 'Speed saved.');
  const saveZone = async (id: string, patch: any) => done((await supabase.from('delivery_zones').update(patch).eq('id', id)).error, 'Zone saved.');

  const toggle = async (m: string, s: string) => {
    const on = avail.has(`${m}|${s}`);
    const { error } = on
      ? await supabase.from('delivery_method_speeds').delete().eq('method_code', m).eq('speed_code', s)
      : await supabase.from('delivery_method_speeds').insert({ method_code: m, speed_code: s });
    done(error, 'Availability saved.'); load();
  };

  const codes = (txt: string) => Array.from(new Set(txt.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean)));
  const validCodes = (list: string[]) => list.every((c) => /^[A-Z]{2}$/.test(c)) && !list.includes('GH');

  const addZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = codes(nz.countries);
    if (!validCodes(list)) return setMsg({ ok: false, text: 'Use two-letter country codes (like NG, GB, US), separated by commas. Ghana (GH) is delivered by the local methods.' });
    const { error } = await supabase.from('delivery_zones').insert({ name: nz.name, country_codes: list, base_fee: Number(nz.base_fee), per_kg_fee: Number(nz.per_kg_fee || 0) });
    if (error) return setMsg({ ok: false, text: error.message });
    setNz({ name: '', countries: '', base_fee: '', per_kg_fee: '' }); load();
  };
  const delZone = async (id: string) => { if (confirm('Delete this zone? Customers in these countries will no longer be able to order.')) { await supabase.from('delivery_zones').delete().eq('id', id); load(); } };

  return (
    <>
      <PageHeader title="Delivery options" sub="What customers can choose at checkout, and how each choice changes the price." />
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <p className="muted small" style={{ marginBottom: 18 }}>
        Price = base fee × method factor × speed multiplier. A multiplier above 1 makes a choice cost more (e.g. same day), below 1 makes it cheaper (e.g. 2 weeks).
        Ghana base fees are set under Settings → Delivery fees.
      </p>

      <h2>Delivery methods</h2>
      <div className="table-wrap" style={{ marginBottom: 24 }}><table>
        <thead><tr><th>Method</th><th>Where</th><th style={{ width: 120 }}>Price factor</th><th style={{ width: 90 }}>Active</th></tr></thead>
        <tbody>{methods.map((m) => (
          <tr key={m.code}><td><b>{m.label}</b><div className="muted small">{m.carrier === 'rider' ? 'Own riders · customer gets a delivery code' : 'Third-party courier'}</div></td>
            <td>{m.kind === 'international' ? 'Other countries' : 'Ghana'}</td>
            <td><input type="number" step="0.05" min="0.05" defaultValue={m.factor} onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== Number(m.factor) && saveMethod(m.code, { factor: Number(e.target.value) })} /></td>
            <td><select defaultValue={String(m.is_active)} onChange={(e) => saveMethod(m.code, { is_active: e.target.value === 'true' })}><option value="true">On</option><option value="false">Off</option></select></td></tr>))}</tbody>
      </table></div>

      <h2>Delivery times</h2>
      <div className="table-wrap" style={{ marginBottom: 24 }}><table>
        <thead><tr><th>Option</th><th>Days (min–max)</th><th style={{ width: 130 }}>Price multiplier</th><th>Same region only</th><th style={{ width: 90 }}>Active</th></tr></thead>
        <tbody>{speeds.map((s) => (
          <tr key={s.code}><td><b>{s.label}</b></td>
            <td className="nowrap"><input style={{ width: 60 }} type="number" min="0" defaultValue={s.min_days} onBlur={(e) => Number(e.target.value) !== s.min_days && saveSpeed(s.code, { min_days: Number(e.target.value) })} /> – <input style={{ width: 60 }} type="number" min="0" defaultValue={s.max_days} onBlur={(e) => Number(e.target.value) !== s.max_days && saveSpeed(s.code, { max_days: Number(e.target.value) })} /></td>
            <td><input type="number" step="0.05" min="0.05" defaultValue={s.multiplier} onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== Number(s.multiplier) && saveSpeed(s.code, { multiplier: Number(e.target.value) })} /></td>
            <td><select defaultValue={String(s.same_region_only)} onChange={(e) => saveSpeed(s.code, { same_region_only: e.target.value === 'true' })}><option value="false">No</option><option value="true">Yes (shop and customer in same region)</option></select></td>
            <td><select defaultValue={String(s.is_active)} onChange={(e) => saveSpeed(s.code, { is_active: e.target.value === 'true' })}><option value="true">On</option><option value="false">Off</option></select></td></tr>))}</tbody>
      </table></div>

      <h2>Which times each method offers</h2>
      <div className="table-wrap" style={{ marginBottom: 24 }}><table>
        <thead><tr><th>Method</th>{speeds.map((s) => <th key={s.code}>{s.label}</th>)}</tr></thead>
        <tbody>{methods.map((m) => (
          <tr key={m.code}><td><b>{m.label}</b></td>
            {speeds.map((s) => <td key={s.code}><input type="checkbox" checked={avail.has(`${m.code}|${s.code}`)} onChange={() => toggle(m.code, s.code)} /></td>)}</tr>))}</tbody>
      </table></div>

      <h2>International zones (FedEx)</h2>
      <p className="muted small" style={{ marginBottom: 8 }}>
        Only countries listed here can order from abroad. Zone price = base fee + per-kg fee × package weight (rounded up, minimum 1 kg), then × method factor × time multiplier.
        The starting numbers are placeholders: check FedEx’s country list and your real quotes.
      </p>
      <div className="table-wrap"><table>
        <thead><tr><th>Zone</th><th>Countries (2-letter codes)</th><th style={{ width: 110 }}>Base (GH₵)</th><th style={{ width: 110 }}>Per kg (GH₵)</th><th style={{ width: 80 }}>Active</th><th></th></tr></thead>
        <tbody>{zones.map((z) => (
          <tr key={z.id}><td><input defaultValue={z.name} onBlur={(e) => e.target.value.trim() && e.target.value !== z.name && saveZone(z.id, { name: e.target.value.trim() })} /></td>
            <td><input defaultValue={(z.country_codes ?? []).join(', ')} onBlur={(e) => { const l = codes(e.target.value); if (!validCodes(l)) return setMsg({ ok: false, text: 'Use two-letter codes like NG, GB (not GH).' }); saveZone(z.id, { country_codes: l }); }} /></td>
            <td><input type="number" step="1" min="0" defaultValue={z.base_fee} onBlur={(e) => Number(e.target.value) !== Number(z.base_fee) && saveZone(z.id, { base_fee: Number(e.target.value) })} /></td>
            <td><input type="number" step="1" min="0" defaultValue={z.per_kg_fee} onBlur={(e) => Number(e.target.value) !== Number(z.per_kg_fee) && saveZone(z.id, { per_kg_fee: Number(e.target.value) })} /></td>
            <td><select defaultValue={String(z.is_active)} onChange={(e) => saveZone(z.id, { is_active: e.target.value === 'true' })}><option value="true">On</option><option value="false">Off</option></select></td>
            <td className="right"><button className="btn ghost sm" onClick={() => delZone(z.id)}>Delete</button></td></tr>))}
          <tr><td colSpan={6} style={{ background: 'var(--surface)' }}>
            <form className="row" onSubmit={addZone}>
              <input style={{ width: 160 }} required placeholder="Zone name" value={nz.name} onChange={(e) => setNz({ ...nz, name: e.target.value })} />
              <input style={{ width: 240 }} required placeholder="Countries: KE, UG, TZ" value={nz.countries} onChange={(e) => setNz({ ...nz, countries: e.target.value })} />
              <input style={{ width: 100 }} required type="number" min="0" placeholder="Base" value={nz.base_fee} onChange={(e) => setNz({ ...nz, base_fee: e.target.value })} />
              <input style={{ width: 100 }} type="number" min="0" placeholder="Per kg" value={nz.per_kg_fee} onChange={(e) => setNz({ ...nz, per_kg_fee: e.target.value })} />
              <button className="btn sm">Add zone</button>
            </form></td></tr>
        </tbody>
      </table></div>
    </>
  );
}
