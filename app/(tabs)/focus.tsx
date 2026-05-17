import { useEffect, useRef, useState, useCallback } from 'react';
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
  { label: 'Silence', key: 'silence' },
  { label: '🌧 Rain', key: 'rain' },
  { label: '🌊 Ocean', key: 'ocean' },
  { label: '🎵 Lo-Fi', key: 'lofi' },
];

type Phase = 'idle' | 'running' | 'paused' | 'break' | 'done';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  return `${pad(m)}:${pad(s % 60)}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function totalFocusedToday(sessions: FocusSession[]) {
  return sessions.filter((s) => s.completed).reduce((acc, s) => acc + s.duration_minutes, 0);
}

// ─── Ring component ───────────────────────────────────────────────────────────

function TimerRing({ progress, color, idle, size = 220, strokeWidth = 8 }: {
  progress: number; color: string; idle: boolean; size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={idle ? '#1c1c1c' : '#1c1c1c'} strokeWidth={strokeWidth} fill="none" />
      {!idle && (
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

// ─── Session blocks ────────────────────────────────────────────────────────────

function SessionBlocks({ done, total = 5 }: { done: number; total?: number }) {
  return (
    <View style={sbStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[sbStyles.block, i < done && sbStyles.blockDone]} />
      ))}
    </View>
  );
}

const sbStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  block: { width: 22, height: 8, borderRadius: 4, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2a2a2a' },
  blockDone: { backgroundColor: colors.revenue, borderColor: colors.revenue },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function FocusScreen() {
  const { user } = useAuthStore();
  const { sprint, today, dayTasks, fetchDayTasks } = useSprintStore();
  const { todaySessions, streak, fetchToday, startSession, completeSession, abandonSession } = useFocusStore();

  // Config state
  const [selectedDurIdx, setSelectedDurIdx] = useState(0); // 25m default
  const [customMin, setCustomMin] = useState('');
  const [selectedAmbient, setSelectedAmbient] = useState('silence');
  const [selectedTaskLabel, setSelectedTaskLabel] = useState('');

  // Session state
  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [currentSession, setCurrentSession] = useState<FocusSession | null>(null);
  const [distractionNote, setDistractionNote] = useState('');
  const [selectedBreak, setSelectedBreak] = useState(5);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bgTimestampRef = useRef<number | null>(null);

  const activeDur = DURATIONS[selectedDurIdx].minutes === 0
    ? (parseInt(customMin) || 25)
    : DURATIONS[selectedDurIdx].minutes;

  useEffect(() => {
    if (user) {
      fetchToday(user.id);
      if (today && !dayTasks[today.id]) fetchDayTasks(today.id);
    }
  }, [user]);

  // Background timer compensation
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current === 'active' && next !== 'active') {
        bgTimestampRef.current = Date.now();
      } else if (appStateRef.current !== 'active' && next === 'active') {
        if (bgTimestampRef.current && (phase === 'running' || phase === 'break')) {
          const elapsed = Math.floor((Date.now() - bgTimestampRef.current) / 1000);
          setSecondsLeft((prev) => Math.max(0, prev - elapsed));
        }
        bgTimestampRef.current = null;
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [phase]);

  function clearTick() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }

  const onTick = useCallback(() => {
    setSecondsLeft((prev) => {
      if (prev <= 1) {
        clearTick();
        if (phase === 'running') setPhase('done');
        else if (phase === 'break') { setPhase('idle'); setSecondsLeft(activeDur * 60); }
        return 0;
      }
      return prev - 1;
    });
  }, [phase, activeDur]);

  useEffect(() => {
    if (phase === 'running' || phase === 'break') {
      intervalRef.current = setInterval(onTick, 1000);
    } else {
      clearTick();
    }
    return clearTick;
  }, [phase, onTick]);

  async function handleStart() {
    if (!user) return;
    const dur = activeDur;
    const session = await startSession(user.id, dur, today?.id ?? null, selectedTaskLabel || null);
    if (session) {
      setCurrentSession(session);
      setSecondsLeft(dur * 60);
      setPhase('running');
    }
  }

  function handlePause() { setPhase('paused'); }
  function handleResume() { setPhase('running'); }

  async function handleComplete() {
    if (!currentSession) return;
    await completeSession(currentSession.id, distractionNote.trim());
    setCurrentSession(null);
    setPhase('idle');
    setSecondsLeft(activeDur * 60);
    setDistractionNote('');
    fetchToday(user!.id);
  }

  async function handleAbandon() {
    Alert.alert('Abandon Session?', "This session won't be counted.", [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Abandon', style: 'destructive', onPress: async () => {
          if (currentSession) await abandonSession(currentSession.id);
          clearTick();
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

  // Ring calc
  const totalSecs = phase === 'break' ? selectedBreak * 60 : activeDur * 60;
  const ringProgress = totalSecs > 0 ? (totalSecs - secondsLeft) / totalSecs : 0;
  const ringColor = phase === 'break' ? colors.revenue : phase === 'done' ? colors.revenue : colors.white;

  const tasks = today ? (dayTasks[today.id] ?? []) : [];
  const completedToday = todaySessions.filter((s) => s.completed).length;
  const totalFocused = totalFocusedToday(todaySessions);

  const isActive = phase !== 'idle';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>⚡ Focus</Text>
            {totalFocused > 0 && (
              <Text style={styles.todayBadge}>{totalFocused}m today</Text>
            )}
          </View>
          {streak > 0 ? (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streak}d streak</Text>
            </View>
          ) : null}
        </View>

        {/* ─── Timer area ──────────────────────────────────────────────────── */}
        <View style={styles.timerArea}>
          {/* Glow */}
          {isActive && (
            <View style={[styles.timerGlow, { backgroundColor: phase === 'break' ? `${colors.revenue}18` : 'rgba(255,255,255,0.04)' }]} />
          )}

          {/* Ring + inner content */}
          <View style={styles.ringWrap}>
            <TimerRing
              progress={ringProgress}
              color={ringColor}
              idle={phase === 'idle'}
              size={220}
              strokeWidth={8}
            />
            <View style={styles.ringInner}>
              <Text style={[styles.timerTime, {
                color: phase === 'done' ? colors.revenue : phase === 'break' ? colors.revenue : colors.white
              }]}>
                {formatSeconds(secondsLeft)}
              </Text>
              <Text style={styles.timerLabel}>
                {phase === 'idle' ? `${activeDur}m`
                  : phase === 'running' ? 'focused'
                  : phase === 'paused' ? 'paused'
                  : phase === 'break' ? 'break'
                  : 'done ✓'}
              </Text>
            </View>
          </View>

          {/* Session blocks */}
          <View style={styles.blocksRow}>
            <SessionBlocks done={completedToday} />
            {completedToday > 0 && (
              <Text style={styles.blocksLabel}>{completedToday} session{completedToday !== 1 ? 's' : ''}</Text>
            )}
          </View>
        </View>

        {/* ─── IDLE controls ──────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <>
            {/* WHAT WILL YOU IGNORE */}
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
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          setSelectedDurIdx(i);
                          if (d.minutes > 0) setSecondsLeft(d.minutes * 60);
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.label}</Text>
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
                    onChangeText={(v) => {
                      setCustomMin(v);
                      const n = parseInt(v);
                      if (!isNaN(n) && n > 0) setSecondsLeft(n * 60);
                    }}
                    keyboardType="number-pad"
                    placeholder="minutes"
                    placeholderTextColor="#333"
                    maxLength={3}
                  />
                  <Text style={styles.customUnit}>min</Text>
                </View>
              )}
            </View>

            {/* Linked task */}
            {tasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Linked Task</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, selectedTaskLabel === '' && styles.chipActive]}
                      onPress={() => setSelectedTaskLabel('')}
                    >
                      <Text style={[styles.chipText, selectedTaskLabel === '' && styles.chipTextActive]}>None</Text>
                    </TouchableOpacity>
                    {tasks.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.chip, styles.taskChip, selectedTaskLabel === t.title && styles.chipActive]}
                        onPress={() => setSelectedTaskLabel(t.title)}
                      >
                        <Text style={[styles.chipText, selectedTaskLabel === t.title && styles.chipTextActive]} numberOfLines={1}>
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {AMBIENT.map((a) => {
                    const active = selectedAmbient === a.key;
                    return (
                      <TouchableOpacity
                        key={a.key}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setSelectedAmbient(a.key)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{a.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.85}>
              <Text style={styles.startBtnText}>Start Focus Session</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ─── RUNNING / PAUSED controls ──────────────────────────────────── */}
        {(phase === 'running' || phase === 'paused') && (
          <View style={styles.activeBlock}>
            {/* Ambient locked indicator */}
            <View style={styles.ambientLocked}>
              {AMBIENT.map((a) => {
                const active = selectedAmbient === a.key;
                return (
                  <View key={a.key} style={[styles.chip, active && styles.chipActiveDim, styles.chipLocked]}>
                    <Text style={[styles.chipText, active && styles.chipTextDim]}>{a.label}</Text>
                  </View>
                );
              })}
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{completedToday}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{totalFocused}m</Text>
                <Text style={styles.statLabel}>Focused</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{tasks.filter((t) => t.is_done).length}</Text>
                <Text style={styles.statLabel}>Tasks done</Text>
              </View>
            </View>

            {selectedTaskLabel ? (
              <Text style={styles.activeTask} numberOfLines={1}>📌 {selectedTaskLabel}</Text>
            ) : null}

            {/* Pause / Resume / Abandon */}
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

        {/* ─── DONE card ──────────────────────────────────────────────────── */}
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

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
              <View style={styles.chipRow}>
                {BREAK_DURATIONS.map((b) => (
                  <TouchableOpacity
                    key={b.minutes}
                    style={[styles.chip, selectedBreak === b.minutes && styles.chipActive]}
                    onPress={() => setSelectedBreak(b.minutes)}
                  >
                    <Text style={[styles.chipText, selectedBreak === b.minutes && styles.chipTextActive]}>{b.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ─── BREAK card ─────────────────────────────────────────────────── */}
        {phase === 'break' && (
          <View style={styles.breakCard}>
            <Text style={styles.breakTitle}>☕  Take a breather</Text>
            <Text style={styles.breakSub}>Step away · hydrate · breathe</Text>
            <TouchableOpacity style={styles.skipBreakBtn} onPress={handleSkipBreak}>
              <Text style={styles.skipBreakText}>Skip Break →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Session log ─────────────────────────────────────────────────── */}
        {todaySessions.length > 0 && (
          <View style={styles.logSection}>
            <Text style={styles.sectionLabel}>Today's Sessions</Text>
            {todaySessions.map((s) => (
              <View key={s.id} style={styles.logRow}>
                <View style={[styles.logDot, { backgroundColor: s.completed ? colors.revenue : '#2a2a2a' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.logTask}>{s.task_label ?? 'Focus session'}</Text>
                  <Text style={styles.logMeta}>{s.duration_minutes}m · {fmtTime(s.started_at)}</Text>
                </View>
                {s.completed && <Text style={styles.logCheck}>✓</Text>}
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
  scroll: { paddingBottom: 60 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  todayBadge: { fontSize: 11, fontWeight: '700', color: colors.revenue, backgroundColor: `${colors.revenue}15`, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a0f00', borderWidth: 1, borderColor: '#3a1f00', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  streakText: { fontSize: 12, fontWeight: '700', color: '#F97316' },

  timerArea: { alignItems: 'center', paddingTop: 28, paddingBottom: 20, position: 'relative' },
  timerGlow: { position: 'absolute', top: 20, width: 240, height: 240, borderRadius: 120 },
  ringWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  ringInner: { position: 'absolute', alignItems: 'center', gap: 4 },
  timerTime: { fontSize: 44, fontWeight: '900', color: colors.white, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 12, color: '#444', fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },

  blocksRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  blocksLabel: { fontSize: 11, color: '#333', fontWeight: '600' },

  section: { paddingHorizontal: 22, marginBottom: 18 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 22 },
  chip: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  chipActive: { backgroundColor: colors.white, borderColor: colors.white },
  chipActiveDim: { backgroundColor: '#1c1c1c', borderColor: '#2a2a2a' },
  chipLocked: { opacity: 0.6 },
  chipText: { fontSize: 13, fontWeight: '600', color: '#444' },
  chipTextActive: { color: colors.black },
  chipTextDim: { color: '#888' },
  taskChip: { maxWidth: 160 },

  ignoreLabel: { fontSize: 10, fontWeight: '800', color: '#333', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  ignoreInput: { backgroundColor: '#111', borderRadius: 14, padding: 14, fontSize: 14, color: '#888', borderWidth: 1, borderColor: '#1e1e1e' },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingHorizontal: 2 },
  customInput: { width: 90, backgroundColor: '#111', borderRadius: 12, padding: 12, fontSize: 16, fontWeight: '700', color: colors.white, borderWidth: 1, borderColor: '#2a2a2a', textAlign: 'center' },
  customUnit: { fontSize: 14, color: '#444', fontWeight: '600' },

  startBtn: { marginHorizontal: 22, height: 54, backgroundColor: colors.white, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { fontSize: 15, fontWeight: '700', color: colors.black },

  activeBlock: { marginHorizontal: 22, gap: 14 },
  ambientLocked: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  statsRow: { flexDirection: 'row', backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, padding: 16, alignItems: 'center' },
  statBlock: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 18, fontWeight: '900', color: colors.white },
  statLabel: { fontSize: 10, color: '#444', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  statDivider: { width: 1, height: 32, backgroundColor: '#1e1e1e' },

  activeTask: { fontSize: 13, color: '#888', fontWeight: '500', textAlign: 'center' },

  controlRow: { flexDirection: 'row', gap: 10 },
  controlBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  controlBtnPrimary: { backgroundColor: colors.white, borderColor: colors.white },
  controlBtnDanger: { borderColor: 'rgba(239,68,68,0.3)' },
  controlBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  doneCard: { marginHorizontal: 22, backgroundColor: `${colors.revenue}08`, borderWidth: 1, borderColor: `${colors.revenue}25`, borderRadius: 20, padding: 22, gap: 12, alignItems: 'center' },
  doneEmoji: { fontSize: 32 },
  doneTitle: { fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.5 },
  doneSub: { fontSize: 13, color: '#555' },
  doneActions: { flexDirection: 'row', gap: 10, width: '100%' },
  breakBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  breakBtnText: { fontSize: 13, fontWeight: '700', color: '#666' },
  doneBtn: { flex: 1, height: 48, borderRadius: 14, backgroundColor: colors.revenue, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontSize: 13, fontWeight: '700', color: colors.black },

  distractionBox: { width: '100%', gap: 8 },
  distractionLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  distractionInput: { backgroundColor: '#111', borderRadius: 12, padding: 12, fontSize: 13, color: '#888', borderWidth: 1, borderColor: '#1e1e1e', minHeight: 56, textAlignVertical: 'top', width: '100%' },

  breakCard: { marginHorizontal: 22, backgroundColor: `${colors.revenue}08`, borderWidth: 1, borderColor: `${colors.revenue}25`, borderRadius: 20, padding: 22, gap: 10, alignItems: 'center' },
  breakTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
  breakSub: { fontSize: 13, color: '#555' },
  skipBreakBtn: { marginTop: 6, paddingVertical: 8 },
  skipBreakText: { fontSize: 13, fontWeight: '600', color: '#444' },

  logSection: { paddingHorizontal: 22, marginTop: 28 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logTask: { fontSize: 13, color: '#ccc', fontWeight: '500' },
  logMeta: { fontSize: 11, color: '#444', marginTop: 2 },
  logCheck: { fontSize: 13, color: colors.revenue, fontWeight: '700' },
});
