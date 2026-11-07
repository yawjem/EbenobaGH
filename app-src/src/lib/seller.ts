import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import { useAuth } from '../state/auth';

// The shop owned by the signed-in user (null until an admin approves their application).
export function useMyShop() {
  const { session } = useAuth();
  const [shop, setShop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!session) { setShop(null); setLoading(false); return; }
    const { data } = await supabase.from('shops').select('*').eq('owner_id', session.user.id).limit(1).maybeSingle();
    setShop(data); setLoading(false);
  }, [session?.user.id]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));
  return { shop, loading, reload };
}

// Opens the photo library and returns a local file uri (or null if cancelled / not allowed).
export async function pickImage(square = false): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) { Alert.alert('Photos are off', 'Allow photo access in your phone settings to add pictures.'); return null; }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true, aspect: square ? [1, 1] : [4, 3] });
  return r.canceled ? null : r.assets[0].uri;
}

// Uploads to Storage and returns the public URL. The first folder MUST be the shop id:
// the storage policy only lets the shop's owner (or an admin) write there.
export async function uploadImage(bucket: 'shop-assets' | 'product-media', folder: string, uri: string): Promise<string> {
  const ext = /\.png($|\?)/i.test(uri) ? 'png' : 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buf = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: ext === 'png' ? 'image/png' : 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export const REGIONS = ['Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern', 'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Oti', 'Savannah', 'North East', 'Western North'];

// Friendly messages for the database error codes raised by the seller functions.
export const friendlyError = (m: string) =>
  m.includes('application_pending') ? 'You already have an application waiting for review.'
  : m.includes('already_has_shop') ? 'You already have a shop.'
  : m.includes('missing_details') ? 'Please fill in the shop name, phone, region and city.'
  : m.includes('not_authenticated') ? 'Please sign in first.'
  : m;
