import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, Modal,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore } from '../../store/sprintStore';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/colors';
import { getDayTypeStyle, getDayNumber } from '../../lib/utils';

interface SprintDay {
  id: string;
  day_number: number;
  date: string;
  day_type: string;
  task_title: string | null;
  status: string;
}

const FILTERS = ['All', 'FYP', 'Review', 'Deep Work', 'Content', 'Outreach'];

function getPhaseIndex(dayNum: number, totalDays: number) {
  const third = Math.floor(totalDays / 3);
  if (dayNum <= third) return 0;
  if (dayNum <= third * 2) return 1;
  return 2;
}

export default function SprintScreen() {
  const { user } = useAuthStore();
  const { sprint } = useSprintStore();
  const [days, setDays] = useState<SprintDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [editDay, setEditDay] = useState<SprintDay | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [saving, setSaving] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const fetchDays = useCallback(async () => {
    if (!sprint) return;
    setLoading(true);
    const { data } = await supabase
      .from('sprint_days')
      .select('id,day_number,date,day_type,task_title,status')
      .eq('sprint_id', sprint.id)
      .order('day_number');
    setDays(data ?? []);
    setLoading(false);
  }, [sprint]);

  useEffect(() => { fetchDays(); }, [fetchDays]);

  const filtered = days.filter((d) => {
    if (filter === 'All') return true;
    if (filter === 'FYP') return d.day_type === 'fyp';
    if (filter === 'Review') return d.day_type === 'review';
    if (filter === 'Deep Work') return d.day_type === 'deep_work';
    if (filter === 'Content') return d.day_type === 'content';
    if (filter === 'Outreach') return d.day_type === 'outreach';
    return true;
  });

  async function saveTask() {
    if (!editDay) return;
    setSaving(true);
    await supabase.from('sprint_days').update({ task_title: taskInput }).eq('id', editDay.id);
    setDays((prev) => prev.map((d) => d.id === editDay.id ? { ...d, task_title: taskInput } : d));
    setSaving(false);
    setEditDay(null);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const totalDays = sprint?.duration_days ?? 60;
  const phaseLabels = ['Foundation', 'Build', 'Momentum'];
  const phaseGroups: SprintDay[][] = [[], [], []];
  filtered.forEach((d) => phaseGroups[getPhaseIndex(d.day_number, totalDays)].push(d));

  const dayNum = sprint ? getDayNumber(sprint.start_date) : 0;
  const progress = sprint ? Math.min(Math.round((dayNum / sprint.duration_days) * 100), 100) : 0;

  if (loading) {
    return (
      <View style={styles.centered}><ActivityIndicator color={colors.white} size="large" /></View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>📅 Sprint</Text>
          <Text style={styles.subtitle}>Day {dayNum} of {sprint?.duration_days ?? '—'} · {progress}% complete</Text>
        </View>
        <View style={styles.progressBox}>
          <Text style={styles.ringNum}>{progress}%</Text>
          <Text style={styles.ringLabel}>Done</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} style={[styles.chip, filter === f && styles.chipActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchDays} tintColor={colors.white} />}
        contentContainerStyle={styles.listContent}
      >
        {phaseGroups.map((group, pi) => {
          if (group.length === 0) return null;
          return (
            <View key={pi}>
              <View style={styles.phaseRow}>
                <Text style={styles.phaseLabel}>Phase {pi + 1} — {phaseLabels[pi]}</Text>
                <View style={styles.phaseLine} />
              </View>
              {group.map((day) => {
                const ds = getDayTypeStyle(day.day_type);
                const isToday = day.date === todayStr;
                const isDone = day.status === 'done';
                const isPaused = day.status === 'paused';
                return (
                  <TouchableOpacity
                    key={day.id}
                    style={[styles.dayRow, isToday && styles.dayRowToday]}
                    onPress={() => { setEditDay(day); setTaskInput(day.task_title ?? ''); }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.dayNum, isDone && styles.dayNumFaded]}>{day.day_number}</Text>
                    <Text style={styles.dayDate}>{formatDate(day.date)}</Text>
                    <View style={[styles.typePill, { backgroundColor: `${ds.color}15` }]}>
                      <Text style={[styles.typePillText, { color: ds.color }]}>{ds.emoji} {ds.label}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      isDone && styles.statusDone,
                      isToday && !isDone && styles.statusActive,
                      isPaused && styles.statusPaused,
                    ]}>
                      <Text style={[
                        styles.statusText,
                        isDone && { color: colors.revenue },
                        isToday && !isDone && { color: colors.white },
                        isPaused && { color: colors.learning },
                      ]}>
                        {isDone ? 'Done' : isPaused ? '⏸' : isToday ? '● Now' : '—'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!editDay} transparent animationType="slide" onRequestClose={() => setEditDay(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setEditDay(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            {editDay && (
              <>
                <Text style={styles.modalTitle}>Day {editDay.day_number} · {formatDate(editDay.date)}</Text>
                <View style={[styles.modalTypeBadge, { backgroundColor: `${getDayTypeStyle(editDay.day_type).color}15` }]}>
                  <Text style={[styles.modalTypeBadgeText, { color: getDayTypeStyle(editDay.day_type).color }]}>
                    {getDayTypeStyle(editDay.day_type).emoji} {getDayTypeStyle(editDay.day_type).label}
                  </Text>
                </View>
                <Text style={styles.modalLabel}>Focus Task</Text>
                <TextInput
                  style={styles.modalInput}
                  value={taskInput}
                  onChangeText={setTaskInput}
                  placeholder="What's the main task for this day?"
                  placeholderTextColor="#333"
                  multiline
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.modalSave, saving && { opacity: 0.6 }]}
                  onPress={saveTask}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color={colors.black} />
                    : <Text style={styles.modalSaveText}>Save Task</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  centered: { flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: '#444', marginTop: 3 },
  progressBox: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 12, padding: 10, alignItems: 'center', minWidth: 60 },
  ringNum: { fontSize: 18, fontWeight: '900', color: colors.white },
  ringLabel: { fontSize: 9, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  filterScroll: { maxHeight: 44 },
  filterRow: { paddingHorizontal: 22, gap: 6, alignItems: 'center' },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  chipActive: { backgroundColor: colors.white, borderColor: colors.white },
  chipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  chipTextActive: { color: colors.black },
  listContent: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 100 },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  phaseLabel: { fontSize: 10, color: '#333', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, flexShrink: 0 },
  phaseLine: { flex: 1, height: 1, backgroundColor: '#161616' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  dayRowToday: { backgroundColor: '#161616', borderRadius: 12, paddingHorizontal: 10, marginHorizontal: -10, borderBottomWidth: 0, marginBottom: 2 },
  dayNum: { width: 28, fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'center' },
  dayNumFaded: { color: '#222' },
  dayDate: { fontSize: 11, color: '#444', width: 54 },
  typePill: { flex: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  typePillText: { fontSize: 11, fontWeight: '700' },
  statusBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  statusDone: { backgroundColor: 'rgba(34,197,94,0.1)' },
  statusActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  statusPaused: { backgroundColor: 'rgba(234,179,8,0.1)' },
  statusText: { fontSize: 10, fontWeight: '700', color: '#333' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 14 },
  modalHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  modalTypeBadge: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 100 },
  modalTypeBadgeText: { fontSize: 12, fontWeight: '700' },
  modalLabel: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  modalInput: { backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, fontSize: 15, color: colors.white, minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#2a2a2a' },
  modalSave: { height: 52, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: colors.black },
});
