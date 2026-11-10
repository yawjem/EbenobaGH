// Push notifications only work in a real build of the app (development build or Play Store build).
// Expo Go cannot receive remote push on Android and is missing native modules the notifications package needs,
// and merely importing the package there crashes the whole app. So we load it lazily, and never inside Expo Go.
import Constants, { ExecutionEnvironment } from 'expo-constants';

export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type NotificationsModule = typeof import('expo-notifications');
let cached: NotificationsModule | null = null;
let tried = false;

export function getNotifications(): NotificationsModule | null {
  if (inExpoGo) return null;
  if (tried) return cached;
  tried = true;
  try {
    cached = require('expo-notifications') as NotificationsModule;
    cached.setNotificationHandler({
      handleNotification: async () =>
        ({ shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false } as any),
    });
  } catch (e) {
    console.warn('Notifications are unavailable in this build:', e);
    cached = null;
  }
  return cached;
}
