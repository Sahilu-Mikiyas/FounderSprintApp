import { create } from 'zustand';

type SprintMode = 'custom' | 'prebuilt' | 'rotation';

interface OnboardingState {
  mode: SprintMode | null;
  durationDays: number | null;
  revenueGoal: number | null;
  setMode: (mode: SprintMode) => void;
  setDuration: (days: number) => void;
  setRevenueGoal: (goal: number) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  mode: null,
  durationDays: null,
  revenueGoal: null,
  setMode: (mode) => set({ mode }),
  setDuration: (durationDays) => set({ durationDays }),
  setRevenueGoal: (revenueGoal) => set({ revenueGoal }),
  reset: () => set({ mode: null, durationDays: null, revenueGoal: null }),
}));
