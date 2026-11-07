'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createUser } from '@/lib/createUser';
import { Badge, Empty, PageHeader } from '@/lib/ui';

const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Oti', 'Savannah', 'North East', 'Western North'];
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const blank = { name: '', phone: '', region: 'Ashanti', city: '', commission_pct: '10', owner_name: '', owner_email: '', owner_phone: '', owner_password: '' };

export default function Shops() {
  const [shops, setShops] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('shops').select('*, owner:profiles!owner_id(full_name,email,phone)').order('created_at', { ascending: false });
    setShops(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const owner = await createUser({ email: f.owner_email, full_name: f.owner_name, phone: f.owner_phone, password: f.owner_password, role: 'seller' });
      let slug = slugify(f.name);
      const { data: taken } = await supabase.from('shops').select('id').eq('slug', slug).maybeSingle();
      if (taken) slug += '-' + Math.random().toString(36).slice(2, 5);
      const { error } = await supabase.from('shops').insert({
        owner_id: owner.id, name: f.name.trim(), slug, phone: f.phone || null, region: f.region, city: f.city || null,
        commission_pct: Number(f.commission_pct), status: 'active',
      });
      if (error) throw error;
      setMsg({ ok: true, text: `Shop created. ${owner.created ? 'Share the login (email + password) with the owner.' : 'The existing account was linked as owner.'}` });
      setF(blank); setOpen(false); load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); }
    setBusy(false);
  };

  const update = async (id: string, patch: any) => {
    const { error } = await supabase.from('shops').update(patch).eq('id', id);
    if (error) setMsg({ ok: false, text: error.message }); else load();
  };

  const inp = (k: keyof typeof blank, label: string, extra: any = {}) => (
    <div className="field"><label>{label}</label><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} /></div>);

  return (
    <>
      <PageHeader title="Shops" sub="Add shops and their owners. Buyers never see a shop list — products are mixed, with “Sold by” on the product page.">
        <button className="btn" onClick={() => setOpen(true)}>+ Add shop</button>
      </PageHeader>
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Shop</th><th>Owner</th><th>Location</th><th>Commission %</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {shops.map((s) => (
            <tr key={s.id}>
              <td><b>{s.name}</b><div className="muted small">{s.phone}</div></td>
              <td>{s.owner ? <>{s.owner.full_name}<div className="muted small">{s.owner.email}</div></> : <span className="muted">no owner</span>}</td>
              <td>{[s.city, s.region].filter(Boolean).join(', ')}</td>
              <td style={{ width: 110 }}><input type="number" min={0} max={100} step="0.5" defaultValue={s.commission_pct}
                onBlur={(e) => Number(e.target.value) !== Number(s.commission_pct) && update(s.id, { commission_pct: Number(e.target.value) })} /></td>
              <td><Badge s={s.status} /></td>
              <td className="right nowrap">
                {s.status !== 'active' && <button className="btn sm" onClick={() => update(s.id, { status: 'active' })}>Approve</button>}{' '}
                {s.status === 'active' && <button className="btn ghost sm" onClick={() => confirm(`Suspend ${s.name}? All its products disappear from the app.`) && update(s.id, { status: 'suspended' })}>Suspend</button>}
              </td>
            </tr>))}
        </tbody>
      </table>{!shops.length && <Empty text="No shops yet." />}</div>
      <p className="muted small">Commission changes apply to new orders only; existing orders keep the rate they were placed with.</p>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={create}>
            <h2>New shop and owner</h2>
            <div className="grid g2">
              {inp('name', 'Shop name', { required: true })}{inp('phone', 'Shop phone')}
              <div className="field"><label>Region</label><select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
              {inp('city', 'City / town')}{inp('commission_pct', 'Commission %', { type: 'number', min: 0, max: 100, step: '0.5' })}
            </div>
            <h2 style={{ marginTop: 8 }}>Owner login</h2>
            <div className="grid g2">
              {inp('owner_name', 'Owner full name', { required: true })}{inp('owner_phone', 'Owner phone')}
              {inp('owner_email', 'Owner email', { type: 'email', required: true })}{inp('owner_password', 'Temporary password (8+ chars)', { type: 'text' })}
            </div>
            <p className="muted small">If the email already has an account, it is linked as the owner and the password is ignored.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create shop'}</button>
            </div>
          </form>
        </div>)}
    </>
  );
}
