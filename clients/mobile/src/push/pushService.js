// 푸시 알림 등록 — Expo Push Token을 받아 백엔드의 /api/push/devices에 전달
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Api } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) {
    // 시뮬레이터/에뮬레이터에서는 토큰 발급 불가
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#38bdf8',
    });
  }

  let token = null;
  try {
    // FCM(Android) / APNs(iOS) 네이티브 토큰을 직접 받는 방식
    if (Platform.OS === 'android') {
      const t = await Notifications.getDevicePushTokenAsync();
      token = t.data;
    } else if (Platform.OS === 'ios') {
      const t = await Notifications.getDevicePushTokenAsync();
      token = t.data;
    }
  } catch (_) {
    // Expo push token으로 fallback
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      token = t.data;
    } catch (_e) {}
  }

  if (!token) return null;

  try {
    await Api.registerDevice({
      platform: Platform.OS, // 'ios' | 'android'
      token,
      deviceName: Device.deviceName || (Device.modelName ?? Platform.OS),
      appVersion: Constants.expoConfig?.version || '0.1.0',
      osVersion: Device.osVersion || '',
    });
  } catch (e) {
    console.warn('[push] register failed:', e?.message || e);
  }
  return token;
}
