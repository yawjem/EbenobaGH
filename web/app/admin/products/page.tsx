'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, Empty, PageHeader, money } from '@/lib/ui';

const blank = { shop_id: '', category_id: '', brand_id: '', title: '', description: '', price: '', sale_price: '', stock: '10' };

export default function Products() {
  const [rows, setRows] = useState<any[]>([]);
  const [shops, setShops] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    let qb = supabase.from('products').select('id,title,price,sale_price,status,is_featured,created_at,shops(name),categories:category_id(name),product_variants(stock_qty)').order('created_at', { ascending: false }).limit(200);
    if (q.trim()) qb = qb.ilike('title', `%${q.trim()}%`);
    const { data } = await qb; setRows(data ?? []);
  };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    (async () => {
      const [s, c, b] = await Promise.all([
        supabase.from('shops').select('id,name').order('name'), supabase.from('categories').select('id,name,parent_id').order('name'), supabase.from('brands').select('id,name').order('name')]);
      setShops(s.data ?? []); setCats(c.data ?? []); setBrands(b.data ?? []);
    })();
  }, []);

  const patch = async (id: string, p: any) => {
    const { error } = await supabase.from('products').update(p).eq('id', id);
    if (error) setMsg({ ok: false, text: error.message }); else load();
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const price = Number(f.price), sale = f.sale_price ? Number(f.sale_price) : null;
      if (sale !== null && sale >= price) throw new Error('Sale price must be lower than the normal price.');
      const { data: p, error } = await supabase.from('products').insert({
        shop_id: f.shop_id, category_id: f.category_id || null, brand_id: f.brand_id || null,
        title: f.title.trim(), description: f.description || null, price, sale_price: sale, status: 'active',
      }).select('id').single();
      if (error) throw error;
      const v = await supabase.from('product_variants').insert({ product_id: p.id, label: 'Default', stock_qty: Number(f.stock) || 0 });
      if (v.error) throw v.error;
      if (file) {
        const path = `${f.shop_id}/${crypto.randomUUID()}.${file.name.split('.').pop() || 'jpg'}`;
        const up = await supabase.storage.from('product-media').upload(path, file, { contentType: file.type });
        if (up.error) throw up.error;
        const url = supabase.storage.from('product-media').getPublicUrl(path).data.publicUrl;
        await supabase.from('product_media').insert({ product_id: p.id, url, is_primary: true, position: 0 });
      }
      setMsg({ ok: true, text: 'Product added.' }); setF(blank); setFile(null); setOpen(false); load();
    } catch (err: any) { setMsg({ ok: false, text: err.message }); }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Products" sub="All shops. Shop owners manage their own products in the seller portal (next phase).">
        <input style={{ width: 240 }} placeholder="Search title…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" onClick={() => setOpen(true)}>+ Add product</button>
      </PageHeader>
      {msg && <div className={`notice ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
      <div className="table-wrap"><table>
        <thead><tr><th>Product</th><th>Shop</th><th>Category</th><th className="right">Price</th><th className="right">Stock</th><th>Status</th><th>Featured</th></tr></thead>
        <tbody>
          {rows.map((p) => {
            const stock = (p.product_variants ?? []).reduce((n: number, v: any) => n + v.stock_qty, 0);
            return (
              <tr key={p.id}>
                <td><b>{p.title}</b></td><td>{p.shops?.name}</td><td className="muted">{p.categories?.name}</td>
                <td className="right nowrap">{p.sale_price ? <><s className="muted">{money(p.price)}</s> {money(p.sale_price)}</> : money(p.price)}</td>
                <td className="right" style={{ color: stock <= 5 ? 'var(--primary)' : undefined, fontWeight: stock <= 5 ? 700 : 400 }}>{stock}</td>
                <td><select value={p.status} style={{ width: 120 }} onChange={(e) => patch(p.id, { status: e.target.value })}><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option></select></td>
                <td><input type="checkbox" style={{ width: 'auto' }} checked={p.is_featured} onChange={(e) => patch(p.id, { is_featured: e.target.checked })} /></td>
              </tr>);
          })}
        </tbody>
      </table>{!rows.length && <Empty text="No products." />}</div>

      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={create}>
            <h2>Add product</h2>
            <div className="field"><label>Shop</label><select required value={f.shop_id} onChange={(e) => setF({ ...f, shop_id: e.target.value })}><option value="">Choose…</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label>Title</label><input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="grid g2">
              <div className="field"><label>Category</label><select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? '↳ ' : ''}{c.name}</option>)}</select></div>
              <div className="field"><label>Brand</label><select value={f.brand_id} onChange={(e) => setF({ ...f, brand_id: e.target.value })}><option value="">—</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div className="field"><label>Price (GH₵)</label><input required type="number" min="0" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
              <div className="field"><label>Sale price (optional)</label><input type="number" min="0" step="0.01" value={f.sale_price} onChange={(e) => setF({ ...f, sale_price: e.target.value })} /></div>
              <div className="field"><label>Stock</label><input type="number" min="0" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></div>
              <div className="field"><label>Photo</label><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            </div>
            <div className="field"><label>Description</label><textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Add product'}</button></div>
          </form>
        </div>)}
    </>
  );
}
