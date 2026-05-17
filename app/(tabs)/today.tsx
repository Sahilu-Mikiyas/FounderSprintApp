import { useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore } from '../../store/sprintStore';
import { useRoutineStore } from '../../store/routineStore';
import { colors } from '../../lib/colors';
import { getDayTypeStyle, getSprintProgress, getDayNumber, formatGreeting, formatDate } from '../../lib/utils';
import { AnimatedProgressBar } from '../../components/AnimatedProgressBar';

const COLOR_TAG_MAP: Record<string, string> = {
  green: '#22C55E',
  blue: '#3B82F6',
  yellow: '#EAB308',
  red: '#EF4444',
  purple: '#A855F7',
  orange: '#F97316',
};

export default function TodayScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const {
    sprint, today, routine, completions, pausesThisWeek,
    loading, dayTasks, fetchToday, fetchDayTasks, toggleRoutine,
    toggleDayTask, pauseDay, markDayDone,
  } = useSprintStore();
  const { categories, fetchAll: fetchRoutines } = useRoutineStore();

  useEffect(() => {
    if (user) {
      fetchToday(user.id);
      fetchRoutines(user.id);
    }
  }, [user]);

  useEffect(() => {
    if (today && !dayTasks[today.id]) {
      fetchDayTasks(today.id);
    }
  }, [today]);

  const onRefresh = useCallback(() => {
    if (user) {
      fetchToday(user.id);
      fetchRoutines(user.id);
    }
  }, [user]);

  // Build a map of category id → color for routine checkboxes
  const catColorMap = Object.fromEntries(categories.map((c) => [c.id, c.color]));

  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'Founder';

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.white} size="large" />
      </View>
    );
  }

  if (!sprint) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No active sprint</Text>
        <Text style={styles.emptySub}>Complete onboarding to start tracking</Text>
        <TouchableOpacity style={styles.startBtn} onPress={() => router.push('/onboarding/mode')}>
          <Text style={styles.startBtnText}>Start Sprint</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progress = getSprintProgress(sprint.start_date, sprint.duration_days);
  const dayNum = getDayNumber(sprint.start_date);
  const dayStyle = today ? getDayTypeStyle(today.day_type) : getDayTypeStyle('deep_work');
  const isPaused = today?.status === 'paused';
  const isDone = today?.status === 'done';
  const canPause = pausesThisWeek < 1 && !isPaused && !isDone;
  const completedCount = completions.length;
  const totalRoutine = routine.length;

  function handlePause() {
    Alert.alert(
      'Pause Today?',
      'You get 1 pause per week. This day is skipped and your sprint end date shifts by 1 day.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pause', style: 'destructive', onPress: () => user && pauseDay(user.id) },
      ]
    );
  }

  function handleMarkDone() {
    Alert.alert(
      'Mark Day Complete?',
      'Great work! Lock in today as done.',
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Done! ✓', onPress: () => user && markDayDone(user.id) },
      ]
    );
  }

  const tasks = today ? (dayTasks[today.id] ?? []) : [];
  const taskDone = tasks.filter((t) => t.is_done).length;
  const taskTotal = tasks.length;
  const taskPct = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.white} />}
      >
        {/* ── Header: greeting + date ── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>{formatGreeting()}, {firstName} 👋</Text>
            <Text style={styles.dateStr}>{formatDate(new Date())}</Text>
          </View>
        </View>

        {/* ── Sprint progress bar ── */}
        <View style={styles.sprintBar}>
          <View>
            <Text style={styles.sprintDayLabel}>Sprint Day</Text>
            <Text style={styles.sprintDayNum}>{dayNum}</Text>
          </View>
          <View style={styles.progTrack}>
            <AnimatedProgressBar pct={progress} color={colors.white} height={3} delay={300} />
          </View>
          <Text style={styles.progPct}>{progress}%</Text>
        </View>

        <View style={styles.body}>

          {/* ── Day type badge ── */}
          <View style={[styles.dayBadge, { backgroundColor: `${dayStyle.color}18` }]}>
            <Text style={styles.dayBadgeText}>{dayStyle.emoji} {dayStyle.label}</Text>
            {isDone && <Text style={[styles.statusBadge, { color: colors.revenue }]}>· ✓ Done</Text>}
            {isPaused && <Text style={[styles.statusBadge, { color: '#EAB308' }]}>· ⏸ Paused</Text>}
          </View>

          {/* ── Today's Tasks card ── */}
          <View>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>🎯 Today's Tasks</Text>
              {taskTotal > 0 && (
                <Text style={styles.sectionCount}>{taskDone} / {taskTotal} done</Text>
              )}
            </View>
            <View style={styles.card}>
              {/* Progress bar */}
              {taskTotal > 0 && (
                <View style={styles.taskPctTrack}>
                  <AnimatedProgressBar pct={taskPct} color={dayStyle.color} height={3} delay={400} />
                </View>
              )}

              {tasks.length === 0 ? (
                <Text style={styles.cardEmpty}>No tasks yet — tap a day in Sprint to add some</Text>
              ) : (
                tasks.map((task, i) => {
                  const barColor = task.color_tag ? (COLOR_TAG_MAP[task.color_tag] ?? '#333') : null;
                  return (
                    <TouchableOpacity
                      key={task.id}
                      style={[styles.taskRow, i === tasks.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => today && toggleDayTask(today.id, task.id)}
                      activeOpacity={0.7}
                    >
                      {barColor && <View style={[styles.taskColorBar, { backgroundColor: barColor }]} />}
                      <View style={[styles.taskCheck, task.is_done && styles.taskCheckOn]}>
                        {task.is_done && <Text style={styles.taskCheckMark}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.taskText, task.is_done && styles.taskTextDone]}>
                          {task.title}
                        </Text>
                        {task.notes ? (
                          <Text style={styles.taskNotes} numberOfLines={1}>{task.notes}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>

          {/* ── Daily Routine card ── */}
          <View>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Daily Routine</Text>
              <Text style={styles.sectionCount}>{completedCount}/{totalRoutine}</Text>
            </View>
            <View style={styles.card}>
              {routine.length === 0 ? (
                <Text style={styles.cardEmpty}>No routine items — set them up in the Routines tab</Text>
              ) : (
                routine.map((item, i) => {
                  const done = completions.includes(item.id);
                  const catColor = item.category_id ? (catColorMap[item.category_id] ?? '#444') : '#444';
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.routineRow, i === routine.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => user && toggleRoutine(item.id, user.id)}
                      activeOpacity={0.7}
                    >
                      {/* Category accent bar */}
                      <View style={[styles.routineAccent, { backgroundColor: catColor }]} />
                      {/* Checkbox colored by category */}
                      <View style={[
                        styles.rcheck,
                        done && { backgroundColor: `${catColor}22`, borderColor: 'transparent' },
                      ]}>
                        {done && <Text style={[styles.rcheckMark, { color: catColor }]}>✓</Text>}
                      </View>
                      <Text style={[styles.rtext, done && styles.rtextDone]}>{item.title}</Text>
                      {item.duration_minutes ? (
                        <Text style={styles.rtime}>{item.duration_minutes}m</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>

          {/* ── Pause row ── */}
          <TouchableOpacity
            style={[styles.pauseRow, !canPause && styles.pauseRowDisabled]}
            onPress={canPause ? handlePause : undefined}
            activeOpacity={canPause ? 0.7 : 1}
          >
            <View style={styles.pauseIcon}><Text style={{ fontSize: 18 }}>⏸</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pauseTitle}>
                {isPaused ? 'Day Paused' : canPause ? 'Pause Today' : 'No Pauses Left This Week'}
              </Text>
              <Text style={styles.pauseSub}>
                {pausesThisWeek}/1 pause used this week · sprint extends by 1 day
              </Text>
            </View>
            <View style={styles.pauseBadge}>
              <Text style={styles.pauseBadgeText}>{1 - pausesThisWeek}/1 left</Text>
            </View>
          </TouchableOpacity>

          {/* ── Quick actions: Add Lead + Log Revenue ── */}
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => router.push('/(tabs)/pipeline')}
              activeOpacity={0.8}
            >
              <Text style={styles.quickBtnIcon}>🔥</Text>
              <Text style={styles.quickBtnText}>+ Add Lead</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBtn}
              onPress={() => router.push('/(tabs)/revenue')}
              activeOpacity={0.8}
            >
              <Text style={styles.quickBtnIcon}>💰</Text>
              <Text style={styles.quickBtnText}>Log Revenue</Text>
            </TouchableOpacity>
          </View>

          {/* ── Mark day complete ── */}
          {!isDone && !isPaused && (
            <TouchableOpacity style={styles.doneBtn} onPress={handleMarkDone} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>Mark Day Complete ✓</Text>
            </TouchableOpacity>
          )}

          {isDone && (
            <View style={styles.completedBanner}>
              <Text style={styles.completedBannerText}>🎉 Day complete — great work!</Text>
            </View>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  scroll: { paddingBottom: 32 },
  centered: { flex: 1, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  emptySub: { fontSize: 14, color: colors.grey600, marginTop: 8, textAlign: 'center' },
  startBtn: { marginTop: 24, height: 50, backgroundColor: colors.white, borderRadius: 14, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { fontSize: 15, fontWeight: '700', color: colors.black },

  headerRow: {
    paddingHorizontal: 22, paddingTop: 16, paddingBottom: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  greeting: { fontSize: 13, color: colors.grey600, fontWeight: '500' },
  dateStr: { fontSize: 22, fontWeight: '800', color: colors.white, letterSpacing: -0.5, marginTop: 2 },

  sprintBar: {
    marginHorizontal: 22, marginTop: 14,
    backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  sprintDayLabel: { fontSize: 10, color: '#444', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  sprintDayNum: { fontSize: 22, fontWeight: '900', color: colors.white },
  progTrack: { flex: 1, height: 3, backgroundColor: '#1e1e1e', borderRadius: 2, overflow: 'hidden' },
  progPct: { fontSize: 11, color: '#444', fontWeight: '600' },

  body: { paddingHorizontal: 22, paddingTop: 16, gap: 16 },

  dayBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100,
  },
  dayBadgeText: { fontSize: 13, fontWeight: '700', color: colors.white },
  statusBadge: { fontSize: 12, fontWeight: '700' },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionCount: { fontSize: 12, fontWeight: '700', color: colors.grey600 },

  card: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, overflow: 'hidden' },
  cardEmpty: { fontSize: 14, color: '#333', fontStyle: 'italic', padding: 16 },

  // Tasks
  taskPctTrack: { height: 3, backgroundColor: '#1e1e1e', overflow: 'hidden' },
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#151515',
  },
  taskColorBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  taskCheck: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  taskCheckOn: { backgroundColor: colors.white, borderColor: colors.white },
  taskCheckMark: { fontSize: 10, fontWeight: '900', color: colors.black },
  taskText: { fontSize: 14, color: '#ccc', fontWeight: '500' },
  taskTextDone: { color: '#333', textDecorationLine: 'line-through' },
  taskNotes: { fontSize: 11, color: '#555', fontStyle: 'italic', marginTop: 2 },

  // Routine
  routineRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#151515',
  },
  routineAccent: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  rcheck: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rcheckMark: { fontSize: 10, fontWeight: '900' },
  rtext: { flex: 1, fontSize: 14, color: '#ccc', fontWeight: '500' },
  rtextDone: { color: '#333', textDecorationLine: 'line-through' },
  rtime: { fontSize: 11, color: '#444', fontWeight: '600' },

  pauseRow: {
    backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  pauseRowDisabled: { opacity: 0.35 },
  pauseIcon: { width: 38, height: 38, backgroundColor: '#161616', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pauseTitle: { fontSize: 14, fontWeight: '600', color: '#888' },
  pauseSub: { fontSize: 11, color: '#333', marginTop: 2, lineHeight: 16 },
  pauseBadge: { paddingVertical: 5, paddingHorizontal: 10, backgroundColor: '#161616', borderRadius: 20 },
  pauseBadgeText: { fontSize: 11, color: '#555', fontWeight: '600' },

  quickRow: { flexDirection: 'row', gap: 10 },
  quickBtn: {
    flex: 1, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a',
    borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  quickBtnIcon: { fontSize: 18 },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },

  doneBtn: {
    height: 50, backgroundColor: '#111', borderWidth: 1, borderColor: colors.revenue,
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  doneBtnText: { fontSize: 14, fontWeight: '700', color: colors.revenue },

  completedBanner: {
    height: 50, backgroundColor: `${colors.revenue}12`, borderWidth: 1,
    borderColor: `${colors.revenue}30`, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  completedBannerText: { fontSize: 14, fontWeight: '700', color: colors.revenue },
});
