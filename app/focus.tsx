import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, AppState, AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useSprintStore } from '../store/sprintStore';
import { useFocusStore, FocusSession } from '../store/focusStore';
import { colors } from '../lib/colors';

const DURATIONS = [
  { label: '15m', minutes: 15 },
  { label: '25m', minutes: 25 },
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '60m', minutes: 60 },
  { label: '90m', minutes: 90 },
];

const BREAK_DURATIONS = [
  { label: '5m', minutes: 5 },
  { label: '10m', minutes: 10 },
  { label: '15m', minutes: 15 },
];

const AMBIENT = [
  { label: '🔇 None', key: 'none' },
  { label: '🌊 Ocean', key: 'ocean' },
  { label: '🌧️ Rain', key: 'rain' },
  { label: '☕ Café', key: 'cafe' },
  { label: '🔥 Fire', key: 'fire' },
];

type Phase = 'idle' | 'running' | 'paused' | 'break' | 'done';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${pad(m)}:${pad(sec)}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function FocusScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { sprint, today, dayTasks, fetchDayTasks } = useSprintStore();
  const { todaySessions, streak, loading, fetchToday, startSession, completeSession, abandonSession } = useFocusStore();

  const [selectedDur, setSelectedDur] = useState(25);
  const [selectedBreak, setSelectedBreak] = useState(5);
  const [selectedAmbient, setSelectedAmbient] = useState('none');
  const [selectedTaskLabel, setSelectedTaskLabel] = useState('');
  const [distractionNote, setDistractionNote] = useState('');

  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [currentSession, setCurrentSession] = useState<FocusSession | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bgTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      fetchToday(user.id);
      if (today && !dayTasks[today.id]) fetchDayTasks(today.id);
    }
  }, [user]);

  // Restore timer when app comes back from background
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

  const tick = useCallback(() => {
    setSecondsLeft((prev) => {
      if (prev <= 1) {
        clearTick();
        if (phase === 'running') {
          setPhase('done');
        } else if (phase === 'break') {
          setPhase('idle');
          setSecondsLeft(selectedDur * 60);
        }
        return 0;
      }
      return prev - 1;
    });
  }, [phase, selectedDur]);

  function clearTick() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  useEffect(() => {
    if (phase === 'running' || phase === 'break') {
      intervalRef.current = setInterval(tick, 1000);
    } else {
      clearTick();
    }
    return clearTick;
  }, [phase, tick]);

  async function handleStart() {
    if (!user) return;
    const taskLabel = selectedTaskLabel || null;
    const sprintDayId = today?.id ?? null;
    const session = await startSession(user.id, selectedDur, sprintDayId, taskLabel);
    if (session) {
      setCurrentSession(session);
      setSecondsLeft(selectedDur * 60);
      setPhase('running');
    }
  }

  function handlePause() {
    setPhase('paused');
  }

  function handleResume() {
    setPhase('running');
  }

  async function handleComplete() {
    if (!currentSession) return;
    await completeSession(currentSession.id, distractionNote.trim());
    setCurrentSession(null);
    setPhase('idle');
    setSecondsLeft(selectedDur * 60);
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
          setSecondsLeft(selectedDur * 60);
          setDistractionNote('');
        },
      },
    ]);
  }

  function handleStartBreak() {
    setSecondsLeft(selectedBreak * 60);
    setPhase('break');
  }

  function handleSkipBreak() {
    setSecondsLeft(selectedDur * 60);
    setPhase('idle');
  }

  const totalSecs = phase === 'break' ? selectedBreak * 60 : selectedDur * 60;
  const ringPct = totalSecs > 0 ? ((totalSecs - secondsLeft) / totalSecs) * 100 : 0;
  const ringColor = phase === 'break' ? colors.learning : phase === 'done' ? colors.revenue : colors.white;

  const tasks = today ? (dayTasks[today.id] ?? []) : [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Focus</Text>
          {streak > 0 ? (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streak}d</Text>
            </View>
          ) : <View style={{ width: 60 }} />}
        </View>

        {/* Timer ring */}
        <View style={styles.timerWrap}>
          <View style={styles.timerRingOuter}>
            {/* Progress arc via overlay */}
            <View style={[styles.timerRingFill, { opacity: ringPct > 0 ? 1 : 0 }]}>
              {/* Simple border arc using border trick */}
            </View>
            <View style={[styles.timerRingTrack, {
              borderColor: phase === 'idle' ? '#1e1e1e' : `${ringColor}22`,
            }]}>
              <View style={[styles.timerRingProgress, {
                borderColor: ringColor,
                // Simulate arc using box shadow approximation — actual conic done via border
                opacity: phase === 'idle' ? 0.15 : 1,
              }]} />
            </View>
            <View style={styles.timerInner}>
              <Text style={[styles.timerTime, { color: phase === 'done' ? colors.revenue : colors.white }]}>
                {formatSeconds(secondsLeft)}
              </Text>
              <Text style={styles.timerLabel}>
                {phase === 'idle' ? `${selectedDur} min session`
                  : phase === 'running' ? 'Focus mode'
                  : phase === 'paused' ? 'Paused'
                  : phase === 'break' ? '☕ Break'
                  : '✓ Complete'}
              </Text>
            </View>
          </View>
        </View>

        {/* Controls */}
        {phase === 'idle' && (
          <>
            {/* Duration selector */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Duration</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {DURATIONS.map((d) => (
                    <TouchableOpacity
                      key={d.minutes}
                      style={[styles.chip, selectedDur === d.minutes && styles.chipActive]}
                      onPress={() => { setSelectedDur(d.minutes); setSecondsLeft(d.minutes * 60); }}
                    >
                      <Text style={[styles.chipText, selectedDur === d.minutes && styles.chipTextActive]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Task selector */}
            {tasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Linked Task (optional)</Text>
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
              <Text style={styles.sectionLabel}>Ambient Sound</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {AMBIENT.map((a) => (
                    <TouchableOpacity
                      key={a.key}
                      style={[styles.chip, selectedAmbient === a.key && styles.chipActive]}
                      onPress={() => setSelectedAmbient(a.key)}
                    >
                      <Text style={[styles.chipText, selectedAmbient === a.key && styles.chipTextActive]}>
                        {a.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.85}>
              <Text style={styles.startBtnText}>Start Focus Session</Text>
            </TouchableOpacity>
          </>
        )}

        {(phase === 'running' || phase === 'paused') && (
          <View style={styles.activeCard}>
            <View style={styles.activeDot} />
            {selectedTaskLabel ? (
              <Text style={styles.activeTask} numberOfLines={1}>📌 {selectedTaskLabel}</Text>
            ) : null}
            <View style={styles.activeControls}>
              {phase === 'running' ? (
                <TouchableOpacity style={styles.controlBtn} onPress={handlePause}>
                  <Text style={styles.controlBtnText}>⏸ Pause</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.controlBtn, styles.controlBtnPrimary]} onPress={handleResume}>
                  <Text style={[styles.controlBtnText, { color: colors.black }]}>▶ Resume</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.controlBtn, styles.controlBtnDanger]} onPress={handleAbandon}>
                <Text style={[styles.controlBtnText, { color: '#EF4444' }]}>✕ Abandon</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.distractionBox}>
              <Text style={styles.distractionLabel}>Distraction log (optional)</Text>
              <TextInput
                style={styles.distractionInput}
                value={distractionNote}
                onChangeText={setDistractionNote}
                placeholder="Note what pulled your attention..."
                placeholderTextColor="#333"
                multiline
              />
            </View>
          </View>
        )}

        {phase === 'done' && (
          <View style={styles.doneCard}>
            <Text style={styles.doneEmoji}>🎉</Text>
            <Text style={styles.doneTitle}>Session Complete!</Text>
            <Text style={styles.doneSub}>{selectedDur} minutes of focused work</Text>
            <View style={styles.distractionBox}>
              <Text style={styles.distractionLabel}>Any distractions? (optional)</Text>
              <TextInput
                style={styles.distractionInput}
                value={distractionNote}
                onChangeText={setDistractionNote}
                placeholder="What pulled your attention today?"
                placeholderTextColor="#333"
                multiline
              />
            </View>
            <View style={styles.doneActions}>
              <TouchableOpacity style={styles.breakBtn} onPress={handleStartBreak}>
                <Text style={styles.breakBtnText}>☕ Take a Break</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneBtn} onPress={handleComplete}>
                <Text style={styles.doneBtnText}>Save & Finish ✓</Text>
              </TouchableOpacity>
            </View>
            {/* Break duration chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
              <View style={styles.chipRow}>
                {BREAK_DURATIONS.map((b) => (
                  <TouchableOpacity
                    key={b.minutes}
                    style={[styles.chip, selectedBreak === b.minutes && styles.chipActive]}
                    onPress={() => setSelectedBreak(b.minutes)}
                  >
                    <Text style={[styles.chipText, selectedBreak === b.minutes && styles.chipTextActive]}>
                      {b.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {phase === 'break' && (
          <View style={styles.activeCard}>
            <Text style={styles.breakTitle}>☕ Take a breather</Text>
            <Text style={styles.breakSub}>Step away, hydrate, breathe.</Text>
            <TouchableOpacity style={styles.skipBreakBtn} onPress={handleSkipBreak}>
              <Text style={styles.skipBreakText}>Skip Break →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Session log */}
        {todaySessions.length > 0 && (
          <View style={styles.logSection}>
            <Text style={styles.sectionLabel}>Today's Sessions</Text>
            {todaySessions.map((s) => (
              <View key={s.id} style={styles.logRow}>
                <View style={[styles.logDot, { backgroundColor: s.completed ? colors.revenue : '#333' }]} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  scroll: { paddingBottom: 48 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: colors.grey600, width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  streakBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a0f00', borderWidth: 1, borderColor: '#3a1f00', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  streakText: { fontSize: 12, fontWeight: '700', color: '#F97316' },

  timerWrap: { alignItems: 'center', paddingVertical: 32 },
  timerRingOuter: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  timerRingFill: { position: 'absolute', width: '100%', height: '100%' },
  timerRingTrack: { position: 'absolute', width: '100%', height: '100%', borderRadius: 100, borderWidth: 6, borderColor: '#1e1e1e' },
  timerRingProgress: { position: 'absolute', width: '100%', height: '100%', borderRadius: 100, borderWidth: 6, borderColor: colors.white, borderTopColor: 'transparent', borderRightColor: 'transparent' },
  timerInner: { alignItems: 'center', gap: 4 },
  timerTime: { fontSize: 42, fontWeight: '900', color: colors.white, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 12, color: '#444', fontWeight: '600' },

  section: { paddingHorizontal: 22, marginBottom: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  chipActive: { backgroundColor: colors.white, borderColor: colors.white },
  chipText: { fontSize: 13, fontWeight: '600', color: '#444' },
  chipTextActive: { color: colors.black },
  taskChip: { maxWidth: 160 },

  startBtn: { marginHorizontal: 22, height: 54, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  startBtnText: { fontSize: 15, fontWeight: '700', color: colors.black },

  activeCard: { marginHorizontal: 22, backgroundColor: '#111', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 18, padding: 18, gap: 14 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.revenue, alignSelf: 'center' },
  activeTask: { fontSize: 13, color: '#888', fontWeight: '500', textAlign: 'center' },
  activeControls: { flexDirection: 'row', gap: 10 },
  controlBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  controlBtnPrimary: { backgroundColor: colors.white, borderColor: colors.white },
  controlBtnDanger: { borderColor: 'rgba(239,68,68,0.3)' },
  controlBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  distractionBox: { gap: 8 },
  distractionLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1 },
  distractionInput: { backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, fontSize: 13, color: '#888', borderWidth: 1, borderColor: '#2a2a2a', minHeight: 60, textAlignVertical: 'top' },

  doneCard: { marginHorizontal: 22, backgroundColor: `${colors.revenue}0a`, borderWidth: 1, borderColor: `${colors.revenue}20`, borderRadius: 18, padding: 20, gap: 10, alignItems: 'center' },
  doneEmoji: { fontSize: 32 },
  doneTitle: { fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.5 },
  doneSub: { fontSize: 13, color: colors.grey600 },
  doneActions: { flexDirection: 'row', gap: 10, width: '100%' },
  breakBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  breakBtnText: { fontSize: 13, fontWeight: '700', color: colors.grey600 },
  doneBtn: { flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.revenue, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontSize: 13, fontWeight: '700', color: colors.black },

  breakTitle: { fontSize: 18, fontWeight: '800', color: colors.white, textAlign: 'center' },
  breakSub: { fontSize: 13, color: colors.grey600, textAlign: 'center' },
  skipBreakBtn: { alignItems: 'center', paddingVertical: 8 },
  skipBreakText: { fontSize: 13, fontWeight: '600', color: '#444' },

  logSection: { paddingHorizontal: 22, marginTop: 24 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logTask: { fontSize: 13, color: '#ccc', fontWeight: '500' },
  logMeta: { fontSize: 11, color: '#444', marginTop: 2 },
  logCheck: { fontSize: 13, color: colors.revenue, fontWeight: '700' },
});
