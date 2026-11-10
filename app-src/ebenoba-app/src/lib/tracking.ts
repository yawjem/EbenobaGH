// Behaviour tracking (views, dwell time, searches, wishlist/cart actions).
// NOTHING is sent unless the user has accepted tracking on first launch.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const CONSENT_KEY = 'tracking_consent'; // 'yes' | 'no'
const DEVICE_KEY = 'device_id';
let consent: 'yes' | 'no' | null = null;
let deviceId: string | null = null;

export async function loadTrackingState() {
  consent = ((await AsyncStorage.getItem(CONSENT_KEY)) as any) ?? null;
  deviceId = await AsyncStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = 'd_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(DEVICE_KEY, deviceId);
  }
  return consent;
}

export const getConsent = () => consent;
export const getDeviceId = () => deviceId;

export async function setConsent(value: 'yes' | 'no') {
  consent = value;
  await AsyncStorage.setItem(CONSENT_KEY, value);
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await supabase.from('profiles').update({ tracking_consent: value === 'yes' }).eq('id', data.user.id);
    if (value === 'yes' && deviceId) await supabase.rpc('claim_device_events', { p_device_id: deviceId });
    if (value === 'no') await supabase.rpc('delete_my_tracking_data');
  }
}

type EventInput = {
  event_type: 'view' | 'search' | 'wishlist_add' | 'cart_add' | 'purchase';
  product_id?: string;
  category_id?: string | null;
  duration_seconds?: number;
  search_query?: string;
};

export async function track(e: EventInput) {
  if (consent !== 'yes' || !deviceId) return;
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from('product_events').insert({
      ...e,
      device_id: deviceId,
      user_id: data.user?.id ?? null,
    });
  } catch {
    /* tracking must never break the app */
  }
}

// Called right after login/sign-up to merge guest activity into the account.
export async function claimGuestEvents() {
  if (consent === 'yes' && deviceId) {
    await supabase.rpc('claim_device_events', { p_device_id: deviceId });
    const { data } = await supabase.auth.getUser();
    if (data.user) await supabase.from('profiles').update({ tracking_consent: true }).eq('id', data.user.id);
  }
}
