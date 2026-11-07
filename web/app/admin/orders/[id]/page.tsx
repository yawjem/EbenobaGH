'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, PACKAGE_STATUSES, PageHeader, STATUS_LABEL, dt, money } from '@/lib/ui';

type Draft = { status: string; rider_id: string; delivery_method: string; courier_name: string; tracking_number: string; eta_from: string; eta_to: string };

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [riders, setRiders] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<string, { pin: string; attempts: number }>>({});

  const load = async () => {
    const [o, r] = await Promise.all([
      supabase.from('orders').select('*, buyer:profiles!buyer_id(full_name,phone,email), payments(*), packages(*, shops(name,phone,city), rider:profiles!rider_id(full_name,phone), order_items(*), package_status_history(status,created_at,note))').eq('id', id).single(),
      supabase.from('profiles').select('id,full_name,phone').eq('role', 'rider').order('full_name'),
    ]);
    setOrder(o.data); setRiders(r.data ?? []);
    const d: Record<string, Draft> = {};
    (o.data?.packages ?? []).forEach((p: any) => {
      d[p.id] = { status: p.status, rider_id: p.rider_id ?? '', delivery_method: p.delivery_method, courier_name: p.courier_name ?? '', tracking_number: p.tracking_number ?? '', eta_from: p.eta_from ?? '', eta_to: p.eta_to ?? '' };
    });
    setDrafts(d);
    const ids = (o.data?.packages ?? []).map((p: any) => p.id);
    if (ids.length) {
      const { data: pn } = await supabase.from('package_pins').select('package_id,pin,attempts').in('package_id', ids);
      setPins(Object.fromEntries((pn ?? []).map((x: any) => [x.package_id, { pin: x.pin, attempts: x.attempts }])));
    }
  };

  const resetPin = async (pid: string) => {
    if (!confirm('Issue a new delivery code and unlock this package? Tell the customer the new code (it also shows in their app).')) return;
    const { data, error } = await supabase.rpc('admin_reset_delivery_pin', { p_package: pid });
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `New delivery code: ${data}. It is now shown in the customer's app.` }); load();
  };
  useEffect(() => { load(); }, [id]);

  const set = (pid: string, k: keyof Draft, v: string) => setDrafts((d) => ({ ...d, [pid]: { ...d[pid], [k]: v } }));

  const save = async (p: any) => {
    const d = drafts[p.id]; setSaving(p.id); setMsg(null);
    let status = d.status;
    // Assigning a rider to a package that is ready to go moves it to "assigned" automatically.
    if (d.rider_id && !p.rider_id && ['paid', 'processing', 'ready'].includes(status)) status = 'assigned';
    if (d.delivery_method === 'courier' && !d.courier_name.trim() && ['dispatched', 'in_transit'].includes(status)) {
      setSaving(null); return setMsg({ ok: false, text: 'Enter the courier name (e.g. Shaq Express) for courier deliveries.' });
    }
    const { error } = await supabase.from('packages').update({
      status, rider_id: d.rider_id || null, delivery_method: d.delivery_method,
      courier_name: d.delivery_method === 'courier' ? d.courier_name.trim() || null : null,
      tracking_number: d.tracking_number.trim() || null, eta_from: d.eta_from || null, eta_to: d.eta_to || null,
    }).eq('id', p.id);
    setSaving(null);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: `Saved. ${STATUS_LABEL[status]}${status !== p.status ? ' — the customer is being notified.' : ''}` });
    load();
  };

  const ship = (o: any) => o.ship_to ?? {};
  if (!order) return <p className="muted">Loading…</p>;
  const pays = order.payments ?? [];

  return (
    <>
      <PageHeader title={order.order_number} sub={`Placed ${dt(order.created_at)}`}>
        <Link href="/admin/orders" className="btn ghost sm">← All orders</Link>
      </PageHeader>
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      {order.needs_review && <div className="notice err"><b>Needs review:</b> {order.review_note}</div>}

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="card"><h2>Customer</h2><b>{order.buyer?.full_name || '—'}</b><div>{order.buyer?.phone}</div><div className="muted">{order.buyer?.email}</div></div>
        <div className="card"><h2>Deliver to</h2><b>{ship(order).recipient_name || ship(order).name}</b> · {ship(order).phone}
          <div>{[ship(order).street, ship(order).landmark, ship(order).city, ship(order).region].filter(Boolean).join(', ')}</div>
          {ship(order).digital_address && <div className="muted">GPS: {ship(order).digital_address}</div>}</div>
        <div className="card"><h2>Payment</h2><div className="row"><Badge s={order.status} /><b>{money(order.total)}</b></div>
          <div className="muted small">Items {money(order.subtotal)} · Delivery {money(order.delivery_total)}</div>
          {pays.map((p: any) => <div key={p.id} className="small muted" style={{ marginTop: 4 }}>{p.channel ?? 'payment'} · {p.reference} · <Badge s={p.status} /></div>)}</div>
      </div>

      {(order.packages ?? []).sort((a: any, b: any) => a.package_index - b.package_index).map((p: any, idx: number, arr: any[]) => {
        const d = drafts[p.id]; if (!d) return null;
        return (
          <div key={p.id} className="card" style={{ marginBottom: 16 }}>
            <div className="page-head" style={{ marginBottom: 10 }}>
              <div><h2 style={{ marginBottom: 2 }}>Package {idx + 1} of {arr.length} · {p.shops?.name}</h2>
                <span className="muted small">{p.shops?.city} {p.shops?.phone ? `· ${p.shops.phone}` : ''}</span></div>
              <Badge s={p.status} />
            </div>
            <table><tbody>
              {(p.order_items ?? []).map((it: any) => (
                <tr key={it.id}><td>{it.quantity} × {it.title}{it.variant_label && it.variant_label !== 'Default' ? ` (${it.variant_label})` : ''}</td>
                  <td className="muted small">{Number(it.platform_discount_per_unit) > 0 ? 'platform promo' : Number(it.seller_discount_per_unit) > 0 ? 'seller sale' : ''}</td>
                  <td className="right">{money(it.line_total)}</td></tr>))}
              <tr><td colSpan={2} className="muted">Delivery fee · commission {Number(p.commission_pct)}% ({money(p.commission_amount)}) · shop earns {money(p.shop_earnings)}</td><td className="right">{money(p.delivery_fee)}</td></tr>
            </tbody></table>

            <div className="grid g4" style={{ marginTop: 14 }}>
              <div className="field"><label>Status</label>
                <select value={d.status} onChange={(e) => set(p.id, 'status', e.target.value)}>{PACKAGE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
              <div className="field"><label>Delivery method</label>
                <select value={d.delivery_method} onChange={(e) => set(p.id, 'delivery_method', e.target.value)}>
                  <option value="rider">Our rider</option><option value="courier">Courier (e.g. Shaq Express)</option><option value="pickup">Customer pickup</option></select></div>
              {d.delivery_method === 'rider' && <div className="field"><label>Rider</label>
                <select value={d.rider_id} onChange={(e) => set(p.id, 'rider_id', e.target.value)}><option value="">— not assigned —</option>
                  {riders.map((r) => <option key={r.id} value={r.id}>{r.full_name || r.phone}</option>)}</select></div>}
              {d.delivery_method === 'courier' && <>
                <div className="field"><label>Courier company</label><input value={d.courier_name} placeholder="Shaq Express" onChange={(e) => set(p.id, 'courier_name', e.target.value)} /></div>
                <div className="field"><label>Courier tracking number</label><input value={d.tracking_number} onChange={(e) => set(p.id, 'tracking_number', e.target.value)} /></div></>}
              <div className="field"><label>Estimated delivery from</label><input type="date" value={d.eta_from} onChange={(e) => set(p.id, 'eta_from', e.target.value)} /></div>
              <div className="field"><label>… to</label><input type="date" value={d.eta_to} onChange={(e) => set(p.id, 'eta_to', e.target.value)} /></div>
            </div>
            <div className="row"><button className="btn" disabled={saving === p.id} onClick={() => save(p)}>{saving === p.id ? 'Saving…' : 'Save package'}</button>
              {p.rider?.full_name && <span className="muted small">Rider: {p.rider.full_name} {p.rider.phone ? `(${p.rider.phone})` : ''}</span>}
              {pins[p.id] && d.delivery_method === 'rider' && !p.delivered_at && (
                <span className="small">Delivery code <b style={{ letterSpacing: 2 }}>{pins[p.id].pin}</b>{pins[p.id].attempts > 0 ? ` · ${pins[p.id].attempts} wrong tries${pins[p.id].attempts >= 5 ? ' (LOCKED)' : ''}` : ''} <button className="btn ghost sm" onClick={() => resetPin(p.id)}>New code / unlock</button></span>)}
              {p.delivered_at && <span className="muted small">Delivered {dt(p.delivered_at)}{p.delivered_to_name ? ` to ${p.delivered_to_name}` : ''}</span>}</div>

            <details style={{ marginTop: 12 }}><summary className="muted small" style={{ cursor: 'pointer' }}>Status history</summary>
              <ul className="timeline">{(p.package_status_history ?? []).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)).map((h: any, i: number) =>
                <li key={i}>{STATUS_LABEL[h.status]} <span className="muted">· {dt(h.created_at)}</span></li>)}</ul></details>
          </div>);
      })}
    </>
  );
}
