import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { scheduleRoutineAlarm, cancelRoutineAlarms } from '../lib/notifications';

export interface RoutineCategory {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface RoutineItem {
  id: string;
  user_id: string;
  title: string;
  duration_minutes: number | null;
  sort_order: number;
  category_id: string | null;
}

export interface RoutineAlarm {
  id: string;
  routine_item_id: string;
  hour: number;
  minute: number;
  frequency: 'daily' | 'weekdays' | 'weekends';
  is_active: boolean;
}

interface RoutineStore {
  categories: RoutineCategory[];
  items: RoutineItem[];
  alarms: RoutineAlarm[];
  completions: string[]; // item_ids completed today
  loading: boolean;
  fetchAll: (userId: string) => Promise<void>;
  fetchCompletions: (userId: string) => Promise<void>;
  toggleCompletion: (userId: string, itemId: string) => Promise<void>;
  // Categories
  addCategory: (userId: string, name: string, color: string) => Promise<void>;
  updateCategory: (id: string, name: string, color: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  // Items
  addItem: (userId: string, title: string, durationMinutes: number | null, categoryId: string | null) => Promise<void>;
  updateItem: (id: string, title: string, durationMinutes: number | null, categoryId: string | null) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  reorderItems: (items: RoutineItem[]) => Promise<void>;
  // Alarms
  addAlarm: (itemId: string, itemTitle: string, hour: number, minute: number, frequency: 'daily' | 'weekdays' | 'weekends') => Promise<void>;
  toggleAlarm: (alarmId: string) => Promise<void>;
  deleteAlarm: (alarmId: string) => Promise<void>;
}

export const useRoutineStore = create<RoutineStore>((set, get) => ({
  categories: [],
  items: [],
  alarms: [],
  completions: [],
  loading: false,

  fetchCompletions: async (userId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('routine_completions')
      .select('item_id')
      .eq('user_id', userId)
      .eq('completed_on', today);
    set({ completions: (data ?? []).map((r: { item_id: string }) => r.item_id) });
  },

  toggleCompletion: async (userId: string, itemId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const { completions } = get();
    const isDone = completions.includes(itemId);
    if (isDone) {
      await supabase.from('routine_completions')
        .delete().eq('user_id', userId).eq('item_id', itemId).eq('completed_on', today);
      set({ completions: completions.filter((id) => id !== itemId) });
    } else {
      await supabase.from('routine_completions')
        .insert({ user_id: userId, item_id: itemId, completed_on: today });
      set({ completions: [...completions, itemId] });
    }
  },

  fetchAll: async (userId: string) => {
    set({ loading: true });
    const [{ data: cats }, { data: items }, { data: alarms }] = await Promise.all([
      supabase.from('routine_categories').select('*').eq('user_id', userId).order('sort_order'),
      supabase.from('routine_items').select('*').eq('user_id', userId).order('sort_order'),
      supabase
        .from('routine_alarms')
        .select('*, routine_items!inner(user_id)')
        .eq('routine_items.user_id', userId),
    ]);
    set({
      categories: cats ?? [],
      items: items ?? [],
      alarms: (alarms ?? []).map(({ routine_items: _ri, ...a }) => a) as RoutineAlarm[],
      loading: false,
    });
    get().fetchCompletions(userId);
  },

  addCategory: async (userId, name, color) => {
    const { categories } = get();
    const { data } = await supabase
      .from('routine_categories')
      .insert({ user_id: userId, name, color, sort_order: categories.length })
      .select()
      .single();
    if (data) set((s) => ({ categories: [...s.categories, data] }));
  },

  updateCategory: async (id, name, color) => {
    await supabase.from('routine_categories').update({ name, color }).eq('id', id);
    set((s) => ({
      categories: s.categories.map((c) => c.id === id ? { ...c, name, color } : c),
    }));
  },

  deleteCategory: async (id) => {
    await supabase.from('routine_categories').delete().eq('id', id);
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
      items: s.items.map((item) => item.category_id === id ? { ...item, category_id: null } : item),
    }));
  },

  addItem: async (userId, title, durationMinutes, categoryId) => {
    const { items } = get();
    const { data } = await supabase
      .from('routine_items')
      .insert({ user_id: userId, title, duration_minutes: durationMinutes, category_id: categoryId, sort_order: items.length })
      .select()
      .single();
    if (data) set((s) => ({ items: [...s.items, data] }));
  },

  updateItem: async (id, title, durationMinutes, categoryId) => {
    await supabase
      .from('routine_items')
      .update({ title, duration_minutes: durationMinutes, category_id: categoryId })
      .eq('id', id);
    set((s) => ({
      items: s.items.map((item) =>
        item.id === id ? { ...item, title, duration_minutes: durationMinutes, category_id: categoryId } : item
      ),
    }));
  },

  deleteItem: async (id) => {
    // Cancel all alarms for this item first
    const { alarms } = get();
    const itemAlarms = alarms.filter((a) => a.routine_item_id === id);
    await Promise.all(itemAlarms.map((a) => cancelRoutineAlarms(a.id)));
    await supabase.from('routine_items').delete().eq('id', id);
    set((s) => ({
      items: s.items.filter((item) => item.id !== id),
      alarms: s.alarms.filter((a) => a.routine_item_id !== id),
    }));
  },

  reorderItems: async (items) => {
    set({ items });
    await Promise.all(
      items.map((item, i) =>
        supabase.from('routine_items').update({ sort_order: i }).eq('id', item.id)
      )
    );
  },

  addAlarm: async (itemId, itemTitle, hour, minute, frequency) => {
    const { data } = await supabase
      .from('routine_alarms')
      .insert({ routine_item_id: itemId, hour, minute, frequency, is_active: true })
      .select()
      .single();
    if (data) {
      await scheduleRoutineAlarm(data.id, itemTitle, hour, minute, frequency);
      set((s) => ({ alarms: [...s.alarms, data] }));
    }
  },

  toggleAlarm: async (alarmId) => {
    const { alarms, items } = get();
    const alarm = alarms.find((a) => a.id === alarmId);
    if (!alarm) return;
    const newActive = !alarm.is_active;
    await supabase.from('routine_alarms').update({ is_active: newActive }).eq('id', alarmId);
    if (newActive) {
      const item = items.find((i) => i.id === alarm.routine_item_id);
      if (item) await scheduleRoutineAlarm(alarmId, item.title, alarm.hour, alarm.minute, alarm.frequency);
    } else {
      await cancelRoutineAlarms(alarmId);
    }
    set((s) => ({
      alarms: s.alarms.map((a) => a.id === alarmId ? { ...a, is_active: newActive } : a),
    }));
  },

  deleteAlarm: async (alarmId) => {
    await cancelRoutineAlarms(alarmId);
    await supabase.from('routine_alarms').delete().eq('id', alarmId);
    set((s) => ({ alarms: s.alarms.filter((a) => a.id !== alarmId) }));
  },
}));
