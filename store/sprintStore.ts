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
  category_id?: string | null;
}

export interface SprintDayTask {
  id: string;
  sprint_day_id: string;
  title: string;
  notes: string | null;
  is_done: boolean;
  sort_order: number;
  color_tag: string | null;
}

interface SprintStore {
  sprint: Sprint | null;
  today: SprintDay | null;
  sprintDays: SprintDay[];
  routine: RoutineItem[];
  completions: string[];
  pausesThisWeek: number;
  loading: boolean;
  dayTasks: Record<string, SprintDayTask[]>; // keyed by sprint_day_id
  fetchToday: (userId: string) => Promise<void>;
  toggleRoutine: (itemId: string, userId: string) => Promise<void>;
  pauseDay: (userId: string) => Promise<void>;
  markDayDone: (userId: string) => Promise<void>;
  updateDayTask: (dayId: string, title: string, notes: string) => Promise<void>;
  fetchDayTasks: (dayId: string) => Promise<void>;
  addDayTask: (userId: string, dayId: string, title: string, notes?: string, colorTag?: string) => Promise<void>;
  toggleDayTask: (dayId: string, taskId: string) => Promise<void>;
  deleteDayTask: (dayId: string, taskId: string) => Promise<void>;
  updateDayTaskItem: (dayId: string, taskId: string, title: string, notes: string) => Promise<void>;
}

function getWeekNumber(date: Date): number {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  const jan1 = new Date(start.getFullYear(), 0, 1);
  return Math.ceil(((start.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export const useSprintStore = create<SprintStore>((set, get) => ({
  sprint: null,
  today: null,
  sprintDays: [],
  routine: [],
  completions: [],
  pausesThisWeek: 0,
  loading: true,
  dayTasks: {},

  fetchToday: async (userId: string) => {
    set({ loading: true });
    const todayStr = new Date().toISOString().split('T')[0];

    const { data: sprint } = await supabase
      .from('sprints')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!sprint) { set({ loading: false, sprint: null }); return; }

    const [
      { data: allDays },
      { data: routine },
      { data: completions },
      { data: pauses },
    ] = await Promise.all([
      supabase.from('sprint_days').select('*').eq('sprint_id', sprint.id).order('day_number'),
      supabase.from('routine_items').select('*').eq('user_id', userId).order('sort_order'),
      supabase.from('routine_completions').select('item_id').eq('user_id', userId).eq('completed_on', todayStr),
      supabase.from('pause_log').select('id').eq('user_id', userId).eq('sprint_id', sprint.id).eq('week_number', getWeekNumber(new Date())),
    ]);

    const todayDay = allDays?.find((d) => d.date === todayStr) ?? null;

    set({
      sprint,
      today: todayDay,
      sprintDays: allDays ?? [],
      routine: routine ?? [],
      completions: completions?.map((c) => c.item_id) ?? [],
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
    const { sprint, today, sprintDays, pausesThisWeek } = get();
    if (!sprint || !today || pausesThisWeek >= 1) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const weekNum = getWeekNumber(new Date());

    // Log the pause
    await supabase.from('pause_log').insert({
      user_id: userId,
      sprint_id: sprint.id,
      paused_on: todayStr,
      week_number: weekNum,
    });

    // Mark today as paused
    await supabase
      .from('sprint_days')
      .update({ status: 'paused', is_paused: true })
      .eq('id', today.id);

    // Shift all future (non-paused) sprint days +1 day
    const futureDays = sprintDays.filter((d) => d.date > todayStr && !d.is_paused);
    for (const day of futureDays) {
      await supabase
        .from('sprint_days')
        .update({ date: addDays(day.date, 1) })
        .eq('id', day.id);
    }

    // Extend sprint end_date by 1 day
    const newEndDate = addDays(sprint.end_date, 1);
    await supabase
      .from('sprints')
      .update({ end_date: newEndDate })
      .eq('id', sprint.id);

    // Update local state
    const updatedDays = sprintDays.map((d) => {
      if (d.id === today.id) return { ...d, status: 'paused', is_paused: true };
      if (d.date > todayStr && !d.is_paused) return { ...d, date: addDays(d.date, 1) };
      return d;
    });

    set({
      pausesThisWeek: 1,
      today: { ...today, status: 'paused', is_paused: true },
      sprintDays: updatedDays,
      sprint: { ...sprint, end_date: newEndDate },
    });
  },

  markDayDone: async (_userId: string) => {
    const { today, sprintDays } = get();
    if (!today) return;
    await supabase
      .from('sprint_days')
      .update({ status: 'done' })
      .eq('id', today.id);
    const updatedDays = sprintDays.map((d) => d.id === today.id ? { ...d, status: 'done' } : d);
    set({ today: { ...today, status: 'done' }, sprintDays: updatedDays });
  },

  updateDayTask: async (dayId: string, title: string, notes: string) => {
    await supabase
      .from('sprint_days')
      .update({ task_title: title || null, task_notes: notes || null })
      .eq('id', dayId);
    const { sprintDays, today } = get();
    const updatedDays = sprintDays.map((d) =>
      d.id === dayId ? { ...d, task_title: title || null, task_notes: notes || null } : d
    );
    const updatedToday = today?.id === dayId
      ? { ...today, task_title: title || null, task_notes: notes || null }
      : today;
    set({ sprintDays: updatedDays, today: updatedToday });
  },

  fetchDayTasks: async (dayId: string) => {
    const { data } = await supabase
      .from('sprint_day_tasks')
      .select('*')
      .eq('sprint_day_id', dayId)
      .order('sort_order');
    set((s) => ({ dayTasks: { ...s.dayTasks, [dayId]: data ?? [] } }));
  },

  addDayTask: async (userId: string, dayId: string, title: string, notes = '', colorTag = '') => {
    const { dayTasks } = get();
    const existing = dayTasks[dayId] ?? [];
    const { data, error } = await supabase
      .from('sprint_day_tasks')
      .insert({
        user_id: userId,
        sprint_day_id: dayId,
        title,
        notes: notes || null,
        color_tag: colorTag || null,
        is_done: false,
        sort_order: existing.length,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (data) {
      set((s) => ({ dayTasks: { ...s.dayTasks, [dayId]: [...(s.dayTasks[dayId] ?? []), data] } }));
    }
  },

  toggleDayTask: async (dayId: string, taskId: string) => {
    const { dayTasks } = get();
    const tasks = dayTasks[dayId] ?? [];
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newDone = !task.is_done;
    await supabase.from('sprint_day_tasks').update({ is_done: newDone }).eq('id', taskId);
    set((s) => ({
      dayTasks: {
        ...s.dayTasks,
        [dayId]: (s.dayTasks[dayId] ?? []).map((t) => t.id === taskId ? { ...t, is_done: newDone } : t),
      },
    }));
  },

  deleteDayTask: async (dayId: string, taskId: string) => {
    await supabase.from('sprint_day_tasks').delete().eq('id', taskId);
    set((s) => ({
      dayTasks: {
        ...s.dayTasks,
        [dayId]: (s.dayTasks[dayId] ?? []).filter((t) => t.id !== taskId),
      },
    }));
  },

  updateDayTaskItem: async (dayId: string, taskId: string, title: string, notes: string) => {
    await supabase
      .from('sprint_day_tasks')
      .update({ title, notes: notes || null })
      .eq('id', taskId);
    set((s) => ({
      dayTasks: {
        ...s.dayTasks,
        [dayId]: (s.dayTasks[dayId] ?? []).map((t) =>
          t.id === taskId ? { ...t, title, notes: notes || null } : t
        ),
      },
    }));
  },
}));
