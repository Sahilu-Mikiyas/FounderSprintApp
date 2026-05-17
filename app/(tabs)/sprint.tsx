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

const TASK_TYPES = [
  { key: 'deep_work', label: '🎯 Deep Work', color: '#A855F7' },
  { key: 'outreach',  label: '📨 Outreach',  color: '#F97316' },
  { key: 'content',   label: '🎬 Content',   color: '#3B82F6' },
  { key: 'review',    label: '📊 Review',    color: '#EAB308' },
  { key: 'learning',  label: '📚 Learning',  color: '#06B6D4' },
  { key: 'admin',     label: '🗂 Admin',     color: '#888888' },
];

const PHASE_LABELS = ['Foundation', 'Build', 'Momentum'];

function getPhase(dayNum: number, total: number): 0 | 1 | 2 {
  const third = Math.floor(total / 3);
  if (dayNum <= third) return 0;
  if (dayNum <= third * 2) return 1;
  return 2;
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const isToday = dateStr === new Date().toISOString().split('T')[0];
  if (isToday) return 'Today';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtRange(start: string, end: string) {
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${s} – ${e}`;
}

function modeLabel(mode: string) {
  if (mode === 'custom') return '📅 Sprint';
  if (mode === 'prebuilt') return '📅 Sprint';
  if (mode === 'rotation') return '📅 Sprint';
  return '📅 Sprint';
}

function colorOf(key: string | null) {
  return TASK_TYPES.find((t) => t.key === key)?.color ?? null;
}

export default function SprintScreen() {
  const { user } = useAuthStore();
  const {
    sprint, sprintDays, loading, dayTasks,
    fetchToday, fetchDayTasks, addDayTask, toggleDayTask, deleteDayTask,
  } = useSprintStore();

  const [filter, setFilter] = useState<string | null>(null);
  const [editDay, setEditDay] = useState<SprintDay | null>(null);

  // Add-task form state — collapsed by default
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [addingTask, setAddingTask] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRowY = useRef<number>(0);
  const titleInputRef = useRef<TextInput>(null);

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
    setShowAddForm(false);
    setNewTaskTitle('');
    setNewTaskNotes('');
    setSelectedColor('');
    if (!dayTasks[day.id]) {
      await fetchDayTasks(day.id);
    }
  }

  function closeSheet() {
    setEditDay(null);
    setShowAddForm(false);
    setNewTaskTitle('');
    setNewTaskNotes('');
    setSelectedColor('');
  }

  async function handleAddTask() {
    if (!editDay || !newTaskTitle.trim()) return;
    setAddingTask(true);
    await addDayTask(editDay.id, newTaskTitle.trim(), newTaskNotes.trim(), selectedColor);
    setNewTaskTitle('');
    setNewTaskNotes('');
    setSelectedColor('');
    setShowAddForm(false);
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
          <Text style={styles.subtitle}>Day {dayNum} of {totalDays} · {fmtRange(sprint.start_date, sprint.end_date)}</Text>
        </View>
        <View style={styles.progressBox}>
          <Text style={styles.progressNum}>{progress}%</Text>
          <Text style={styles.progressLabel}>Done</Text>
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
                const taskDoneCount = tasks.filter((t) => t.is_done).length;
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
                    <Text style={[styles.dayNum, (isDone || isFuture) && !isToday && styles.dayNumFaded]}>
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
                        <Text style={styles.taskPreviewText} numberOfLines={1}>
                          {taskDoneCount}/{taskTotal} tasks
                        </Text>
                      ) : (
                        <Text style={styles.taskPreviewEmpty}>+ Add tasks</Text>
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
                        isPaused && { color: '#EAB308' },
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

      {/* ── Task Manager Bottom Sheet ── */}
      <Modal
        visible={!!editDay}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity style={styles.modalBg} onPress={closeSheet} activeOpacity={1} />

          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {editDay && (() => {
              const ds = getDayTypeStyle(editDay.day_type);
              const dateLabel = fmtDate(editDay.date);
              return (
                <>
                  {/* Sheet header */}
                  <View style={styles.sheetHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.sheetTitleRow}>
                        <Text style={styles.sheetTitle}>Day {editDay.day_number}</Text>
                        <Text style={styles.sheetDate}>{dateLabel}</Text>
                      </View>
                    </View>
                    {editTasks.length > 0 && (
                      <View style={styles.sheetProgress}>
                        <Text style={styles.sheetProgressNum}>{doneCount}/{editTasks.length}</Text>
                        <Text style={styles.sheetProgressLabel}>done</Text>
                      </View>
                    )}
                  </View>

                  {/* Day type badge */}
                  <View style={[styles.sheetTypeBadge, { backgroundColor: `${ds.color}15` }]}>
                    <Text style={[styles.sheetTypeBadgeText, { color: ds.color }]}>
                      {ds.emoji} {ds.label}
                    </Text>
                  </View>

                  {/* FOCUS TASKS label */}
                  <Text style={styles.tasksLabel}>Focus Tasks</Text>

                  {/* Existing task list — scroll only the list */}
                  <ScrollView
                    style={styles.taskListScroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    {editTasks.length === 0 && (
                      <View style={styles.emptyTasksCard}>
                        <Text style={styles.noTasksText}>No tasks yet — add one below</Text>
                      </View>
                    )}
                    {editTasks.length > 0 && (
                      <View style={styles.taskCard}>
                        {editTasks.map((task, i) => {
                          const barColor = colorOf(task.color_tag);
                          const typeLabel = TASK_TYPES.find((t) => t.key === task.color_tag)?.label;
                          return (
                            <View
                              key={task.id}
                              style={[styles.taskRow, i === editTasks.length - 1 && { borderBottomWidth: 0 }]}
                            >
                              {barColor && <View style={[styles.taskColorBar, { backgroundColor: barColor }]} />}
                              <TouchableOpacity
                                style={[styles.taskCheck, task.is_done && styles.taskCheckDone]}
                                onPress={() => toggleDayTask(editDay.id, task.id)}
                                activeOpacity={0.7}
                              >
                                {task.is_done && <Text style={styles.taskCheckMark}>✓</Text>}
                              </TouchableOpacity>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.taskRowText, task.is_done && styles.taskRowTextDone]}>
                                  {task.title}
                                </Text>
                                {typeLabel && !task.is_done && (
                                  <Text style={[styles.taskRowNotes, { color: barColor ?? '#555' }]}>{typeLabel}</Text>
                                )}
                                {task.notes ? (
                                  <Text style={styles.taskRowNotes} numberOfLines={1}>{task.notes}</Text>
                                ) : null}
                              </View>
                              <TouchableOpacity
                                style={styles.taskDel}
                                onPress={() => deleteDayTask(editDay.id, task.id)}
                                activeOpacity={0.7}
                              >
                                <Text style={styles.taskDelText}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </ScrollView>

                  {/* Add form — OUTSIDE the scroll, always visible above buttons */}
                  {showAddForm ? (
                    <View style={styles.addFormCard}>
                      {/* Task type chips */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.typeChipRow}>
                          <TouchableOpacity
                            style={[styles.typeChip, selectedColor === '' && styles.typeChipActive]}
                            onPress={() => setSelectedColor('')}
                          >
                            <Text style={[styles.typeChipText, selectedColor === '' && styles.typeChipTextActive]}>None</Text>
                          </TouchableOpacity>
                          {TASK_TYPES.map((tt) => (
                            <TouchableOpacity
                              key={tt.key}
                              style={[
                                styles.typeChip,
                                selectedColor === tt.key && { backgroundColor: `${tt.color}20`, borderColor: tt.color },
                              ]}
                              onPress={() => setSelectedColor(tt.key)}
                            >
                              <View style={[styles.typeChipDot, { backgroundColor: tt.color }]} />
                              <Text style={[styles.typeChipText, selectedColor === tt.key && { color: tt.color }]}>
                                {tt.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>

                      <TextInput
                        ref={titleInputRef}
                        style={styles.addInput}
                        value={newTaskTitle}
                        onChangeText={setNewTaskTitle}
                        placeholder="Task title..."
                        placeholderTextColor="#444"
                        returnKeyType="next"
                        autoFocus
                      />
                      <TextInput
                        style={[styles.addInput, { marginTop: 6, fontSize: 13, color: '#888' }]}
                        value={newTaskNotes}
                        onChangeText={setNewTaskNotes}
                        placeholder="Notes (optional)..."
                        placeholderTextColor="#333"
                        returnKeyType="done"
                        onSubmitEditing={handleAddTask}
                      />
                      <View style={styles.addFormActions}>
                        <TouchableOpacity
                          style={styles.cancelAddBtn}
                          onPress={() => { setShowAddForm(false); setNewTaskTitle(''); setNewTaskNotes(''); setSelectedColor(''); }}
                        >
                          <Text style={styles.cancelAddText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.confirmAddBtn, (!newTaskTitle.trim() || addingTask) && { opacity: 0.4 }]}
                          onPress={handleAddTask}
                          disabled={!newTaskTitle.trim() || addingTask}
                          activeOpacity={0.8}
                        >
                          {addingTask
                            ? <ActivityIndicator color={colors.black} size="small" />
                            : <Text style={styles.confirmAddText}>Add Task</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.addTaskBtn}
                      onPress={() => setShowAddForm(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.addTaskBtnText}>＋  Add focus task</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.saveBtn} onPress={closeSheet} activeOpacity={0.85}>
                    <Text style={styles.saveBtnText}>Save Tasks</Text>
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
  title: { fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.5 },
  subtitle: { fontSize: 11, color: '#444', marginTop: 3 },
  progressBox: {
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 12, paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center',
  },
  progressNum: { fontSize: 20, fontWeight: '900', color: colors.white },
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
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111',
  },
  dayRowToday: {
    backgroundColor: '#161616', borderRadius: 12,
    paddingHorizontal: 10, marginHorizontal: -10,
    borderBottomWidth: 0, marginBottom: 2, paddingVertical: 11,
  },
  dayNum: { width: 26, fontSize: 13, fontWeight: '700', color: colors.white, textAlign: 'center' },
  dayNumFaded: { color: '#222' },
  dayDate: { fontSize: 11, color: '#444', width: 50 },
  typePill: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7, width: 112 },
  typePillText: { fontSize: 10, fontWeight: '700' },
  taskPreview: { flex: 1 },
  taskPreviewText: { fontSize: 12, color: '#666', fontWeight: '500' },
  taskPreviewEmpty: { fontSize: 12, color: '#2a2a2a', fontStyle: 'italic' },
  statusDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statusDotDone: { backgroundColor: 'rgba(34,197,94,0.1)' },
  statusDotToday: { backgroundColor: 'rgba(255,255,255,0.08)' },
  statusDotPaused: { backgroundColor: 'rgba(234,179,8,0.1)' },
  statusText: { fontSize: 11, fontWeight: '800', color: 'transparent' },
  emptyFilter: { paddingTop: 60, alignItems: 'center' },
  emptyFilterText: { fontSize: 14, color: '#333' },

  // ── Sheet ──
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  modalSheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
    gap: 14,
    maxHeight: '85%',
  },
  modalHandle: { width: 36, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 4 },

  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  sheetDate: { fontSize: 13, color: '#444', fontWeight: '600' },
  sheetTypeBadge: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 100 },
  sheetTypeBadgeText: { fontSize: 12, fontWeight: '700' },
  sheetProgress: { alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14 },
  sheetProgressNum: { fontSize: 17, fontWeight: '900', color: colors.white },
  sheetProgressLabel: { fontSize: 9, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  tasksLabel: { fontSize: 10, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },

  taskListScroll: { maxHeight: 300 },

  emptyTasksCard: { paddingVertical: 18, alignItems: 'center' },
  noTasksText: { fontSize: 13, color: '#333', fontStyle: 'italic' },

  // Grouped task card
  taskCard: {
    backgroundColor: '#1a1a1a', borderRadius: 12, overflow: 'hidden',
  },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#222',
  },
  taskColorBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  taskCheck: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#444',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  taskCheckDone: { backgroundColor: colors.revenue, borderColor: colors.revenue },
  taskCheckMark: { fontSize: 10, fontWeight: '900', color: colors.black },
  taskRowText: { fontSize: 14, color: '#ccc', fontWeight: '500' },
  taskRowTextDone: { color: '#444', textDecorationLine: 'line-through' },
  taskRowNotes: { fontSize: 11, color: '#555', fontStyle: 'italic', marginTop: 2 },
  taskDel: { padding: 6 },
  taskDelText: { fontSize: 12, color: '#2a2a2a', fontWeight: '700' },

  // Add form (expanded)
  addFormCard: {
    backgroundColor: '#161616', borderRadius: 12,
    padding: 14, gap: 10, marginTop: 4,
    borderWidth: 1, borderColor: '#222',
  },
  typeChipRow: { flexDirection: 'row', gap: 6, paddingBottom: 2 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 100, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2a2a2a' },
  typeChipActive: { backgroundColor: '#2a2a2a', borderColor: '#444' },
  typeChipDot: { width: 7, height: 7, borderRadius: 4 },
  typeChipText: { fontSize: 11, fontWeight: '600', color: '#555' },
  typeChipTextActive: { color: colors.white },
  addInput: {
    backgroundColor: '#1e1e1e', borderRadius: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    fontSize: 14, color: colors.white,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  addFormActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  cancelAddBtn: {
    flex: 1, height: 44, backgroundColor: '#1e1e1e', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  cancelAddText: { fontSize: 13, fontWeight: '600', color: '#555' },
  confirmAddBtn: {
    flex: 2, height: 44, backgroundColor: '#2a2a2a', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmAddText: { fontSize: 13, fontWeight: '700', color: colors.white },

  // Collapsed add button (dashed)
  addTaskBtn: {
    height: 46, borderRadius: 10,
    borderWidth: 1, borderColor: '#222', borderStyle: 'dashed',
    backgroundColor: '#161616',
    alignItems: 'center', justifyContent: 'center',
  },
  addTaskBtnText: { fontSize: 13, fontWeight: '600', color: '#444' },

  // Save button
  saveBtn: {
    height: 50, backgroundColor: colors.white, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: colors.black },
});
