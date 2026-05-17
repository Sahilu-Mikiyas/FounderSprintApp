import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface FocusSession {
  id: string;
  user_id: string;
  sprint_day_id: string | null;
  task_label: string | null;
  duration_minutes: number;
  started_at: string;
  ended_at: string | null;
  completed: boolean;
  distraction_notes: string | null;
}

interface FocusStore {
  todaySessions: FocusSession[];
  streak: number; // consecutive days with at least 1 completed session
  loading: boolean;
  fetchToday: (userId: string) => Promise<void>;
  startSession: (
    userId: string,
    durationMinutes: number,
    sprintDayId?: string | null,
    taskLabel?: string | null,
  ) => Promise<FocusSession | null>;
  completeSession: (sessionId: string, distractionNotes?: string) => Promise<void>;
  abandonSession: (sessionId: string) => Promise<void>;
}

export const useFocusStore = create<FocusStore>((set, get) => ({
  todaySessions: [],
  streak: 0,
  loading: false,

  fetchToday: async (userId: string) => {
    set({ loading: true });
    const todayStr = new Date().toISOString().split('T')[0];

    const [{ data: todaySessions }, { data: allCompleted }] = await Promise.all([
      supabase
        .from('focus_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('started_at', `${todayStr}T00:00:00`)
        .order('started_at', { ascending: false }),
      supabase
        .from('focus_sessions')
        .select('started_at')
        .eq('user_id', userId)
        .eq('completed', true)
        .order('started_at', { ascending: false })
        .limit(60),
    ]);

    // Calculate streak: consecutive calendar days with a completed session
    let streak = 0;
    if (allCompleted && allCompleted.length > 0) {
      const days = new Set(allCompleted.map((s) => s.started_at.split('T')[0]));
      let check = new Date();
      check.setHours(0, 0, 0, 0);
      // If today has no session, start checking from yesterday
      if (!days.has(todayStr)) {
        check.setDate(check.getDate() - 1);
      }
      while (true) {
        const d = check.toISOString().split('T')[0];
        if (days.has(d)) {
          streak++;
          check.setDate(check.getDate() - 1);
        } else {
          break;
        }
      }
    }

    set({ todaySessions: todaySessions ?? [], streak, loading: false });
  },

  startSession: async (userId, durationMinutes, sprintDayId = null, taskLabel = null) => {
    const { data } = await supabase
      .from('focus_sessions')
      .insert({
        user_id: userId,
        duration_minutes: durationMinutes,
        sprint_day_id: sprintDayId,
        task_label: taskLabel,
        started_at: new Date().toISOString(),
        completed: false,
      })
      .select()
      .single();
    if (data) {
      set((s) => ({ todaySessions: [data, ...s.todaySessions] }));
      return data;
    }
    return null;
  },

  completeSession: async (sessionId, distractionNotes = '') => {
    const endedAt = new Date().toISOString();
    await supabase
      .from('focus_sessions')
      .update({ completed: true, ended_at: endedAt, distraction_notes: distractionNotes || null })
      .eq('id', sessionId);
    set((s) => ({
      todaySessions: s.todaySessions.map((sess) =>
        sess.id === sessionId
          ? { ...sess, completed: true, ended_at: endedAt, distraction_notes: distractionNotes || null }
          : sess
      ),
      streak: s.streak === 0 || s.todaySessions.every((sess) => !sess.completed) ? s.streak + 1 : s.streak,
    }));
  },

  abandonSession: async (sessionId) => {
    await supabase
      .from('focus_sessions')
      .update({ completed: false, ended_at: new Date().toISOString() })
      .eq('id', sessionId);
    set((s) => ({
      todaySessions: s.todaySessions.map((sess) =>
        sess.id === sessionId ? { ...sess, ended_at: new Date().toISOString() } : sess
      ),
    }));
  },
}));
