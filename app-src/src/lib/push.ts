// Registers this phone for push notifications and saves the token on the user's profile,
// which is what the send-notifications and promo-notifier functions read.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { getNotifications } from './notifications';

export async function registerForPush(userId: string) {
  try {
    const Notifications = getNotifications();
    if (!Notifications) return; // Expo Go: push only works in a real build
    const Device = require('expo-device') as typeof import('expo-device');
    if (!Device.isDevice) return; // simulators cannot receive push
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Orders & offers', importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#D50100',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
    if (!projectId) { console.warn('No EAS projectId yet — run `eas init`; push tokens need it.'); return; }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  } catch (e) {
    console.warn('push registration failed', e); // never block sign-in because of push
  }
}

export async function clearPushToken(userId: string) {
  await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
}
