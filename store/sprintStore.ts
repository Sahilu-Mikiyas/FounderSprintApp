import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface Sprint {
  id: string;
  mode: string;
  duration_days: number;
  start_date: string;
  end_date: string;
  revenue_goal: number;
  status: string;
}

export interface SprintDay {
  id: string;
  sprint_id: string;
  day_number: number;
  date: string;
  day_type: string;
  task_title: string | null;
  task_notes: string | null;
  status: string;
  is_paused: boolean;
}

export interface RoutineItem {
  id: string;
  title: string;
  duration_minutes: number | null;
  sort_order: number;
}

interface SprintStore {
  sprint: Sprint | null;
  today: SprintDay | null;
  routine: RoutineItem[];
  completions: string[]; // routine_item_ids completed today
  pausesThisWeek: number;
  loading: boolean;
  fetchToday: (userId: string) => Promise<void>;
  toggleRoutine: (itemId: string, userId: string) => Promise<void>;
  pauseDay: (userId: string) => Promise<void>;
  markDayDone: (userId: string) => Promise<void>;
}

function getWeekNumber(date: Date): number {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  const jan1 = new Date(start.getFullYear(), 0, 1);
  return Math.ceil(((start.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

export const useSprintStore = create<SprintStore>((set, get) => ({
  sprint: null,
  today: null,
  routine: [],
  completions: [],
  pausesThisWeek: 0,
  loading: true,

  fetchToday: async (userId: string) => {
    set({ loading: true });
    const todayStr = new Date().toISOString().split('T')[0];

    // Get active sprint
    const { data: sprint } = await supabase
      .from('sprints')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!sprint) { set({ loading: false }); return; }

    // Get today's sprint day
    const { data: todayDay } = await supabase
      .from('sprint_days')
      .select('*')
      .eq('sprint_id', sprint.id)
      .eq('date', todayStr)
      .single();

    // Get routine
    const { data: routine } = await supabase
      .from('routine_items')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order');

    // Get today's completions
    const { data: completions } = await supabase
      .from('routine_completions')
      .select('routine_item_id')
      .eq('user_id', userId)
      .eq('completed_on', todayStr);

    // Get pauses this week
    const weekNum = getWeekNumber(new Date());
    const { data: pauses } = await supabase
      .from('pause_log')
      .select('id')
      .eq('user_id', userId)
      .eq('sprint_id', sprint.id)
      .eq('week_number', weekNum);

    set({
      sprint,
      today: todayDay ?? null,
      routine: routine ?? [],
      completions: completions?.map((c) => c.routine_item_id) ?? [],
      pausesThisWeek: pauses?.length ?? 0,
      loading: false,
    });
  },

  toggleRoutine: async (itemId: string, userId: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { completions } = get();
    const isDone = completions.includes(itemId);

    if (isDone) {
      await supabase
        .from('routine_completions')
        .delete()
        .eq('routine_item_id', itemId)
        .eq('completed_on', todayStr);
      set({ completions: completions.filter((id) => id !== itemId) });
    } else {
      await supabase.from('routine_completions').insert({
        user_id: userId,
        routine_item_id: itemId,
        completed_on: todayStr,
      });
      set({ completions: [...completions, itemId] });
    }
  },

  pauseDay: async (userId: string) => {
    const { sprint, today, pausesThisWeek } = get();
    if (!sprint || !today || pausesThisWeek >= 1) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const weekNum = getWeekNumber(new Date());

    await supabase.from('pause_log').insert({
      user_id: userId,
      sprint_id: sprint.id,
      paused_on: todayStr,
      week_number: weekNum,
    });
    await supabase
      .from('sprint_days')
      .update({ status: 'paused', is_paused: true })
      .eq('id', today.id);

    set({ pausesThisWeek: 1, today: { ...today, status: 'paused', is_paused: true } });
  },

  markDayDone: async (userId: string) => {
    const { today } = get();
    if (!today) return;
    await supabase
      .from('sprint_days')
      .update({ status: 'done' })
      .eq('id', today.id);
    set({ today: { ...today, status: 'done' } });
  },
}));
