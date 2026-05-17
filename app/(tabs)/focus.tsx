import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, AppState, AppStateStatus,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { useSprintStore } from '../../store/sprintStore';
import { useFocusStore, FocusSession } from '../../store/focusStore';
import { colors } from '../../lib/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const INDIGO = '#6366F1';

const DURATIONS = [
  { label: '25m', minutes: 25 },
  { label: '45m', minutes: 45 },
  { label: '60m', minutes: 60 },
  { label: '90m', minutes: 90 },
  { label: 'Custom', minutes: 0 },
];

const BREAK_DURATIONS = [
  { label: '5m', minutes: 5 },
  { label: '10m', minutes: 10 },
  { label: '15m', minutes: 15 },
];

const AMBIENT = [
  { label: 'Silence', icon: '🔇', key: 'silence' },
  { label: 'Rain',    icon: '🌧',  key: 'rain' },
  { label: 'Ocean',   icon: '🌊',  key: 'ocean' },
  { label: 'Lo-Fi',   icon: '🎵',  key: 'lofi' },
];

type Phase = 'idle' | 'running' | 'paused' | 'break' | 'done';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function formatSeconds(s: number) { return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function totalFocused(sessions: FocusSession[]) {
  return sessions.filter((s) => s.completed).reduce((a, s) => a + s.duration_minutes, 0);
}

// ─── SVG Ring ────────────────────────────────────────────────────────────────

function TimerRing({ progress, color, size = 220, strokeWidth = 8 }: {
  progress: number; color: string; size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="#1a1a1a" strokeWidth={strokeWidth} fill="none" />
      {progress > 0 && (
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

// ─── Session blocks ───────────────────────────────────────────────────────────

function SessionBlocks({ done, current, total = 5 }: { done: number; current: boolean; total?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < done;
        const isCurrent = !isDone && i === done && current;
        return (
          <View key={i} style={[
            blockStyles.block,
            isDone && blockStyles.done,
            isCurrent && blockStyles.current,
          ]} />
        );
      })}
    </View>
  );
}

const blockStyles = StyleSheet.create({
  block: { width: 20, height: 7, borderRadius: 4, backgroundColor: '#1e1e1e' },
  done: { backgroundColor: INDIGO },
  current: { backgroundColor: `${INDIGO}66` },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function FocusScreen() {
  const { user } = useAuthStore();
  const { today, dayTasks, fetchDayTasks } = useSprintStore();
  const { todaySessions, streak, fetchToday, startSession, completeSession, abandonSession } = useFocusStore();

  const [selectedDurIdx, setSelectedDurIdx] = useState(0);
  const [customMin, setCustomMin] = useState('');
  const [selectedAmbient, setSelectedAmbient] = useState('silence');
  const [selectedTaskLabel, setSelectedTaskLabel] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [currentSession, setCurrentSession] = useState<FocusSession | null>(null);
  const [distractionNote, setDistractionNote] = useState('');
  const [selectedBreak, setSelectedBreak] = useState(5);
  const [starting, setStarting] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const activeDurRef = useRef(25);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bgTimestampRef = useRef<number | null>(null);

  const activeDur = DURATIONS[selectedDurIdx].minutes === 0
    ? (parseInt(customMin) || 25)
    : DURATIONS[selectedDurIdx].minutes;

  // Keep refs in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { activeDurRef.current = activeDur; }, [activeDur]);

  useEffect(() => {
    if (user) {
      fetchToday(user.id);
      if (today && !dayTasks[today.id]) fetchDayTasks(today.id);
    }
  }, [user]);

  // Background time compensation
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current === 'active' && next !== 'active') {
        bgTimestampRef.current = Date.now();
      } else if (appStateRef.current !== 'active' && next === 'active') {
        if (bgTimestampRef.current && (phaseRef.current === 'running' || phaseRef.current === 'break')) {
          const elapsed = Math.floor((Date.now() - bgTimestampRef.current) / 1000);
          setSecondsLeft((prev) => Math.max(0, prev - elapsed));
        }
        bgTimestampRef.current = null;
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // ── Timer engine — one simple effect, no useCallback ──
  useEffect(() => {
    if (phase !== 'running' && phase !== 'break') {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          // Clear the interval and transition phase via setTimeout to escape state updater
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          setTimeout(() => {
            if (phaseRef.current === 'running') {
              setPhase('done');
            } else if (phaseRef.current === 'break') {
              setPhase('idle');
              setSecondsLeft(activeDurRef.current * 60);
            }
          }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [phase]);

  async function handleStart() {
    if (!user || starting) return;
    setStarting(true);
    try {
      const dur = activeDur;
      const session = await startSession(user.id, dur, today?.id ?? null, selectedTaskLabel || null);
      setCurrentSession(session);
      setSecondsLeft(dur * 60);
      setPhase('running');
    } catch {
      // Start locally even if DB fails
      setSecondsLeft(activeDur * 60);
      setPhase('running');
    }
    setStarting(false);
  }

  function handlePause() { setPhase('paused'); }
  function handleResume() { setPhase('running'); }

  async function handleComplete() {
    if (currentSession) await completeSession(currentSession.id, distractionNote.trim());
    setCurrentSession(null);
    setPhase('idle');
    setSecondsLeft(activeDur * 60);
    setDistractionNote('');
    if (user) fetchToday(user.id);
  }

  async function handleAbandon() {
    Alert.alert('Abandon Session?', "This session won't be counted.", [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Abandon', style: 'destructive', onPress: async () => {
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          if (currentSession) await abandonSession(currentSession.id);
          setCurrentSession(null);
          setPhase('idle');
          setSecondsLeft(activeDur * 60);
          setDistractionNote('');
        },
      },
    ]);
  }

  function handleStartBreak() { setSecondsLeft(selectedBreak * 60); setPhase('break'); }
  function handleSkipBreak() { setSecondsLeft(activeDur * 60); setPhase('idle'); }

  // Derived
  const totalSecs = phase === 'break' ? selectedBreak * 60 : activeDur * 60;
  const ringProgress = totalSecs > 0 ? (totalSecs - secondsLeft) / totalSecs : 0;
  const ringColor = phase === 'break' ? colors.revenue : INDIGO;
  const completedToday = todaySessions.filter((s) => s.completed).length;
  const focusedToday = totalFocused(todaySessions);
  const tasks = today ? (dayTasks[today.id] ?? []) : [];
  const isRunning = phase === 'running' || phase === 'paused';

  return (
    <SafeAreaView style={styles.container}>
      {/* Radial glow background */}
      <View style={styles.bgGlow} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>⚡ Focus</Text>
            {focusedToday > 0 && (
              <View style={styles.todayBadge}>
                <Text style={styles.todayBadgeText}>{focusedToday}m today</Text>
              </View>
            )}
          </View>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streak}d streak</Text>
            </View>
          )}
        </View>

        {/* Session log strip */}
        <View style={styles.sessionRow}>
          <SessionBlocks done={completedToday} current={isRunning} />
          {completedToday > 0 && (
            <Text style={styles.sessionLabel}>
              Session {completedToday + (isRunning ? 1 : 0)} of 4
            </Text>
          )}
        </View>

        {/* Timer */}
        <View style={styles.timerArea}>
          <View style={styles.ringWrap}>
            <TimerRing progress={ringProgress} color={ringColor} size={220} strokeWidth={8} />
            <View style={styles.ringInner}>
              <Text style={[styles.timerTime, phase === 'break' && { color: colors.revenue }]}>
                {formatSeconds(secondsLeft)}
              </Text>
              <Text style={[styles.timerLabel, isRunning && { color: INDIGO }]}>
                {phase === 'idle'   ? 'focus session'
                : phase === 'running' ? 'in progress'
                : phase === 'paused'  ? 'paused'
                : phase === 'break'   ? 'break'
                :                      'done ✓'}
              </Text>
            </View>
          </View>
        </View>

        {/* ─── IDLE ────────────────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <>
            {/* Duration */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Duration</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {DURATIONS.map((d, i) => {
                    const active = selectedDurIdx === i;
                    return (
                      <TouchableOpacity
                        key={d.label}
                        style={[styles.durChip, active && styles.durChipActive]}
                        onPress={() => {
                          setSelectedDurIdx(i);
                          if (d.minutes > 0) setSecondsLeft(d.minutes * 60);
                        }}
                      >
                        <Text style={[styles.durChipText, active && styles.durChipTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
              {DURATIONS[selectedDurIdx].minutes === 0 && (
                <View style={styles.customRow}>
                  <TextInput
                    style={styles.customInput}
                    value={customMin}
                    onChangeText={(v) => { setCustomMin(v); const n = parseInt(v); if (!isNaN(n) && n > 0) setSecondsLeft(n * 60); }}
                    keyboardType="number-pad"
                    placeholder="min"
                    placeholderTextColor="#333"
                    maxLength={3}
                  />
                  <Text style={styles.customUnit}>minutes</Text>
                </View>
              )}
            </View>

            {/* What will you ignore */}
            <View style={styles.section}>
              <Text style={styles.ignoreLabel}>WHAT WILL YOU IGNORE?</Text>
              <TextInput
                style={styles.ignoreInput}
                value={distractionNote}
                onChangeText={setDistractionNote}
                placeholder="Slack, news, social media..."
                placeholderTextColor="#2a2a2a"
              />
            </View>

            {/* Linked task */}
            {tasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Linked Task</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.taskChip, selectedTaskLabel === '' && styles.taskChipActive]}
                      onPress={() => setSelectedTaskLabel('')}
                    >
                      <Text style={[styles.taskChipText, selectedTaskLabel === '' && styles.taskChipTextActive]}>None</Text>
                    </TouchableOpacity>
                    {tasks.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.taskChip, { maxWidth: 160 }, selectedTaskLabel === t.title && styles.taskChipActive]}
                        onPress={() => setSelectedTaskLabel(t.title)}
                      >
                        <Text style={[styles.taskChipText, selectedTaskLabel === t.title && styles.taskChipTextActive]} numberOfLines={1}>
                          {t.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Ambient */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Ambient</Text>
              <View style={styles.ambientRow}>
                {AMBIENT.map((a) => {
                  const active = selectedAmbient === a.key;
                  return (
                    <TouchableOpacity
                      key={a.key}
                      style={[styles.ambientChip, active && styles.ambientChipActive]}
                      onPress={() => setSelectedAmbient(a.key)}
                    >
                      <Text style={styles.ambientIcon}>{a.icon}</Text>
                      <Text style={[styles.ambientLabel, active && styles.ambientLabelActive]}>{a.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity style={[styles.startBtn, starting && { opacity: 0.6 }]} onPress={handleStart} disabled={starting} activeOpacity={0.85}>
              <Text style={styles.startBtnText}>▶  Start Focus Session</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ─── RUNNING / PAUSED ────────────────────────────────────────────── */}
        {isRunning && (
          <View style={styles.activeCard}>
            {/* Ambient locked */}
            <View style={styles.ambientRowLocked}>
              {AMBIENT.map((a) => {
                const active = selectedAmbient === a.key;
                return (
                  <View key={a.key} style={[styles.ambientChipLocked, active && styles.ambientChipLockedActive]}>
                    <Text style={styles.ambientIcon}>{a.icon}</Text>
                    <Text style={[styles.ambientLabel, active && styles.ambientLabelActive]}>{a.label}</Text>
                  </View>
                );
              })}
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statVal}>{completedToday}</Text>
                <Text style={styles.statLbl}>Sessions</Text>
              </View>
              <View style={styles.statDiv} />
              <View style={styles.statBlock}>
                <Text style={styles.statVal}>{focusedToday}m</Text>
                <Text style={styles.statLbl}>Focused</Text>
              </View>
              <View style={styles.statDiv} />
              <View style={styles.statBlock}>
                <Text style={styles.statVal}>{tasks.filter((t) => t.is_done).length}</Text>
                <Text style={styles.statLbl}>Tasks done</Text>
              </View>
            </View>

            {selectedTaskLabel ? <Text style={styles.activeTask}>📌 {selectedTaskLabel}</Text> : null}

            {/* Active dot + controls */}
            <View style={styles.activeDotRow}>
              <View style={[styles.activeDot, phase === 'running' && styles.activeDotPulse]} />
            </View>

            <View style={styles.controlRow}>
              {phase === 'running' ? (
                <TouchableOpacity style={styles.controlBtn} onPress={handlePause}>
                  <Text style={styles.controlBtnText}>⏸  Pause</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.controlBtn, styles.controlBtnPrimary]} onPress={handleResume}>
                  <Text style={[styles.controlBtnText, { color: colors.black }]}>▶  Resume</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.controlBtn, styles.controlBtnDanger]} onPress={handleAbandon}>
                <Text style={[styles.controlBtnText, { color: '#EF4444' }]}>✕  Abandon</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── DONE ────────────────────────────────────────────────────────── */}
        {phase === 'done' && (
          <View style={styles.doneCard}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={styles.doneTitle}>Session Complete!</Text>
            <Text style={styles.doneSub}>{activeDur} minutes of deep focus</Text>

            <View style={styles.distractionBox}>
              <Text style={styles.distractionLabel}>Distractions you noticed</Text>
              <TextInput
                style={styles.distractionInput}
                value={distractionNote}
                onChangeText={setDistractionNote}
                placeholder="What pulled your attention?"
                placeholderTextColor="#333"
                multiline
              />
            </View>

            <View style={styles.doneActions}>
              <TouchableOpacity style={styles.breakBtn} onPress={handleStartBreak}>
                <Text style={styles.breakBtnText}>☕  Take a Break</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneBtn} onPress={handleComplete}>
                <Text style={styles.doneBtnText}>Save & Finish ✓</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 2 }}>
              <View style={styles.chipRow}>
                {BREAK_DURATIONS.map((b) => (
                  <TouchableOpacity
                    key={b.minutes}
                    style={[styles.durChip, selectedBreak === b.minutes && styles.durChipActive]}
                    onPress={() => setSelectedBreak(b.minutes)}
                  >
                    <Text style={[styles.durChipText, selectedBreak === b.minutes && styles.durChipTextActive]}>{b.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ─── BREAK ───────────────────────────────────────────────────────── */}
        {phase === 'break' && (
          <View style={styles.breakCard}>
            <Text style={styles.breakTitle}>☕  Take a breather</Text>
            <Text style={styles.breakSub}>Step away · hydrate · breathe</Text>
            <TouchableOpacity style={styles.skipBtn} onPress={handleSkipBreak}>
              <Text style={styles.skipBtnText}>Skip Break →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Session log */}
        {todaySessions.length > 0 && (
          <View style={styles.logSection}>
            <Text style={styles.sectionLabel}>Today's Sessions</Text>
            {todaySessions.map((s) => (
              <View key={s.id} style={styles.logRow}>
                <View style={[styles.logDot, { backgroundColor: s.completed ? INDIGO : '#2a2a2a' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.logTask}>{s.task_label ?? 'Focus session'}</Text>
                  <Text style={styles.logMeta}>{s.duration_minutes}m · {fmtTime(s.started_at)}</Text>
                </View>
                {s.completed && <Text style={[styles.logCheck, { color: INDIGO }]}>✓</Text>}
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  bgGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 400,
    backgroundColor: 'transparent',
    // Approximated with a tinted overlay — real radial not possible in RN without SVG
    opacity: 0.5,
  },
  scroll: { paddingBottom: 60 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  todayBadge: { backgroundColor: `${INDIGO}18`, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10 },
  todayBadgeText: { fontSize: 11, fontWeight: '700', color: INDIGO },
  streakBadge: { backgroundColor: '#1a0f00', borderWidth: 1, borderColor: '#3a1f00', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  streakText: { fontSize: 12, fontWeight: '700', color: '#F97316' },

  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingBottom: 16, marginTop: 4 },
  sessionLabel: { fontSize: 11, color: '#444', fontWeight: '600' },

  timerArea: { alignItems: 'center', paddingBottom: 24 },
  ringWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  ringInner: { position: 'absolute', alignItems: 'center', gap: 5 },
  timerTime: { fontSize: 42, fontWeight: '900', color: colors.white, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 9, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5 },

  section: { paddingHorizontal: 22, marginBottom: 18 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 22 },

  durChip: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  durChipActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  durChipText: { fontSize: 13, fontWeight: '600', color: '#444' },
  durChipTextActive: { color: colors.white },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  customInput: { width: 80, backgroundColor: '#111', borderRadius: 12, padding: 12, fontSize: 16, fontWeight: '700', color: colors.white, borderWidth: 1, borderColor: '#2a2a2a', textAlign: 'center' },
  customUnit: { fontSize: 14, color: '#444', fontWeight: '600' },

  ignoreLabel: { fontSize: 10, fontWeight: '800', color: '#2a2a2a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  ignoreInput: { backgroundColor: '#111', borderRadius: 14, padding: 14, fontSize: 14, color: '#888', borderWidth: 1, borderColor: '#1e1e1e' },

  taskChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  taskChipActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  taskChipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  taskChipTextActive: { color: colors.white },

  ambientRow: { flexDirection: 'row', gap: 8 },
  ambientChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', gap: 4 },
  ambientChipActive: { borderColor: INDIGO, backgroundColor: `${INDIGO}12` },
  ambientRowLocked: { flexDirection: 'row', gap: 8, opacity: 0.5 },
  ambientChipLocked: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', gap: 4 },
  ambientChipLockedActive: { borderColor: INDIGO, backgroundColor: `${INDIGO}12` },
  ambientIcon: { fontSize: 16 },
  ambientLabel: { fontSize: 9, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 0.5 },
  ambientLabelActive: { color: INDIGO },

  startBtn: { marginHorizontal: 22, height: 54, backgroundColor: INDIGO, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { fontSize: 15, fontWeight: '700', color: colors.white },

  activeCard: { marginHorizontal: 22, gap: 14 },
  statsRow: { flexDirection: 'row', backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, padding: 16 },
  statBlock: { flex: 1, alignItems: 'center', gap: 3 },
  statVal: { fontSize: 18, fontWeight: '900', color: colors.white },
  statLbl: { fontSize: 10, color: '#444', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  statDiv: { width: 1, height: 32, backgroundColor: '#1e1e1e' },

  activeTask: { fontSize: 13, color: '#888', fontWeight: '500', textAlign: 'center' },
  activeDotRow: { alignItems: 'center' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: INDIGO },
  activeDotPulse: { opacity: 1 },

  controlRow: { flexDirection: 'row', gap: 10 },
  controlBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  controlBtnPrimary: { backgroundColor: colors.white, borderColor: colors.white },
  controlBtnDanger: { borderColor: 'rgba(239,68,68,0.3)' },
  controlBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  doneCard: { marginHorizontal: 22, backgroundColor: `${INDIGO}08`, borderWidth: 1, borderColor: `${INDIGO}25`, borderRadius: 20, padding: 22, gap: 12, alignItems: 'center' },
  doneEmoji: { fontSize: 32 },
  doneTitle: { fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.5 },
  doneSub: { fontSize: 13, color: '#555' },
  distractionBox: { width: '100%', gap: 8 },
  distractionLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  distractionInput: { backgroundColor: '#111', borderRadius: 12, padding: 12, fontSize: 13, color: '#888', borderWidth: 1, borderColor: '#1e1e1e', minHeight: 56, textAlignVertical: 'top', width: '100%' },
  doneActions: { flexDirection: 'row', gap: 10, width: '100%' },
  breakBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  breakBtnText: { fontSize: 13, fontWeight: '700', color: '#555' },
  doneBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: INDIGO, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },

  breakCard: { marginHorizontal: 22, backgroundColor: `${colors.revenue}08`, borderWidth: 1, borderColor: `${colors.revenue}25`, borderRadius: 20, padding: 22, gap: 10, alignItems: 'center' },
  breakTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  breakSub: { fontSize: 13, color: '#555' },
  skipBtn: { marginTop: 6, paddingVertical: 8 },
  skipBtnText: { fontSize: 13, fontWeight: '600', color: '#444' },

  logSection: { paddingHorizontal: 22, marginTop: 28 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logTask: { fontSize: 13, color: '#ccc', fontWeight: '500' },
  logMeta: { fontSize: 11, color: '#444', marginTop: 2 },
  logCheck: { fontSize: 13, fontWeight: '700' },
});
