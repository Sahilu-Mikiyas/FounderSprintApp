import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/colors';

const QUICK_GOALS = [1000, 2500, 5000, 10000];

export default function GoalScreen() {
  const router = useRouter();
  const { mode, durationDays, revenueGoal, setRevenueGoal, reset } = useOnboardingStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [custom, setCustom] = useState(false);
  const [customVal, setCustomVal] = useState('');

  const displayGoal = revenueGoal ?? 5000;

  async function handleLaunch() {
    if (!user || !mode || !durationDays) return;
    setLoading(true);

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    const fmt = (d: Date) => d.toISOString().split('T')[0];

    // Create sprint
    const { data: sprint, error } = await supabase
      .from('sprints')
      .insert({
        user_id: user.id,
        mode,
        duration_days: durationDays,
        start_date: fmt(startDate),
        end_date: fmt(endDate),
        revenue_goal: displayGoal,
        status: 'active',
      })
      .select()
      .single();

    if (error || !sprint) {
      setLoading(false);
      Alert.alert('Error', error?.message ?? 'Could not create sprint');
      return;
    }

    // Generate sprint days
    const days = Array.from({ length: durationDays }, (_, i) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dayNum = i + 1;
      // Assign day types in a rotation pattern
      const types = ['deep_work', 'deep_work', 'fyp', 'deep_work', 'review', 'deep_work', 'deep_work'];
      return {
        sprint_id: sprint.id,
        user_id: user.id,
        day_number: dayNum,
        date: fmt(d),
        day_type: types[i % types.length],
        status: i === 0 ? 'active' : 'todo',
      };
    });

    await supabase.from('sprint_days').insert(days);

    // Seed default routine
    const routine = [
      { user_id: user.id, title: 'Morning review', duration_minutes: 5, sort_order: 0 },
      { user_id: user.id, title: 'Set top 3 priorities', duration_minutes: 5, sort_order: 1 },
      { user_id: user.id, title: 'Deep work block 1', duration_minutes: 90, sort_order: 2 },
      { user_id: user.id, title: 'Outreach & comms', duration_minutes: 30, sort_order: 3 },
      { user_id: user.id, title: 'Deep work block 2', duration_minutes: 60, sort_order: 4 },
      { user_id: user.id, title: 'Pipeline check', duration_minutes: 15, sort_order: 5 },
      { user_id: user.id, title: 'End-of-day log', duration_minutes: 10, sort_order: 6 },
    ];
    await supabase.from('routine_items').insert(routine);

    // Mark onboarding complete
    await supabase
      .from('profiles')
      .update({ onboarding_complete: true })
      .eq('id', user.id);

    reset();
    setLoading(false);
    router.replace('/(tabs)/today');
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.step}>Step 3 of 3</Text>
          <Text style={styles.title}>Set your sprint{'\n'}revenue goal</Text>
          <Text style={styles.sub}>This drives your weekly KPI targets</Text>
        </View>

        {/* Big display */}
        <View style={styles.goalCard}>
          <Text style={styles.goalCardLabel}>Target Revenue</Text>
          <Text style={styles.goalAmount}>
            $<Text style={{ color: colors.revenue }}>{displayGoal.toLocaleString()}</Text>
          </Text>
          <Text style={styles.goalSub}>for {durationDays}-day sprint</Text>
        </View>

        {/* Quick select */}
        <View style={styles.quickSection}>
          <Text style={styles.quickLabel}>Quick Select</Text>
          <View style={styles.quickRow}>
            {QUICK_GOALS.map((g) => {
              const active = revenueGoal === g && !custom;
              return (
                <TouchableOpacity
                  key={g}
                  style={[styles.quickBtn, active && styles.quickBtnActive]}
                  onPress={() => { setCustom(false); setRevenueGoal(g); }}
                >
                  <Text style={[styles.quickBtnText, active && styles.quickBtnTextActive]}>
                    ${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)}K
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.quickBtn, custom && styles.quickBtnActive]}
              onPress={() => setCustom(true)}
            >
              <Text style={[styles.quickBtnText, custom && styles.quickBtnTextActive]}>Custom</Text>
            </TouchableOpacity>
          </View>

          {custom && (
            <View style={styles.customInput}>
              <Text style={styles.customPrefix}>$</Text>
              <Text
                style={styles.customValue}
                onPress={() => {}}
              >
                {customVal || '0'}
              </Text>
              <View style={styles.numPad}>
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.numKey}
                    onPress={() => {
                      if (k === '⌫') {
                        const next = customVal.slice(0, -1);
                        setCustomVal(next);
                        setRevenueGoal(parseInt(next) || 0);
                      } else if (k) {
                        const next = customVal + k;
                        setCustomVal(next);
                        setRevenueGoal(parseInt(next) || 0);
                      }
                    }}
                  >
                    <Text style={styles.numKeyText}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={[styles.dot, styles.dotActive]} />
          </View>
          <TouchableOpacity
            style={[styles.btnPrimary, loading && { opacity: 0.6 }]}
            onPress={handleLaunch}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.black} />
              : <Text style={styles.btnPrimaryText}>Launch Sprint 🚀</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setRevenueGoal(0); handleLaunch(); }}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  inner: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 24 },
  back: { marginBottom: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: colors.grey600 },
  header: { gap: 8 },
  step: { fontSize: 11, fontWeight: '700', color: colors.grey600, textTransform: 'uppercase', letterSpacing: 1 },
  title: { fontSize: 30, fontWeight: '900', color: colors.white, letterSpacing: -1, lineHeight: 36 },
  sub: { fontSize: 14, color: colors.grey600, lineHeight: 22 },
  goalCard: {
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e',
    borderRadius: 18, padding: 28, alignItems: 'center',
  },
  goalCardLabel: { fontSize: 11, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  goalAmount: { fontSize: 52, fontWeight: '900', color: colors.white, letterSpacing: -2 },
  goalSub: { fontSize: 12, color: '#333', marginTop: 6 },
  quickSection: { gap: 12 },
  quickLabel: { fontSize: 11, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#1a1a1a', borderRadius: 20 },
  quickBtnActive: { backgroundColor: colors.white },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: '#666' },
  quickBtnTextActive: { color: colors.black },
  customInput: { backgroundColor: '#111', borderRadius: 14, padding: 16, alignItems: 'center', gap: 12 },
  customPrefix: { fontSize: 20, color: '#444', fontWeight: '700' },
  customValue: { fontSize: 40, fontWeight: '900', color: colors.white, letterSpacing: -1 },
  numPad: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', gap: 8 },
  numKey: {
    width: '30%', height: 48, backgroundColor: '#1a1a1a',
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  numKeyText: { fontSize: 18, fontWeight: '600', color: colors.white },
  footer: { gap: 14 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#222' },
  dotActive: { width: 20, backgroundColor: colors.white },
  btnPrimary: {
    height: 54, backgroundColor: colors.white, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPrimaryText: { fontSize: 16, fontWeight: '700', color: colors.black },
  skipText: { textAlign: 'center', color: '#444', fontSize: 14 },
});
