import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { pickImage, uploadImage, useMyShop } from '../../src/lib/seller';
import { colors, radius } from '../../src/lib/theme';
import { Button } from '../../src/components/ui';
import { column } from '../../src/lib/responsive';

type Img = { id?: string; url: string; local?: string };
const MAX_VIEWS = 4;
type Variant = { id?: string; label: string; stock: string; price: string };
const SALE_LENGTHS: [string, number | null][] = [['No end date', null], ['3 days', 3], ['7 days', 7], ['14 days', 14], ['30 days', 30]];
const num = (s: string) => Number(String(s).replace(/,/g, '').trim());

export default function ProductEditor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { shop, loading: shopLoading } = useMyShop();
  const [ready, setReady] = useState(!id);
  const [busy, setBusy] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [removedImgs, setRemovedImgs] = useState<string[]>([]);
  const [removedVariants, setRemovedVariants] = useState<string[]>([]);
  const [origStatus, setOrigStatus] = useState<string | undefined>(undefined);
  const [boxImg, setBoxImg] = useState<Img | null>(null);
  const [useImg, setUseImg] = useState<Img | null>(null);
  const [f, setF] = useState({ title: '', description: '', weight: '0.5', price: '', sale_price: '', sale_days: undefined as number | null | undefined, category_id: null as string | null, brand_id: null as string | null, status: 'active', is_returnable: true });
  const [imgs, setImgs] = useState<Img[]>([]);   // the optional extra views
  const [variants, setVariants] = useState<Variant[]>([{ label: 'Default', stock: '1', price: '' }]);

  useEffect(() => {
    supabase.from('categories').select('id,name').order('name').then(({ data }) => setCats(data ?? []));
    supabase.from('brands').select('id,name').order('name').then(({ data }) => setBrands(data ?? []));
  }, []);

  useEffect(() => {
    if (!id || !shop) return;
    (async () => {
      const { data } = await supabase.from('products').select('*, product_media(id,url,position,is_primary,slot), product_variants(id,label,stock_qty,price_override,is_active)').eq('id', id).eq('shop_id', shop.id).maybeSingle();
      if (!data) { Alert.alert('Product not found'); return router.back(); }
      setOrigStatus(data.status);
      setF({ title: data.title, description: data.description ?? '', weight: String(data.weight_kg ?? 0.5), price: String(data.price), sale_price: data.sale_price ? String(data.sale_price) : '',
        sale_days: undefined, category_id: data.category_id, brand_id: data.brand_id, status: data.status, is_returnable: data.is_returnable });
      const media = [...data.product_media].sort((a: any, b: any) => a.position - b.position);
      const one = (slot: string) => { const m = media.find((x: any) => x.slot === slot); return m ? { id: m.id, url: m.url } : null; };
      setBoxImg(one('box')); setUseImg(one('in_use'));
      setImgs(media.filter((m: any) => m.slot === 'view').map((m: any) => ({ id: m.id, url: m.url })));
      const vs = data.product_variants.filter((v: any) => v.is_active).map((v: any) => ({ id: v.id, label: v.label, stock: String(v.stock_qty), price: v.price_override != null ? String(v.price_override) : '' }));
      setVariants(vs.length ? vs : [{ label: 'Default', stock: '0', price: '' }]);
      setReady(true);
    })();
  }, [id, shop?.id]);

  if (shopLoading || !ready) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  if (!shop) return null;

  const addImage = async () => {
    if (imgs.length >= MAX_VIEWS) return Alert.alert(`Up to ${MAX_VIEWS} extra views`);
    const uri = await pickImage(false); if (uri) setImgs([...imgs, { url: uri, local: uri }]);
  };
  // Required slots: choosing again REPLACES the picture (keeps the row id so the old one is overwritten, never deleted)
  const pickSlot = async (cur: Img | null, set: (i: Img) => void) => {
    const uri = await pickImage(false); if (uri) set({ id: cur?.id, url: uri, local: uri });
  };
  const removeImage = (i: number) => { const im = imgs[i]; if (im.id) setRemovedImgs([...removedImgs, im.id]); setImgs(imgs.filter((_, k) => k !== i)); };
  const setVar = (i: number, patch: Partial<Variant>) => setVariants(variants.map((v, k) => (k === i ? { ...v, ...patch } : v)));
  const removeVar = (i: number) => { const v = variants[i]; if (v.id) setRemovedVariants([...removedVariants, v.id]); setVariants(variants.filter((_, k) => k !== i)); };

  const save = async () => {
    const price = num(f.price);
    const sale = f.sale_price.trim() === '' ? null : num(f.sale_price);
    if (f.title.trim().length < 2) return Alert.alert('Add a product name');
    if (!(price > 0)) return Alert.alert('Enter a price above 0');
    if (sale !== null && (!(sale > 0) || sale >= price)) return Alert.alert('Sale price must be lower than the price');
    const active = variants.filter((v) => v.label.trim());
    if (!active.length) return Alert.alert('Add at least one option (e.g. “Default”) with its stock');
    for (const v of active) {
      if (!Number.isInteger(num(v.stock)) || num(v.stock) < 0) return Alert.alert(`Check the stock for “${v.label}”`, 'Use a whole number, 0 or more.');
      if (v.price.trim() !== '' && !(num(v.price) >= 0)) return Alert.alert(`Check the price for “${v.label}”`);
    }
    const weight = num(f.weight);
    if (!(weight > 0 && weight <= 1000)) return Alert.alert('Enter the weight in kg', 'Used to price international delivery. A phone is about 0.3, a blender about 3.');
    if (f.status === 'active' && (!boxImg || !useImg)) return Alert.alert('Two pictures are required', 'Add one picture of the product in its box and one out of the box or in use. Or set the product to Hidden for now.');

    setBusy(true);
    let createdNow = false; let pid: string | undefined;
    try {
      const body: any = {
        title: f.title.trim(), description: f.description.trim() || null, price, category_id: f.category_id, brand_id: f.brand_id,
        // going Live is the LAST step (after the pictures are saved), so the database can check the two required photos exist
        status: f.status === 'active' && origStatus !== 'active' ? (origStatus ?? 'draft') : f.status,
        is_returnable: f.is_returnable, weight_kg: weight,
        sale_price: sale,
      };
      if (sale === null) { body.sale_starts_at = null; body.sale_ends_at = null; }
      else if (f.sale_days !== undefined || !id) { body.sale_starts_at = new Date().toISOString(); body.sale_ends_at = f.sale_days ? new Date(Date.now() + f.sale_days * 86400000).toISOString() : null; }

      pid = id as string | undefined;
      if (pid) { const { error } = await supabase.from('products').update(body).eq('id', pid); if (error) throw error; }
      else { const { data, error } = await supabase.from('products').insert({ ...body, shop_id: shop.id }).select('id').single(); if (error) throw error; pid = data.id; createdNow = true; }

      // variants: update/insert; removed ones are switched off (they may belong to past orders, so they are never deleted)
      for (const v of active) {
        const row = { label: v.label.trim(), stock_qty: num(v.stock), price_override: v.price.trim() === '' ? null : num(v.price), is_active: true };
        const { error } = v.id ? await supabase.from('product_variants').update(row).eq('id', v.id) : await supabase.from('product_variants').insert({ ...row, product_id: pid });
        if (error) throw error;
      }
      if (removedVariants.length) { const { error } = await supabase.from('product_variants').update({ is_active: false }).in('id', removedVariants); if (error) throw error; }

      // pictures
      if (removedImgs.length) { const { error } = await supabase.from('product_media').delete().in('id', removedImgs); if (error) throw error; }
      // the two required pictures: replace the file on the existing row, or insert it the first time
      const saveSlot = async (im: Img | null, slot: 'box' | 'in_use', position: number) => {
        if (!im) return;
        const row: any = { position, is_primary: slot === 'in_use' };
        if (im.local) row.url = await uploadImage('product-media', `${shop.id}/${pid}`, im.local);
        const { error } = im.id ? await supabase.from('product_media').update(row).eq('id', im.id)
          : await supabase.from('product_media').insert({ ...row, product_id: pid, kind: 'image', slot });
        if (error) throw error;
      };
      await saveSlot(useImg, 'in_use', 0);
      await saveSlot(boxImg, 'box', 1);
      for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i];
        if (im.id) { const { error } = await supabase.from('product_media').update({ position: 2 + i, is_primary: false }).eq('id', im.id); if (error) throw error; }
        else {
          const url = await uploadImage('product-media', `${shop.id}/${pid}`, im.local!);
          const { error } = await supabase.from('product_media').insert({ product_id: pid, url, kind: 'image', position: 2 + i, is_primary: false, slot: 'view' }); if (error) throw error;
        }
      }
      if (body.status !== f.status) { const { error } = await supabase.from('products').update({ status: f.status }).eq('id', pid!); if (error) throw error; }
      router.back();
    } catch (e: any) {
      // A brand-new product that failed half-way is removed (its options and picture rows go with it), so retrying never leaves a duplicate.
      if (createdNow && pid) await supabase.from('products').delete().eq('id', pid);
      Alert.alert('Could not save', e.message ?? String(e));
    }
    setBusy(false);
  };

  const inp = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginTop: 6, backgroundColor: '#fff' } as const;
  const lab = { color: colors.muted, fontWeight: '600', fontSize: 12, marginTop: 16 } as const;
  const chip = (on: boolean) => ({ paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderRadius: radius.pill, backgroundColor: on ? colors.primary : colors.blush });
  const chipTxt = (on: boolean) => ({ color: on ? '#fff' : colors.deep, fontWeight: '600' as const });

  return (
    <>
      <Stack.Screen options={{ title: id ? 'Edit product' : 'Add product' }} />
      <ScrollView contentContainerStyle={{ ...column, padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.bg }}>
        <Text style={lab}>Pictures</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Buyers trust products with clear photos. The first two are required to publish.</Text>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
          {([['In the box', 'The product in its packaging', boxImg, setBoxImg], ['Out of the box / in use', 'Unpacked, or being used', useImg, setUseImg]] as const).map(([title, hint, img, set]) => (
            <Pressable key={title} onPress={() => pickSlot(img, set as any)} accessibilityRole="button" accessibilityLabel={`${title} picture`}
              style={{ flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderStyle: img ? 'solid' : 'dashed', borderColor: img ? colors.border : colors.primary, backgroundColor: colors.blush, overflow: 'hidden' }}>
              {img ? <Image source={{ uri: img.url }} style={{ width: '100%', aspectRatio: 1, backgroundColor: colors.surface }} />
                : <View style={{ aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                    <Ionicons name="camera-outline" size={30} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: '700', marginTop: 4 }}>Add photo</Text></View>}
              <View style={{ padding: 8, backgroundColor: '#fff' }}>
                <Text style={{ fontWeight: '800', color: colors.deep, fontSize: 13 }}>{title} <Text style={{ color: colors.primary }}>*</Text></Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{img ? 'Tap to replace' : hint}</Text>
              </View>
            </Pressable>))}
        </View>
        <Text style={[lab, { marginTop: 14 }]}>More views (optional, up to {MAX_VIEWS})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {imgs.map((im, i) => (
            <View key={im.url + i} style={{ marginRight: 10 }}>
              <Image source={{ uri: im.url }} style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surface }} />
              <Pressable onPress={() => removeImage(i)} style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 11, padding: 3 }}><Ionicons name="close" size={14} color="#fff" /></Pressable>
            </View>))}
          {imgs.length < MAX_VIEWS && (
            <Pressable onPress={addImage} style={{ width: 96, height: 96, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blush }}>
              <Ionicons name="add" size={28} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 12 }}>Add view</Text></Pressable>)}
        </ScrollView>

        <Text style={lab}>Product name</Text><TextInput style={inp} value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
        <Text style={lab}>Description</Text><TextInput style={[inp, { minHeight: 100, textAlignVertical: 'top' }]} multiline value={f.description} onChangeText={(v) => setF({ ...f, description: v })} placeholder="Size, material, what is in the box, warranty…" />

        <Text style={lab}>Weight (kg)</Text>
        <TextInput style={inp} keyboardType="decimal-pad" value={f.weight} onChangeText={(v) => setF({ ...f, weight: v })} placeholder="e.g. 0.5" />
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Weight with packaging. Used to price delivery to other countries.</Text>

        <Text style={lab}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {cats.map((c) => <Pressable key={c.id} onPress={() => setF({ ...f, category_id: f.category_id === c.id ? null : c.id })} style={chip(f.category_id === c.id)}><Text style={chipTxt(f.category_id === c.id)}>{c.name}</Text></Pressable>)}
        </ScrollView>
        {brands.length > 0 && (<>
          <Text style={lab}>Brand (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {brands.map((b) => <Pressable key={b.id} onPress={() => setF({ ...f, brand_id: f.brand_id === b.id ? null : b.id })} style={chip(f.brand_id === b.id)}><Text style={chipTxt(f.brand_id === b.id)}>{b.name}</Text></Pressable>)}
          </ScrollView>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Brand missing? Ask Ebenoba GH to add it.</Text></>)}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Text style={lab}>Price (GH₵)</Text><TextInput style={inp} keyboardType="decimal-pad" value={f.price} onChangeText={(v) => setF({ ...f, price: v })} /></View>
          <View style={{ flex: 1 }}><Text style={lab}>Sale price (optional)</Text><TextInput style={inp} keyboardType="decimal-pad" value={f.sale_price} onChangeText={(v) => setF({ ...f, sale_price: v })} placeholder="Discount" /></View>
        </View>
        {f.sale_price.trim() !== '' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            {SALE_LENGTHS.map(([name, d]) => <Pressable key={name} onPress={() => setF({ ...f, sale_days: d })} style={chip(f.sale_days === d || (f.sale_days === undefined && !id && d === null))}><Text style={chipTxt(f.sale_days === d || (f.sale_days === undefined && !id && d === null))}>{name}</Text></Pressable>)}
          </ScrollView>)}
        {f.sale_price.trim() !== '' && <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Sale discounts are paid for by you. Customers who liked this item get a notification.{id && f.sale_days === undefined ? ' Current sale dates are kept unless you pick a length.' : ''}</Text>}

        <Text style={lab}>Options and stock</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>One option is enough (“Default”). Add more for sizes or colours.</Text>
        {variants.map((v, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <TextInput style={[inp, { flex: 2, marginTop: 0 }]} placeholder="Option (e.g. Black, XL)" value={v.label} onChangeText={(t) => setVar(i, { label: t })} />
            <TextInput style={[inp, { flex: 1, marginTop: 0 }]} keyboardType="number-pad" placeholder="Stock" value={v.stock} onChangeText={(t) => setVar(i, { stock: t })} />
            <TextInput style={[inp, { flex: 1, marginTop: 0 }]} keyboardType="decimal-pad" placeholder="Price*" value={v.price} onChangeText={(t) => setVar(i, { price: t })} />
            {variants.length > 1 && <Pressable onPress={() => removeVar(i)}><Ionicons name="trash-outline" size={20} color={colors.muted} /></Pressable>}
          </View>))}
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>*Only fill “Price” if this option costs differently; a custom price replaces the sale price.</Text>
        <Pressable onPress={() => setVariants([...variants, { label: '', stock: '0', price: '' }])} style={{ marginTop: 8 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>+ Add another option</Text></Pressable>

        <Text style={lab}>Visibility</Text>
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          {[['active', 'Live'], ['draft', 'Hidden'], ['archived', 'Archived']].map(([k, n]) => <Pressable key={k} onPress={() => setF({ ...f, status: k })} style={chip(f.status === k)}><Text style={chipTxt(f.status === k)}>{n}</Text></Pressable>)}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <View style={{ flex: 1, paddingRight: 12 }}><Text style={{ fontWeight: '600' }}>Customers can return this item</Text><Text style={{ color: colors.muted, fontSize: 12 }}>Turn off for items like underwear or perishables.</Text></View>
          <Switch value={f.is_returnable} trackColor={{ true: colors.primary }} onValueChange={(v) => setF({ ...f, is_returnable: v })} />
        </View>

        <Button title={id ? 'Save changes' : 'Publish product'} loading={busy} onPress={save} style={{ marginTop: 24 }} />
      </ScrollView>
    </>
  );
}
