'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { signOut, useRequireRole } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Badge, dt, money } from '@/lib/ui';

const ACTIVE = ['assigned', 'dispatched', 'in_transit', 'awaiting_pickup'];

export default function RiderHome() {
  const router = useRouter();
  const { profile, loading } = useRequireRole(['rider']);
  const [rows, setRows] = useState<any[]>([]);
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [q, setQ] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('packages')
      .select('id,order_number,package_index,status,ship_to,delivery_fee,eta_from,eta_to,delivered_at,delivered_to_name,created_at,shops(name,phone,city),order_items(id,title,quantity,variant_label)')
      .eq('rider_id', profile.id).order('created_at', { ascending: false }).limit(100);
    setRows(data ?? []);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile) return;
    load();
    // New assignments and admin changes show up without refreshing.
    const ch = supabase.channel('rider-' + profile.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packages', filter: `rider_id=eq.${profile.id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id, load]);

  const startTrip = async (p: any) => {
    setBusy(p.id); setMsg(null);
    const { error } = await supabase.from('packages').update({ status: 'in_transit' }).eq('id', p.id);
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `${p.order_number} is on its way. The customer has been notified and has their delivery code.` });
    load();
  };

  // Delivery is confirmed with the 4-digit code the customer reads out; the server checks it.
  const confirm = async (p: any) => {
    const code = (codes[p.id] ?? '').trim();
    const who = (names[p.id] ?? p.ship_to?.recipient_name ?? '').trim();
    if (!/^\d{4}$/.test(code)) return setMsg({ ok: false, text: 'Enter the 4-digit delivery code from the customer.' });
    if (!who) return setMsg({ ok: false, text: 'Enter the name of the person who received the package.' });
    setBusy(p.id); setMsg(null);
    const { data, error } = await supabase.rpc('confirm_delivery', { p_package: p.id, p_pin: code, p_received_by: who });
    setBusy(null);
    if (error) return setMsg({ ok: false, text: error.message });
    if (!data?.ok) {
      return setMsg({ ok: false, text: data?.reason === 'locked'
        ? 'Too many wrong codes. This package is locked. Call the office and they will give you a new code.'
        : `Wrong code. ${data?.attempts_left ?? 0} tries left.` });
    }
    setCodes((c) => ({ ...c, [p.id]: '' }));
    setMsg({ ok: true, text: `${p.order_number} delivered. The customer has been notified.` });
    load();
  };

  if (loading) return <div className="center-page"><p className="muted">Loading…</p></div>;

  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => (tab === 'active' ? ACTIVE.includes(r.status) : !ACTIVE.includes(r.status)) && (!term || (r.order_number ?? '').toLowerCase().includes(term)));
  const todayCount = rows.filter((r) => r.delivered_at && new Date(r.delivered_at).toDateString() === new Date().toDateString()).length;
  const activeCount = rows.filter((r) => ACTIVE.includes(r.status)).length;

  return (
    <>
      <div className="rider-top">
        <div><b style={{ color: 'var(--deep)' }}>Ebenoba GH Rider</b><div className="muted small">{profile?.full_name}</div></div>
        <button className="btn ghost sm" onClick={() => signOut(router)}>Sign out</button>
      </div>
      <div className="rider-wrap">
        <div className="grid g2" style={{ marginBottom: 12 }}>
          <div className="stat t-teal"><div className="stat-label">To deliver</div><div className="stat-value">{activeCount}</div></div>
          <div className="stat t-green"><div className="stat-label">Delivered today</div><div className="stat-value">{todayCount}</div></div>
        </div>
        {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        <input placeholder="Search by order number (e.g. EB-241104-10001)" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="tabs"><span className={`tab ${tab === 'active' ? 'on' : ''}`} onClick={() => setTab('active')}>To deliver</span><span className={`tab ${tab === 'done' ? 'on' : ''}`} onClick={() => setTab('done')}>History</span></div>

        {shown.map((p) => {
          const s = p.ship_to ?? {};
          const addr = [s.street, s.landmark, s.city, s.region].filter(Boolean).join(', ');
          const phone = s.phone as string | undefined;
          return (
            <div key={p.id} className="card" style={{ marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}><b style={{ fontSize: 16 }}>{p.order_number}</b><Badge s={p.status} /></div>
              <div className="muted small">Package {p.package_index} · pick up from <b>{p.shops?.name}</b>{p.shops?.city ? `, ${p.shops.city}` : ''}{p.shops?.phone ? ` · ${p.shops.phone}` : ''}</div>

              <div style={{ margin: '12px 0', padding: 12, background: 'var(--surface)', borderRadius: 10 }}>
                <div><b>{s.recipient_name || s.name}</b></div><div>{addr || 'No address'}</div>
                {s.digital_address && <div className="muted small">GPS: {s.digital_address}</div>}
                <div className="row" style={{ marginTop: 8 }}>
                  {phone && <a className="btn soft sm" href={`tel:${phone}`}>📞 Call {phone}</a>}
                  {addr && <a className="btn soft sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.digital_address || addr)}`}>🧭 Navigate</a>}
                </div>
              </div>

              <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>{(p.order_items ?? []).map((i: any) => <li key={i.id}>{i.quantity} × {i.title}{i.variant_label && i.variant_label !== 'Default' ? ` (${i.variant_label})` : ''}</li>)}</ul>
              <div className="muted small">Delivery fee {money(p.delivery_fee)}{p.eta_from ? ` · expected ${p.eta_from}${p.eta_to ? ` – ${p.eta_to}` : ''}` : ''}</div>

              {ACTIVE.includes(p.status) && (
                <div style={{ marginTop: 12 }}>
                  {p.status !== 'in_transit' && <button className="btn big-btn" disabled={busy === p.id} onClick={() => startTrip(p)}>Picked up — on my way</button>}
                  {p.status === 'in_transit' && (<>
                    <div className="field"><label>Delivery code (ask the customer — it is in their app and SMS)</label>
                      <input inputMode="numeric" maxLength={4} placeholder="••••" style={{ fontSize: 24, letterSpacing: 10, textAlign: 'center' }}
                        value={codes[p.id] ?? ''} onChange={(e) => setCodes({ ...codes, [p.id]: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></div>
                    <div className="field"><label>Received by (name)</label><input value={names[p.id] ?? s.recipient_name ?? ''} onChange={(e) => setNames({ ...names, [p.id]: e.target.value })} /></div>
                    <button className="btn big-btn" disabled={busy === p.id} onClick={() => confirm(p)}>{busy === p.id ? 'Checking…' : 'Confirm delivery'}</button>
                    <div className="muted small" style={{ marginTop: 6 }}>Do not hand over the items until the code is correct. Customer cannot find it? Call the office.</div></>)}
                </div>)}
              {p.delivered_at && <div className="muted small" style={{ marginTop: 8 }}>Delivered {dt(p.delivered_at)}{p.delivered_to_name ? ` to ${p.delivered_to_name}` : ''}</div>}
            </div>);
        })}
        {!shown.length && <div className="empty">{tab === 'active' ? 'Nothing to deliver right now.' : 'No past deliveries.'}</div>}
      </div>
    </>
  );
}
