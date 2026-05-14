import { create } from 'zustand';

type SprintMode = 'custom' | 'prebuilt' | 'rotation';

// Default prebuilt rotation pattern
export const PREBUILT_DAY_TYPES = ['deep_work', 'deep_work', 'content', 'outreach', 'review', 'deep_work', 'deep_work'];

interface OnboardingState {
  mode: SprintMode | null;
  durationDays: number | null;
  revenueGoal: number | null;
  dayTypes: string[]; // rotation order for custom/rotation modes
  setMode: (mode: SprintMode) => void;
  setDuration: (days: number) => void;
  setRevenueGoal: (goal: number) => void;
  setDayTypes: (types: string[]) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  mode: null,
  durationDays: null,
  revenueGoal: null,
  dayTypes: PREBUILT_DAY_TYPES,
  setMode: (mode) => set({ mode }),
  setDuration: (durationDays) => set({ durationDays }),
  setRevenueGoal: (revenueGoal) => set({ revenueGoal }),
  setDayTypes: (dayTypes) => set({ dayTypes }),
  reset: () => set({ mode: null, durationDays: null, revenueGoal: null, dayTypes: PREBUILT_DAY_TYPES }),
}));
