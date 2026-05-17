import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Switch, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore } from '../../store/sprintStore';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/colors';
import {
  scheduleDailyReminder, scheduleEveningCheckIn,
  cancelNotification, cancelAllNotifications,
} from '../../lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REMINDER_HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { sprint } = useSprintStore();

  const [profile, setProfile] = useState({ full_name: '', avatar_url: '' });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [dailyReminder, setDailyReminder] = useState(true);
  const [eveningCheckin, setEveningCheckin] = useState(true);
  const [goalAlerts, setGoalAlerts] = useState(true);
  const [leadAlerts, setLeadAlerts] = useState(true);
  const [reminderHour, setReminderHour] = useState(8);
  const [eveningHour, setEveningHour] = useState(20);

  const [showHourPicker, setShowHourPicker] = useState<'morning' | 'evening' | null>(null);
  const [resettingSprint, setResettingSprint] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
      if (data) setProfile({ full_name: data.full_name ?? '', avatar_url: data.avatar_url ?? '' });
      setLoadingProfile(false);
    });

    const keys = ['daily_reminder', 'evening_checkin', 'goal_alerts', 'lead_alerts', 'reminder_hour', 'evening_hour'];
    Promise.all(keys.map((k) => AsyncStorage.getItem(k))).then(([dr, ec, ga, la, rh, eh]) => {
      if (dr !== null) setDailyReminder(dr === 'true');
      if (ec !== null) setEveningCheckin(ec === 'true');
      if (ga !== null) setGoalAlerts(ga === 'true');
      if (la !== null) setLeadAlerts(la === 'true');
      if (rh !== null) setReminderHour(parseInt(rh));
      if (eh !== null) setEveningHour(parseInt(eh));
    });
  }, [user]);

  async function saveProfile() {
    if (!user) return;
    setSavingProfile(true);
    await supabase.from('profiles').update({ full_name: profile.full_name }).eq('id', user.id);
    setSavingProfile(false);
    Alert.alert('Saved', 'Profile updated.');
  }

  async function toggleDailyReminder(val: boolean) {
    setDailyReminder(val);
    await AsyncStorage.setItem('daily_reminder', String(val));
    if (val) scheduleDailyReminder(reminderHour, 0);
    else cancelNotification('daily-reminder');
  }

  async function toggleEveningCheckin(val: boolean) {
    setEveningCheckin(val);
    await AsyncStorage.setItem('evening_checkin', String(val));
    if (val) scheduleEveningCheckIn(eveningHour, 0);
    else cancelNotification('evening-checkin');
  }

  async function updateReminderHour(hour: number) {
    setReminderHour(hour);
    await AsyncStorage.setItem('reminder_hour', String(hour));
    if (dailyReminder) scheduleDailyReminder(hour, 0);
    setShowHourPicker(null);
  }

  async function updateEveningHour(hour: number) {
    setEveningHour(hour);
    await AsyncStorage.setItem('evening_hour', String(hour));
    if (eveningCheckin) scheduleEveningCheckIn(hour, 0);
    setShowHourPicker(null);
  }

  function formatHour(h: number) {
    const ampm = h < 12 ? 'AM' : 'PM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:00 ${ampm}`;
  }

  async function handleResetSprint() {
    Alert.alert(
      'Reset Sprint?',
      'This will end your current sprint and let you start a new one. All data is preserved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive', onPress: async () => {
            if (!sprint) return;
            setResettingSprint(true);
            await supabase.from('sprints').update({ status: 'completed' }).eq('id', sprint.id);
            await supabase.from('profiles').update({ onboarding_complete: false }).eq('id', user!.id);
            setResettingSprint(false);
            // Clear sprint store so Today screen doesn't show stale data
            useSprintStore.setState({ sprint: null, today: null, sprintDays: [], routine: [], completions: [], pausesThisWeek: 0 });
            router.replace('/onboarding/mode');
          },
        },
      ]
    );
  }

  async function handleSignOut() {
    Alert.alert('Sign Out?', 'You will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Delete Account?',
      'This permanently deletes all your data and signs you out. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything', style: 'destructive', onPress: async () => {
            if (!user) return;
            await cancelAllNotifications();
            // Delete all user data — FK cascades handle child rows
            await Promise.all([
              supabase.from('revenue_entries').delete().eq('user_id', user.id),
              supabase.from('goal_milestones').delete().eq('user_id', user.id),
              supabase.from('goals').delete().eq('user_id', user.id),
              supabase.from('kpis').delete().eq('user_id', user.id),
              supabase.from('leads').delete().eq('user_id', user.id),
              supabase.from('pause_log').delete().eq('user_id', user.id),
              supabase.from('routine_completions').delete().eq('user_id', user.id),
              supabase.from('focus_sessions').delete().eq('user_id', user.id),
              supabase.from('routine_categories').delete().eq('user_id', user.id),
              supabase.from('routine_items').delete().eq('user_id', user.id),
              supabase.from('sprint_day_tasks').delete().eq('user_id', user.id),
              supabase.from('sprint_days').delete().eq('user_id', user.id),
              supabase.from('sprints').delete().eq('user_id', user.id),
              supabase.from('profiles').delete().eq('id', user.id),
            ]);
            await signOut();
          },
        },
      ]
    );
  }

  if (loadingProfile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>⚙️ Settings</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Profile */}
        <Section title="Profile">
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile.full_name ? profile.full_name[0].toUpperCase() : user?.email?.[0].toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileEmail}>{user?.email}</Text>
              <Text style={styles.profileMember}>Member since {new Date(user?.created_at ?? '').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              style={styles.fieldInput}
              value={profile.full_name}
              onChangeText={(v) => setProfile((p) => ({ ...p, full_name: v }))}
              placeholder="Your name"
              placeholderTextColor="#333"
            />
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, savingProfile && { opacity: 0.6 }]}
            onPress={saveProfile}
            disabled={savingProfile}
          >
            {savingProfile ? <ActivityIndicator color={colors.black} /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
          </TouchableOpacity>
        </Section>

        {/* Sprint */}
        <Section title="Sprint">
          <SettingRow
            label="Status"
            value={sprint ? `${sprint.duration_days}-day sprint` : 'None active'}
            valueColor={sprint ? colors.revenue : '#444'}
          />
          <SettingRow
            label="Mode"
            value={sprint?.mode ? sprint.mode.charAt(0).toUpperCase() + sprint.mode.slice(1) : '—'}
          />
          <SettingRow
            label="Start Date"
            value={sprint ? new Date(sprint.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          />
          <SettingRow
            label="End Date"
            value={sprint ? new Date(sprint.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
          />
          <SettingRow
            label="Revenue Goal"
            value={sprint?.revenue_goal ? `$${sprint.revenue_goal.toLocaleString()}` : '—'}
            valueColor={colors.revenue}
          />
          <TouchableOpacity
            style={[styles.dangerBtn, resettingSprint && { opacity: 0.6 }]}
            onPress={handleResetSprint}
            disabled={resettingSprint}
          >
            {resettingSprint
              ? <ActivityIndicator color="#EF4444" />
              : <Text style={styles.dangerBtnText}>🔄 Start New Sprint</Text>}
          </TouchableOpacity>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <NotifRow
            label="Daily Morning Reminder"
            sub={`Fires at ${formatHour(reminderHour)}`}
            value={dailyReminder}
            onToggle={toggleDailyReminder}
            onPressSub={() => setShowHourPicker('morning')}
          />
          <NotifRow
            label="Evening Check-In"
            sub={`Fires at ${formatHour(eveningHour)}`}
            value={eveningCheckin}
            onToggle={toggleEveningCheckin}
            onPressSub={() => setShowHourPicker('evening')}
          />
          <NotifRow
            label="Goal Deadline Alerts"
            sub="3 days before each goal deadline"
            value={goalAlerts}
            onToggle={async (v) => { setGoalAlerts(v); await AsyncStorage.setItem('goal_alerts', String(v)); }}
          />
          <NotifRow
            label="Lead Follow-Up Reminders"
            sub="On the follow-up date at 9:00 AM"
            value={leadAlerts}
            onToggle={async (v) => { setLeadAlerts(v); await AsyncStorage.setItem('lead_alerts', String(v)); }}
          />

          {/* Hour picker */}
          {showHourPicker && (
            <View style={styles.hourPicker}>
              <Text style={styles.hourPickerLabel}>
                Select {showHourPicker === 'morning' ? 'Morning' : 'Evening'} Hour
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.hourRow}>
                  {REMINDER_HOURS.map((h) => {
                    const active = showHourPicker === 'morning' ? reminderHour === h : eveningHour === h;
                    return (
                      <TouchableOpacity
                        key={h}
                        style={[styles.hourChip, active && styles.hourChipActive]}
                        onPress={() => showHourPicker === 'morning' ? updateReminderHour(h) : updateEveningHour(h)}
                      >
                        <Text style={[styles.hourChipText, active && styles.hourChipTextActive]}>
                          {formatHour(h)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}
        </Section>

        {/* App info */}
        <Section title="App">
          <SettingRow label="Version" value="1.0.0" />
          <SettingRow label="Build" value="Phase 9" />
          <SettingRow label="Stack" value="Expo + Supabase" />
        </Section>

        {/* Account actions */}
        <Section title="Account">
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
            <Text style={styles.deleteBtnText}>Delete Account</Text>
          </TouchableOpacity>
        </Section>

      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function SettingRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={[styles.settingValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  );
}

function NotifRow({ label, sub, value, onToggle, onPressSub }: {
  label: string; sub: string; value: boolean;
  onToggle: (v: boolean) => void; onPressSub?: () => void;
}) {
  return (
    <View style={styles.notifRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.notifLabel}>{label}</Text>
        <TouchableOpacity onPress={onPressSub} disabled={!onPressSub}>
          <Text style={[styles.notifSub, onPressSub && value && { color: colors.fyp }]}>{sub}</Text>
        </TouchableOpacity>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#2a2a2a', true: colors.revenue }}
        thumbColor={colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  centered: { flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: colors.grey600, width: 60 },
  title: { fontSize: 17, fontWeight: '800', color: colors.white },
  content: { paddingHorizontal: 22, paddingBottom: 60, gap: 24, paddingTop: 8 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5 },
  sectionCard: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 18, overflow: 'hidden' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  avatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '800', color: colors.white },
  profileInfo: { flex: 1, gap: 3 },
  profileEmail: { fontSize: 14, fontWeight: '600', color: colors.white },
  profileMember: { fontSize: 12, color: '#444' },
  field: { padding: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  fieldInput: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 13, fontSize: 15, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a' },
  saveBtn: { margin: 16, height: 46, backgroundColor: colors.white, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: colors.black },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#151515' },
  settingLabel: { fontSize: 14, fontWeight: '500', color: '#ccc' },
  settingValue: { fontSize: 13, fontWeight: '600', color: '#555' },
  dangerBtn: { margin: 16, height: 46, borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dangerBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#151515' },
  notifLabel: { fontSize: 14, fontWeight: '600', color: '#ccc' },
  notifSub: { fontSize: 11, color: '#444', marginTop: 2 },
  hourPicker: { padding: 16, borderTopWidth: 1, borderTopColor: '#1a1a1a', gap: 10 },
  hourPickerLabel: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  hourRow: { flexDirection: 'row', gap: 8 },
  hourChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  hourChipActive: { backgroundColor: colors.white },
  hourChipText: { fontSize: 12, fontWeight: '600', color: '#555' },
  hourChipTextActive: { color: colors.black },
  signOutBtn: { margin: 16, marginBottom: 8, height: 46, borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  signOutText: { fontSize: 14, fontWeight: '700', color: colors.white },
  deleteBtn: { marginHorizontal: 16, marginBottom: 16, height: 46, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: '#EF4444' },
});
