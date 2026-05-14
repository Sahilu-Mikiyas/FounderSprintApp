import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal,
  TextInput, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore, SprintDay } from '../../store/sprintStore';
import { colors } from '../../lib/colors';
import { getDayTypeStyle, getDayNumber } from '../../lib/utils';

// Filter chip definitions — id matches sprint_days.day_type
const FILTERS: { label: string; id: string | null }[] = [
  { label: 'All', id: null },
  { label: '🎯 Deep Work', id: 'deep_work' },
  { label: '📨 Outreach', id: 'outreach' },
  { label: '🎬 Content', id: 'content' },
  { label: '📊 Review', id: 'review' },
  { label: '📚 Learning', id: 'learning' },
  { label: '🗂️ Admin', id: 'admin' },
];

const PHASE_LABELS = ['Foundation', 'Build', 'Momentum'];

function getPhase(dayNum: number, total: number): 0 | 1 | 2 {
  const third = Math.floor(total / 3);
  if (dayNum <= third) return 0;
  if (dayNum <= third * 2) return 1;
  return 2;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} – ${e}`;
}

function modeLabel(mode: string) {
  if (mode === 'custom') return 'Custom Sprint';
  if (mode === 'prebuilt') return 'Pre-Built Sprint';
  if (mode === 'rotation') return 'Rotation Sprint';
  return 'Sprint';
}

export default function SprintScreen() {
  const { user } = useAuthStore();
  const { sprint, sprintDays, loading, fetchToday, updateDayTask } = useSprintStore();

  const [filter, setFilter] = useState<string | null>(null);
  const [editDay, setEditDay] = useState<SprintDay | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [saving, setSaving] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRowY = useRef<number>(0);

  useEffect(() => {
    if (user && !sprint) fetchToday(user.id);
  }, [user]);

  // Scroll to today after layout
  function scrollToToday() {
    if (todayRowY.current > 0) {
      scrollRef.current?.scrollTo({ y: Math.max(0, todayRowY.current - 80), animated: true });
    }
  }

  const filtered = sprintDays.filter((d) => filter === null || d.day_type === filter);

  const totalDays = sprint?.duration_days ?? 60;
  const phaseGroups: SprintDay[][] = [[], [], []];
  filtered.forEach((d) => phaseGroups[getPhase(d.day_number, totalDays)].push(d));

  const dayNum = sprint ? getDayNumber(sprint.start_date) : 0;
  const progress = sprint ? Math.min(Math.round((dayNum / totalDays) * 100), 100) : 0;

  async function saveTask() {
    if (!editDay) return;
    setSaving(true);
    await updateDayTask(editDay.id, taskInput.trim(), notesInput.trim());
    setSaving(false);
    setEditDay(null);
  }

  if (loading && sprintDays.length === 0) {
    return <View style={styles.centered}><ActivityIndicator color={colors.white} size="large" /></View>;
  }

  if (!sprint) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No active sprint</Text>
        <Text style={styles.emptySub}>Complete onboarding to see your sprint timeline</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{modeLabel(sprint.mode)}</Text>
          <Text style={styles.subtitle}>{fmtRange(sprint.start_date, sprint.end_date)}</Text>
        </View>
        <View style={styles.progressBox}>
          <Text style={styles.progressNum}>{progress}%</Text>
          <Text style={styles.progressLabel}>Day {dayNum}</Text>
        </View>
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <TouchableOpacity
              key={f.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(active ? null : f.id)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Day list ── */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        onLayout={scrollToToday}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => user && fetchToday(user.id)}
            tintColor={colors.white}
          />
        }
      >
        {phaseGroups.map((group, pi) => {
          if (group.length === 0) return null;
          return (
            <View key={pi}>
              <View style={styles.phaseRow}>
                <Text style={styles.phaseLabel}>Phase {pi + 1} — {PHASE_LABELS[pi]}</Text>
                <View style={styles.phaseLine} />
              </View>

              {group.map((day) => {
                const ds = getDayTypeStyle(day.day_type);
                const isToday = day.date === todayStr;
                const isDone = day.status === 'done';
                const isPaused = day.status === 'paused';
                const isFuture = day.date > todayStr;

                return (
                  <TouchableOpacity
                    key={day.id}
                    style={[styles.dayRow, isToday && styles.dayRowToday]}
                    onPress={() => {
                      setEditDay(day);
                      setTaskInput(day.task_title ?? '');
                      setNotesInput(day.task_notes ?? '');
                    }}
                    onLayout={(e) => {
                      if (isToday) todayRowY.current = e.nativeEvent.layout.y;
                    }}
                    activeOpacity={0.75}
                  >
                    {/* Day number */}
                    <Text style={[styles.dayNum, (isDone || isFuture) && styles.dayNumFaded]}>
                      {day.day_number}
                    </Text>

                    {/* Date */}
                    <Text style={styles.dayDate}>{fmtDate(day.date)}</Text>

                    {/* Type pill */}
                    <View style={[styles.typePill, { backgroundColor: `${ds.color}15` }]}>
                      <Text style={[styles.typePillText, { color: ds.color }]} numberOfLines={1}>
                        {ds.emoji} {ds.label}
                      </Text>
                    </View>

                    {/* Task preview */}
                    <View style={styles.taskPreview}>
                      {day.task_title ? (
                        <Text style={styles.taskText} numberOfLines={1}>{day.task_title}</Text>
                      ) : (
                        <Text style={styles.taskEmpty}>+ Add task</Text>
                      )}
                    </View>

                    {/* Status */}
                    <View style={[
                      styles.statusDot,
                      isDone && styles.statusDotDone,
                      isToday && !isDone && styles.statusDotToday,
                      isPaused && styles.statusDotPaused,
                    ]}>
                      <Text style={[
                        styles.statusText,
                        isDone && { color: colors.revenue },
                        isToday && !isDone && { color: colors.white },
                        isPaused && { color: colors.learning },
                      ]}>
                        {isDone ? '✓' : isPaused ? '⏸' : isToday ? '●' : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.emptyFilter}>
            <Text style={styles.emptyFilterText}>No days match this filter</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Edit task bottom sheet ── */}
      <Modal
        visible={!!editDay}
        transparent
        animationType="slide"
        onRequestClose={() => setEditDay(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.modalBg} onPress={() => setEditDay(null)} activeOpacity={1} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {editDay && (() => {
              const ds = getDayTypeStyle(editDay.day_type);
              return (
                <>
                  <View style={styles.modalHeaderRow}>
                    <Text style={styles.modalTitle}>Day {editDay.day_number}</Text>
                    <Text style={styles.modalDate}>{fmtDate(editDay.date)}</Text>
                  </View>

                  <View style={[styles.modalTypeBadge, { backgroundColor: `${ds.color}15` }]}>
                    <Text style={[styles.modalTypeBadgeText, { color: ds.color }]}>
                      {ds.emoji} {ds.label}
                    </Text>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Focus Task</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={taskInput}
                      onChangeText={setTaskInput}
                      placeholder="What's the main task for this day?"
                      placeholderTextColor="#333"
                      autoFocus
                      returnKeyType="next"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Notes (optional)</Text>
                    <TextInput
                      style={[styles.modalInput, styles.notesInput]}
                      value={notesInput}
                      onChangeText={setNotesInput}
                      placeholder="Any extra context, links, or details..."
                      placeholderTextColor="#333"
                      multiline
                      textAlignVertical="top"
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                    onPress={saveTask}
                    disabled={saving}
                  >
                    {saving
                      ? <ActivityIndicator color={colors.black} />
                      : <Text style={styles.saveBtnText}>Save</Text>
                    }
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  centered: { flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.white, letterSpacing: -0.5, textAlign: 'center' },
  emptySub: { fontSize: 13, color: colors.grey600, marginTop: 8, textAlign: 'center' },

  header: {
    paddingHorizontal: 22, paddingTop: 16, paddingBottom: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  subtitle: { fontSize: 11, color: '#444', marginTop: 3 },
  progressBox: {
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center',
  },
  progressNum: { fontSize: 18, fontWeight: '900', color: colors.white },
  progressLabel: { fontSize: 9, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 1 },

  filterScroll: { maxHeight: 44 },
  filterRow: { paddingHorizontal: 22, gap: 6, alignItems: 'center', paddingBottom: 2 },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  chipActive: { backgroundColor: colors.white, borderColor: colors.white },
  chipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  chipTextActive: { color: colors.black },

  listContent: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 100 },

  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  phaseLabel: { fontSize: 10, color: '#333', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2, flexShrink: 0 },
  phaseLine: { flex: 1, height: 1, backgroundColor: '#161616' },

  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#111',
  },
  dayRowToday: {
    backgroundColor: '#161616', borderRadius: 12,
    paddingHorizontal: 10, marginHorizontal: -10,
    borderBottomWidth: 0, marginBottom: 2, paddingVertical: 11,
  },
  dayNum: { width: 26, fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'center' },
  dayNumFaded: { color: '#1e1e1e' },
  dayDate: { fontSize: 11, color: '#444', width: 48 },
  typePill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7, width: 110 },
  typePillText: { fontSize: 10, fontWeight: '700' },
  taskPreview: { flex: 1 },
  taskText: { fontSize: 12, color: '#666', fontWeight: '500' },
  taskEmpty: { fontSize: 12, color: '#2a2a2a', fontStyle: 'italic' },
  statusDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statusDotDone: { backgroundColor: 'rgba(34,197,94,0.1)' },
  statusDotToday: { backgroundColor: 'rgba(255,255,255,0.08)' },
  statusDotPaused: { backgroundColor: 'rgba(234,179,8,0.1)' },
  statusText: { fontSize: 11, fontWeight: '800', color: 'transparent' },

  emptyFilter: { paddingTop: 60, alignItems: 'center' },
  emptyFilterText: { fontSize: 14, color: '#333' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  modalSheet: {
    backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, gap: 16,
  },
  modalHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  modalDate: { fontSize: 13, color: '#444', fontWeight: '600' },
  modalTypeBadge: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 100 },
  modalTypeBadgeText: { fontSize: 12, fontWeight: '700' },

  inputGroup: { gap: 6 },
  inputLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  modalInput: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14,
    fontSize: 14, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a',
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },

  saveBtn: { height: 52, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.black },
});
