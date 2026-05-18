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
const EMERALD = '#10B981';

const TASK_COLOR_MAP: Record<string, string> = {
  deep_work: '#A855F7',
  outreach:  '#F97316',
  content:   '#3B82F6',
  review:    '#EAB308',
  learning:  '#06B6D4',
  admin:     '#888888',
};

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

const BREAK_EVERY_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '10m', minutes: 10 },
  { label: '15m', minutes: 15 },
  { label: '20m', minutes: 20 },
  { label: '25m', minutes: 25 },
  { label: '30m', minutes: 30 },
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

function TimerRing({ progress, color, size = 220, strokeWidth = 10 }: {
  progress: number; color: string; size?: number; strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(1, progress)));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="#111" strokeWidth={strokeWidth} fill="none" />
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
  block: { width: 22, height: 7, borderRadius: 4, backgroundColor: '#1a1a1a' },
  done: { backgroundColor: INDIGO },
  current: { backgroundColor: `${INDIGO}55` },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function FocusScreen() {
  const { user } = useAuthStore();
  const { today, dayTasks, fetchDayTasks, toggleDayTask } = useSprintStore();
  const { todaySessions, streak, fetchToday, startSession, completeSession, abandonSession } = useFocusStore();

  // Config
  const [selectedDurIdx, setSelectedDurIdx] = useState(0);
  const [customMin, setCustomMin] = useState('');
  const [selectedAmbient, setSelectedAmbient] = useState('silence');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [currentSession, setCurrentSession] = useState<FocusSession | null>(null);
  const [distractionNote, setDistractionNote] = useState('');
  const [selectedBreakDur, setSelectedBreakDur] = useState(5);
  const [breakEveryMin, setBreakEveryMin] = useState(0);
  const [starting, setStarting] = useState(false);
  const [workSecsDone, setWorkSecsDone] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const activeDurRef = useRef(25);
  const breakDurRef = useRef(5);
  const breakIntervalRef = useRef(0); // 0 = disabled; otherwise seconds between breaks
  const nextBreakAtRef = useRef(0);   // secondsLeft value at which to trigger next break
  const resumeSecsRef = useRef(0);    // secondsLeft to restore after break
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bgTimestampRef = useRef<number | null>(null);

  const activeDur = DURATIONS[selectedDurIdx].minutes === 0
    ? (parseInt(customMin) || 25)
    : DURATIONS[selectedDurIdx].minutes;

  // Keep refs in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { activeDurRef.current = activeDur; }, [activeDur]);
  useEffect(() => { breakDurRef.current = selectedBreakDur; }, [selectedBreakDur]);
  useEffect(() => { breakIntervalRef.current = breakEveryMin * 60; }, [breakEveryMin]);

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

  // ── Timer engine ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'running' && phase !== 'break') {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        const newVal = prev - 1;

        // Increment live work seconds only while actually working
        if (phaseRef.current === 'running') {
          setWorkSecsDone((w) => w + 1);
        }

        if (newVal <= 0) {
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          setTimeout(() => {
            if (phaseRef.current === 'running') {
              setPhase('done');
            } else if (phaseRef.current === 'break') {
              // Break over — check if there's remaining work
              if (resumeSecsRef.current > 0) {
                setSecondsLeft(resumeSecsRef.current);
                setPhase('running');
              } else {
                setPhase('idle');
                setSecondsLeft(activeDurRef.current * 60);
              }
            }
          }, 0);
          return 0;
        }

        // Auto-break check (only while running)
        if (phaseRef.current === 'running' && breakIntervalRef.current > 0 && nextBreakAtRef.current > 0 && newVal <= nextBreakAtRef.current) {
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          resumeSecsRef.current = newVal;
          nextBreakAtRef.current = newVal - breakIntervalRef.current;
          setTimeout(() => {
            setSecondsLeft(breakDurRef.current * 60);
            setPhase('break');
          }, 0);
        }

        return newVal;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [phase]);

  // ── Controls ──────────────────────────────────────────────────────────────

  async function handleStart() {
    if (!user || starting) return;
    setStarting(true);
    const dur = activeDur;

    // Set up break schedule
    breakIntervalRef.current = breakEveryMin * 60;
    if (breakEveryMin > 0) {
      nextBreakAtRef.current = dur * 60 - breakEveryMin * 60;
    } else {
      nextBreakAtRef.current = 0;
    }
    resumeSecsRef.current = 0;
    setWorkSecsDone(0);

    try {
      const session = await startSession(user.id, dur, today?.id ?? null, null);
      setCurrentSession(session);
    } catch {
      // continue locally
    }
    setSecondsLeft(dur * 60);
    setPhase('running');
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
    setWorkSecsDone(0);
    resumeSecsRef.current = 0;
    nextBreakAtRef.current = 0;
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
          setWorkSecsDone(0);
          resumeSecsRef.current = 0;
          nextBreakAtRef.current = 0;
        },
      },
    ]);
  }

  function handleStartBreak() {
    resumeSecsRef.current = 0;
    setSecondsLeft(selectedBreakDur * 60);
    setPhase('break');
  }

  function handleSkipBreak() {
    const resume = resumeSecsRef.current;
    resumeSecsRef.current = 0;
    if (resume > 0) {
      setSecondsLeft(resume);
      setPhase('running');
    } else {
      setSecondsLeft(activeDur * 60);
      setPhase('idle');
    }
  }

  function toggleTaskSelect(id: string) {
    setSelectedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalSecs = phase === 'break' ? selectedBreakDur * 60 : activeDur * 60;
  const ringProgress = totalSecs > 0 ? (totalSecs - secondsLeft) / totalSecs : 0;
  const ringColor = phase === 'break' ? EMERALD : INDIGO;
  const completedToday = todaySessions.filter((s) => s.completed).length;
  const focusedToday = totalFocused(todaySessions);
  const liveFocusedMin = focusedToday + Math.floor(workSecsDone / 60);
  const tasks = today ? (dayTasks[today.id] ?? []) : [];
  const sessionTasks = tasks.filter((t) => selectedTaskIds.includes(t.id));
  const isRunning = phase === 'running' || phase === 'paused';
  const isBreak = phase === 'break';

  return (
    <SafeAreaView style={styles.container}>
      {/* Glow blob behind timer */}
      <View style={[styles.glowBlob, { backgroundColor: isBreak ? `${EMERALD}18` : `${INDIGO}14` }]} pointerEvents="none" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>⚡ Focus</Text>
            {liveFocusedMin > 0 && (
              <View style={[styles.todayBadge, (isRunning || isBreak) && styles.todayBadgeLive]}>
                <Text style={[styles.todayBadgeText, (isRunning || isBreak) && { color: INDIGO }]}>
                  {liveFocusedMin}m focused
                </Text>
              </View>
            )}
          </View>
          {streak > 0 && (
            <View style={styles.streakBadge}>
              <Text style={styles.streakText}>🔥 {streak}d streak</Text>
            </View>
          )}
        </View>

        {/* ── Session blocks ──────────────────────────────────────────────── */}
        <View style={styles.sessionRow}>
          <SessionBlocks done={completedToday} current={isRunning} />
          {completedToday > 0 && (
            <Text style={styles.sessionLabel}>Session {completedToday + (isRunning ? 1 : 0)} of 4</Text>
          )}
        </View>

        {/* ── IGNORING banner (running/paused/break) ──────────────────────── */}
        {distractionNote.trim() !== '' && (isRunning || isBreak) && (
          <View style={styles.ignoringBanner}>
            <Text style={styles.ignoringLabel}>IGNORING</Text>
            <Text style={styles.ignoringText}>{distractionNote.toUpperCase()}</Text>
          </View>
        )}

        {/* ── Timer ring ─────────────────────────────────────────────────── */}
        <View style={styles.timerArea}>
          <View style={[styles.ringGlow, { shadowColor: ringColor }]}>
            <View style={styles.ringWrap}>
              <TimerRing progress={ringProgress} color={ringColor} size={220} strokeWidth={10} />
              <View style={styles.ringInner}>
                <Text style={[styles.timerTime, isBreak && { color: EMERALD }]}>
                  {formatSeconds(secondsLeft)}
                </Text>
                <Text style={[styles.timerLabel, isRunning && { color: INDIGO }, isBreak && { color: EMERALD }]}>
                  {phase === 'idle'    ? 'focus session'
                  : phase === 'running' ? 'in progress'
                  : phase === 'paused'  ? 'paused'
                  : phase === 'break'   ? '☕ break'
                  :                      'done ✓'}
                </Text>
                {isRunning && workSecsDone > 0 && (
                  <Text style={styles.timerLiveSub}>{Math.floor(workSecsDone / 60)}m in</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ══════════ IDLE ══════════════════════════════════════════════════ */}
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

            {/* Break settings row */}
            <View style={styles.section}>
              <View style={styles.breakSettingsRow}>
                <View style={styles.breakSettingsCol}>
                  <Text style={styles.sectionLabel}>Break every</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chipRow}>
                      {BREAK_EVERY_OPTIONS.map((o) => {
                        const active = breakEveryMin === o.minutes;
                        return (
                          <TouchableOpacity
                            key={o.label}
                            style={[styles.smallChip, active && styles.smallChipActive]}
                            onPress={() => setBreakEveryMin(o.minutes)}
                          >
                            <Text style={[styles.smallChipText, active && styles.smallChipTextActive]}>{o.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
                {breakEveryMin > 0 && (
                  <View style={styles.breakSettingsCol}>
                    <Text style={styles.sectionLabel}>Break length</Text>
                    <View style={styles.chipRow}>
                      {BREAK_DURATIONS.map((b) => {
                        const active = selectedBreakDur === b.minutes;
                        return (
                          <TouchableOpacity
                            key={b.minutes}
                            style={[styles.smallChip, active && { borderColor: EMERALD, backgroundColor: `${EMERALD}18` }]}
                            onPress={() => setSelectedBreakDur(b.minutes)}
                          >
                            <Text style={[styles.smallChipText, active && { color: EMERALD }]}>{b.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* What will you ignore */}
            <View style={styles.section}>
              <Text style={styles.ignoreSetupLabel}>WHAT WILL YOU IGNORE?</Text>
              <TextInput
                style={styles.ignoreInput}
                value={distractionNote}
                onChangeText={setDistractionNote}
                placeholder="Slack, news, social media..."
                placeholderTextColor="#1e1e1e"
              />
            </View>

            {/* Task selection */}
            {tasks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Tasks for this session</Text>
                <View style={styles.taskGrid}>
                  {tasks.map((t) => {
                    const color = TASK_COLOR_MAP[t.color_tag ?? ''] ?? '#888';
                    const selected = selectedTaskIds.includes(t.id);
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.taskSelectChip,
                          selected && { borderColor: color, backgroundColor: `${color}16` },
                        ]}
                        onPress={() => toggleTaskSelect(t.id)}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.taskDot, { backgroundColor: color }]} />
                        <Text
                          style={[styles.taskSelectText, selected && { color }]}
                          numberOfLines={1}
                        >
                          {t.title}
                        </Text>
                        {selected && <Text style={{ color, fontSize: 11, fontWeight: '800' }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
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

            <TouchableOpacity
              style={[styles.startBtn, starting && { opacity: 0.6 }]}
              onPress={handleStart}
              disabled={starting}
              activeOpacity={0.85}
            >
              <Text style={styles.startBtnText}>▶  Start Focus Session</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ══════════ RUNNING / PAUSED ══════════════════════════════════════ */}
        {isRunning && (
          <View style={styles.activeCard}>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statVal}>{completedToday}</Text>
                <Text style={styles.statLbl}>Sessions</Text>
              </View>
              <View style={styles.statDiv} />
              <View style={styles.statBlock}>
                <Text style={[styles.statVal, { color: INDIGO }]}>{liveFocusedMin}m</Text>
                <Text style={styles.statLbl}>Focused</Text>
              </View>
              <View style={styles.statDiv} />
              <View style={styles.statBlock}>
                <Text style={styles.statVal}>{sessionTasks.filter((t) => t.is_done).length}/{sessionTasks.length || tasks.filter((t) => t.is_done).length}</Text>
                <Text style={styles.statLbl}>Tasks</Text>
              </View>
            </View>

            {/* Session task list — interactive checklist */}
            {sessionTasks.length > 0 && (
              <View style={styles.sessionTaskList}>
                {sessionTasks.map((t) => {
                  const color = TASK_COLOR_MAP[t.color_tag ?? ''] ?? '#888';
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={styles.sessionTaskRow}
                      onPress={() => today && toggleDayTask(today.id, t.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.sessionTaskCheck, t.is_done && { backgroundColor: color, borderColor: color }]}>
                        {t.is_done && <Text style={styles.sessionTaskCheckMark}>✓</Text>}
                      </View>
                      <View style={[styles.sessionTaskBar, { backgroundColor: color }]} />
                      <Text style={[
                        styles.sessionTaskTitle,
                        t.is_done && { textDecorationLine: 'line-through', color: '#333' },
                      ]} numberOfLines={1}>
                        {t.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Ambient locked display */}
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

            {/* Pulse dot */}
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

        {/* ══════════ DONE ══════════════════════════════════════════════════ */}
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
                    style={[styles.smallChip, selectedBreakDur === b.minutes && { borderColor: EMERALD, backgroundColor: `${EMERALD}18` }]}
                    onPress={() => setSelectedBreakDur(b.minutes)}
                  >
                    <Text style={[styles.smallChipText, selectedBreakDur === b.minutes && { color: EMERALD }]}>{b.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ══════════ BREAK ═════════════════════════════════════════════════ */}
        {phase === 'break' && (
          <View style={styles.breakCard}>
            <Text style={styles.breakTitle}>☕  Break time</Text>
            <Text style={styles.breakSub}>
              {resumeSecsRef.current > 0
                ? `${Math.ceil(resumeSecsRef.current / 60)}m left after this`
                : 'Step away · hydrate · breathe'}
            </Text>
            <TouchableOpacity style={styles.skipBtn} onPress={handleSkipBreak}>
              <Text style={styles.skipBtnText}>
                {resumeSecsRef.current > 0 ? 'Skip Break → Resume Work' : 'Skip Break →'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Session log ─────────────────────────────────────────────────── */}
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
  glowBlob: {
    position: 'absolute', top: -60, left: '50%', marginLeft: -180,
    width: 360, height: 360, borderRadius: 180,
  },
  scroll: { paddingBottom: 60 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.white, letterSpacing: -0.4 },
  todayBadge: { backgroundColor: '#111', borderRadius: 20, paddingVertical: 3, paddingHorizontal: 10, borderWidth: 1, borderColor: '#1e1e1e' },
  todayBadgeLive: { borderColor: `${INDIGO}55`, backgroundColor: `${INDIGO}12` },
  todayBadgeText: { fontSize: 11, fontWeight: '700', color: '#555' },
  streakBadge: { backgroundColor: '#1a0f00', borderWidth: 1, borderColor: '#3a1f00', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  streakText: { fontSize: 12, fontWeight: '700', color: '#F97316' },

  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingBottom: 10, marginTop: 4 },
  sessionLabel: { fontSize: 11, color: '#333', fontWeight: '600' },

  // Ignoring banner
  ignoringBanner: {
    marginHorizontal: 22, marginBottom: 12,
    backgroundColor: '#0a0a14', borderWidth: 1, borderColor: `${INDIGO}40`,
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', gap: 4,
  },
  ignoringLabel: {
    fontSize: 9, fontWeight: '800', color: `${INDIGO}88`,
    letterSpacing: 2.5, textTransform: 'uppercase',
  },
  ignoringText: {
    fontSize: 17, fontWeight: '900', color: colors.white,
    letterSpacing: 0.5, textAlign: 'center',
    textShadowColor: INDIGO, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10,
  },

  // Ring
  timerArea: { alignItems: 'center', paddingBottom: 20 },
  ringGlow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 20,
    borderRadius: 120,
  },
  ringWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  ringInner: { position: 'absolute', alignItems: 'center', gap: 4 },
  timerTime: { fontSize: 44, fontWeight: '900', color: colors.white, letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 9, fontWeight: '700', color: '#333', textTransform: 'uppercase', letterSpacing: 1.5 },
  timerLiveSub: { fontSize: 11, fontWeight: '700', color: `${INDIGO}99`, marginTop: 2 },

  section: { paddingHorizontal: 22, marginBottom: 18 },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 },
  chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 22 },

  durChip: { paddingVertical: 9, paddingHorizontal: 20, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  durChipActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  durChipText: { fontSize: 13, fontWeight: '600', color: '#444' },
  durChipTextActive: { color: colors.white },

  smallChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e' },
  smallChipActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  smallChipText: { fontSize: 12, fontWeight: '600', color: '#444' },
  smallChipTextActive: { color: colors.white },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingHorizontal: 22 },
  customInput: { width: 80, backgroundColor: '#111', borderRadius: 12, padding: 12, fontSize: 16, fontWeight: '700', color: colors.white, borderWidth: 1, borderColor: '#2a2a2a', textAlign: 'center' },
  customUnit: { fontSize: 14, color: '#444', fontWeight: '600' },

  breakSettingsRow: { gap: 14 },
  breakSettingsCol: { gap: 6 },

  ignoreSetupLabel: { fontSize: 10, fontWeight: '800', color: '#2a2a2a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  ignoreInput: { backgroundColor: '#111', borderRadius: 14, padding: 14, fontSize: 14, color: '#888', borderWidth: 1, borderColor: '#1a1a1a' },

  // Task select grid
  taskGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  taskSelectChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 100, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e',
    maxWidth: '48%',
  },
  taskDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  taskSelectText: { fontSize: 12, fontWeight: '600', color: '#444', flex: 1 },

  ambientRow: { flexDirection: 'row', gap: 8 },
  ambientChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', gap: 4 },
  ambientChipActive: { borderColor: INDIGO, backgroundColor: `${INDIGO}10` },
  ambientRowLocked: { flexDirection: 'row', gap: 8, opacity: 0.4 },
  ambientChipLocked: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', gap: 4 },
  ambientChipLockedActive: { borderColor: INDIGO, backgroundColor: `${INDIGO}10` },
  ambientIcon: { fontSize: 16 },
  ambientLabel: { fontSize: 9, fontWeight: '700', color: '#444', textTransform: 'uppercase', letterSpacing: 0.5 },
  ambientLabelActive: { color: INDIGO },

  startBtn: { marginHorizontal: 22, height: 56, backgroundColor: INDIGO, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: INDIGO, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 8 },
  startBtnText: { fontSize: 16, fontWeight: '700', color: colors.white, letterSpacing: 0.3 },

  // Active card
  activeCard: { marginHorizontal: 22, gap: 14 },
  statsRow: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 18, padding: 18 },
  statBlock: { flex: 1, alignItems: 'center', gap: 3 },
  statVal: { fontSize: 20, fontWeight: '900', color: colors.white },
  statLbl: { fontSize: 9, color: '#333', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  statDiv: { width: 1, height: 34, backgroundColor: '#1e1e1e' },

  // Session task list
  sessionTaskList: { backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#1a1a1a', borderRadius: 16, overflow: 'hidden' },
  sessionTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#111' },
  sessionTaskCheck: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sessionTaskCheckMark: { fontSize: 11, fontWeight: '900', color: colors.black },
  sessionTaskBar: { width: 3, height: 16, borderRadius: 2, flexShrink: 0 },
  sessionTaskTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: '#ccc' },

  activeDotRow: { alignItems: 'center' },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: INDIGO },
  activeDotPulse: { opacity: 1 },

  controlRow: { flexDirection: 'row', gap: 10 },
  controlBtn: { flex: 1, height: 50, borderRadius: 16, backgroundColor: '#0d0d0d', borderWidth: 1, borderColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' },
  controlBtnPrimary: { backgroundColor: colors.white, borderColor: colors.white },
  controlBtnDanger: { borderColor: 'rgba(239,68,68,0.25)' },
  controlBtnText: { fontSize: 14, fontWeight: '700', color: colors.white },

  // Done card
  doneCard: { marginHorizontal: 22, backgroundColor: `${INDIGO}0a`, borderWidth: 1, borderColor: `${INDIGO}25`, borderRadius: 22, padding: 22, gap: 14, alignItems: 'center' },
  doneEmoji: { fontSize: 34 },
  doneTitle: { fontSize: 22, fontWeight: '900', color: colors.white, letterSpacing: -0.5 },
  doneSub: { fontSize: 13, color: '#444' },
  distractionBox: { width: '100%', gap: 8 },
  distractionLabel: { fontSize: 10, fontWeight: '700', color: '#333', textTransform: 'uppercase', letterSpacing: 1 },
  distractionInput: { backgroundColor: '#111', borderRadius: 12, padding: 12, fontSize: 13, color: '#888', borderWidth: 1, borderColor: '#1a1a1a', minHeight: 56, textAlignVertical: 'top', width: '100%' },
  doneActions: { flexDirection: 'row', gap: 10, width: '100%' },
  breakBtn: { flex: 1, height: 50, borderRadius: 14, backgroundColor: '#111', borderWidth: 1, borderColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' },
  breakBtnText: { fontSize: 13, fontWeight: '700', color: '#555' },
  doneBtn: { flex: 1, height: 50, borderRadius: 14, backgroundColor: INDIGO, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontSize: 13, fontWeight: '700', color: colors.white },

  // Break card
  breakCard: { marginHorizontal: 22, backgroundColor: `${EMERALD}08`, borderWidth: 1, borderColor: `${EMERALD}25`, borderRadius: 22, padding: 22, gap: 10, alignItems: 'center' },
  breakTitle: { fontSize: 20, fontWeight: '800', color: EMERALD },
  breakSub: { fontSize: 13, color: '#444' },
  skipBtn: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#1e1e1e' },
  skipBtnText: { fontSize: 13, fontWeight: '600', color: '#555' },

  // Session log
  logSection: { paddingHorizontal: 22, marginTop: 28 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111' },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logTask: { fontSize: 13, color: '#ccc', fontWeight: '500' },
  logMeta: { fontSize: 11, color: '#333', marginTop: 2 },
  logCheck: { fontSize: 13, fontWeight: '700' },
});
