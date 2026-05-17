import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Modal,
  TextInput, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore, SprintDay, SprintDayTask } from '../../store/sprintStore';
import { colors } from '../../lib/colors';
import { getDayTypeStyle, getDayNumber } from '../../lib/utils';

const FILTERS: { label: string; id: string | null }[] = [
  { label: 'All', id: null },
  { label: '🎯 Deep Work', id: 'deep_work' },
  { label: '📨 Outreach', id: 'outreach' },
  { label: '🎬 Content', id: 'content' },
  { label: '📊 Review', id: 'review' },
  { label: '📚 Learning', id: 'learning' },
  { label: '🗂️ Admin', id: 'admin' },
];

const COLOR_TAGS = [
  { key: 'green', color: '#22C55E' },
  { key: 'blue', color: '#3B82F6' },
  { key: 'yellow', color: '#EAB308' },
  { key: 'red', color: '#EF4444' },
  { key: 'purple', color: '#A855F7' },
  { key: 'orange', color: '#F97316' },
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
  const {
    sprint, sprintDays, loading, dayTasks,
    fetchToday, fetchDayTasks, addDayTask, toggleDayTask, deleteDayTask,
  } = useSprintStore();

  const [filter, setFilter] = useState<string | null>(null);
  const [editDay, setEditDay] = useState<SprintDay | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [addingTask, setAddingTask] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRowY = useRef<number>(0);

  useEffect(() => {
    if (user && !sprint) fetchToday(user.id);
  }, [user]);

  function scrollToToday() {
    if (todayRowY.current > 0) {
      scrollRef.current?.scrollTo({ y: Math.max(0, todayRowY.current - 80), animated: true });
    }
  }

  async function openSheet(day: SprintDay) {
    setEditDay(day);
    setNewTaskText('');
    setSelectedColor('');
    if (!dayTasks[day.id]) {
      await fetchDayTasks(day.id);
    }
  }

  async function handleAddTask() {
    if (!editDay || !newTaskText.trim()) return;
    setAddingTask(true);
    await addDayTask(editDay.id, newTaskText.trim(), '', selectedColor);
    setNewTaskText('');
    setSelectedColor('');
    setAddingTask(false);
  }

  const filtered = sprintDays.filter((d) => filter === null || d.day_type === filter);
  const totalDays = sprint?.duration_days ?? 60;
  const phaseGroups: SprintDay[][] = [[], [], []];
  filtered.forEach((d) => phaseGroups[getPhase(d.day_number, totalDays)].push(d));
  const dayNum = sprint ? getDayNumber(sprint.start_date) : 0;
  const progress = sprint ? Math.min(Math.round((dayNum / totalDays) * 100), 100) : 0;

  const editTasks: SprintDayTask[] = editDay ? (dayTasks[editDay.id] ?? []) : [];
  const doneCount = editTasks.filter((t) => t.is_done).length;

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
      {/* Header */}
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

      {/* Filter chips */}
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

      {/* Day list */}
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
                const tasks = dayTasks[day.id] ?? [];
                const taskDone = tasks.filter((t) => t.is_done).length;
                const taskTotal = tasks.length;

                return (
                  <TouchableOpacity
                    key={day.id}
                    style={[styles.dayRow, isToday && styles.dayRowToday]}
                    onPress={() => openSheet(day)}
                    onLayout={(e) => {
                      if (isToday) todayRowY.current = e.nativeEvent.layout.y;
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.dayNum, (isDone || isFuture) && styles.dayNumFaded]}>
                      {day.day_number}
                    </Text>
                    <Text style={styles.dayDate}>{fmtDate(day.date)}</Text>
                    <View style={[styles.typePill, { backgroundColor: `${ds.color}15` }]}>
                      <Text style={[styles.typePillText, { color: ds.color }]} numberOfLines={1}>
                        {ds.emoji} {ds.label}
                      </Text>
                    </View>
                    <View style={styles.taskPreview}>
                      {taskTotal > 0 ? (
                        <Text style={styles.taskText} numberOfLines={1}>
                          {taskDone}/{taskTotal} tasks
                        </Text>
                      ) : day.task_title ? (
                        <Text style={styles.taskText} numberOfLines={1}>{day.task_title}</Text>
                      ) : (
                        <Text style={styles.taskEmpty}>+ Add tasks</Text>
                      )}
                    </View>
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

      {/* Task Manager Bottom Sheet */}
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
                  {/* Sheet header */}
                  <View style={styles.sheetHeaderRow}>
                    <View>
                      <View style={styles.sheetTitleRow}>
                        <Text style={styles.sheetTitle}>Day {editDay.day_number}</Text>
                        <Text style={styles.sheetDate}>{fmtDate(editDay.date)}</Text>
                      </View>
                      <View style={[styles.sheetTypeBadge, { backgroundColor: `${ds.color}15` }]}>
                        <Text style={[styles.sheetTypeBadgeText, { color: ds.color }]}>
                          {ds.emoji} {ds.label}
                        </Text>
                      </View>
                    </View>
                    {editTasks.length > 0 && (
                      <View style={styles.sheetProgress}>
                        <Text style={styles.sheetProgressNum}>{doneCount}/{editTasks.length}</Text>
                        <Text style={styles.sheetProgressLabel}>done</Text>
                      </View>
                    )}
                  </View>

                  {/* Task list */}
                  <ScrollView
                    style={styles.taskList}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {editTasks.length === 0 && (
                      <Text style={styles.noTasksText}>No tasks yet — add one below</Text>
                    )}
                    {editTasks.map((task) => (
                      <View key={task.id} style={styles.taskRow}>
                        {task.color_tag ? (
                          <View style={[styles.taskColorBar, { backgroundColor: COLOR_TAGS.find(c => c.key === task.color_tag)?.color ?? '#333' }]} />
                        ) : null}
                        <TouchableOpacity
                          style={[styles.taskCheck, task.is_done && styles.taskCheckDone]}
                          onPress={() => toggleDayTask(editDay.id, task.id)}
                          activeOpacity={0.7}
                        >
                          {task.is_done && <Text style={styles.taskCheckMark}>✓</Text>}
                        </TouchableOpacity>
                        <Text style={[styles.taskRowText, task.is_done && styles.taskRowTextDone]} numberOfLines={2}>
                          {task.title}
                        </Text>
                        <TouchableOpacity
                          style={styles.taskDel}
                          onPress={() => deleteDayTask(editDay.id, task.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.taskDelText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>

                  {/* Add task row */}
                  <View style={styles.addSection}>
                    {/* Color picker */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      <View style={styles.colorRow}>
                        <TouchableOpacity
                          style={[styles.colorDot, { backgroundColor: '#1e1e1e', borderColor: selectedColor === '' ? colors.white : '#2a2a2a' }]}
                          onPress={() => setSelectedColor('')}
                        >
                          {selectedColor === '' && <Text style={{ fontSize: 8, color: colors.white }}>✕</Text>}
                        </TouchableOpacity>
                        {COLOR_TAGS.map((ct) => (
                          <TouchableOpacity
                            key={ct.key}
                            style={[styles.colorDot, { backgroundColor: ct.color, borderColor: selectedColor === ct.key ? colors.white : 'transparent' }]}
                            onPress={() => setSelectedColor(ct.key)}
                          />
                        ))}
                      </View>
                    </ScrollView>

                    <View style={styles.addRow}>
                      <TextInput
                        style={styles.addInput}
                        value={newTaskText}
                        onChangeText={setNewTaskText}
                        placeholder="New task..."
                        placeholderTextColor="#333"
                        returnKeyType="done"
                        onSubmitEditing={handleAddTask}
                      />
                      <TouchableOpacity
                        style={[styles.addBtn, (!newTaskText.trim() || addingTask) && styles.addBtnDisabled]}
                        onPress={handleAddTask}
                        disabled={!newTaskText.trim() || addingTask}
                        activeOpacity={0.8}
                      >
                        {addingTask
                          ? <ActivityIndicator color={colors.black} size="small" />
                          : <Text style={styles.addBtnText}>+</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
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

  // Sheet
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  modalSheet: {
    backgroundColor: '#111', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, paddingBottom: 36, maxHeight: '80%',
  },
  modalHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },

  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  sheetDate: { fontSize: 13, color: '#444', fontWeight: '600' },
  sheetTypeBadge: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 100 },
  sheetTypeBadgeText: { fontSize: 11, fontWeight: '700' },
  sheetProgress: { alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14 },
  sheetProgressNum: { fontSize: 18, fontWeight: '900', color: colors.white },
  sheetProgressLabel: { fontSize: 9, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  taskList: { maxHeight: 260, marginBottom: 12 },
  noTasksText: { fontSize: 13, color: '#333', fontStyle: 'italic', paddingVertical: 16, textAlign: 'center' },

  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  taskColorBar: { width: 3, height: 20, borderRadius: 2 },
  taskCheck: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center',
  },
  taskCheckDone: { backgroundColor: colors.white, borderColor: colors.white },
  taskCheckMark: { fontSize: 11, fontWeight: '900', color: colors.black },
  taskRowText: { flex: 1, fontSize: 14, color: '#ccc', fontWeight: '500' },
  taskRowTextDone: { color: '#333', textDecorationLine: 'line-through' },
  taskDel: { padding: 4 },
  taskDelText: { fontSize: 11, color: '#333', fontWeight: '700' },

  addSection: { borderTopWidth: 1, borderTopColor: '#1a1a1a', paddingTop: 12 },
  colorRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 0 },
  colorDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12,
    padding: 13, fontSize: 14, color: colors.white, borderWidth: 1, borderColor: '#2a2a2a',
  },
  addBtn: {
    width: 46, height: 46, backgroundColor: colors.white,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.3 },
  addBtnText: { fontSize: 22, fontWeight: '700', color: colors.black },
});
