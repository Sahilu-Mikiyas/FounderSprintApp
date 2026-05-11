import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'FounderSprint',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#22C55E',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await AsyncStorage.setItem('push_token', token);
    return token;
  } catch {
    return null;
  }
}

export async function scheduleDailyReminder(hour = 8, minute = 0) {
  try {
    await Notifications.cancelScheduledNotificationAsync('daily-reminder').catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: 'daily-reminder',
      content: {
        title: 'Time to sprint 🚀',
        body: 'Your day is waiting. Open FounderSprint and make it count.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch {}
}

export async function scheduleEveningCheckIn(hour = 20, minute = 0) {
  try {
    await Notifications.cancelScheduledNotificationAsync('evening-checkin').catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: 'evening-checkin',
      content: {
        title: 'End of day check-in 📊',
        body: 'Log your revenue, update your KPIs, and close out the day.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch {}
}

export async function scheduleGoalReminder(goalName: string, deadline: string, goalId: string) {
  try {
    const deadlineDate = new Date(deadline);
    const threeDaysBefore = new Date(deadlineDate);
    threeDaysBefore.setDate(deadlineDate.getDate() - 3);
    if (threeDaysBefore > new Date()) {
      await Notifications.scheduleNotificationAsync({
        identifier: `goal-${goalId}`,
        content: {
          title: '3 days to goal deadline! 🎯',
          body: `"${goalName}" is due in 3 days. Are you on track?`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: threeDaysBefore,
        },
      });
    }
  } catch {}
}

export async function scheduleLeadFollowUp(leadName: string, followUpDate: string, leadId: string) {
  try {
    const date = new Date(followUpDate);
    date.setHours(9, 0, 0, 0);
    if (date > new Date()) {
      await Notifications.scheduleNotificationAsync({
        identifier: `lead-${leadId}`,
        content: {
          title: 'Lead follow-up today 🔥',
          body: `Time to follow up with ${leadName}. Don't let this one slip.`,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      });
    }
  } catch {}
}

export async function cancelNotification(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

export async function cancelAllNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function getScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}
