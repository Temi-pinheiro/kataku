import { create } from 'zustand';
import type { InstalledLanguage } from './packs';

export type Screen = 'home' | 'session' | 'review' | 'settings' | 'm0spike';

export interface Settings {
  thinkSeconds: number; // 2–10, default 4 (plan §3.1)
  coachEnabled: boolean; // Tier 1, on by default (plan §11)
  monthlyCapUsd: number;
  theme: 'system' | 'dark' | 'light';
}

export const DEFAULT_SETTINGS: Settings = {
  thinkSeconds: 4,
  coachEnabled: true,
  monthlyCapUsd: 10,
  theme: 'system',
};

interface AppState {
  screen: Screen;
  language: InstalledLanguage;
  settings: Settings;
  setScreen: (s: Screen) => void;
  setLanguage: (l: InstalledLanguage) => void;
  setSettings: (s: Partial<Settings>) => void;
}

export const useApp = create<AppState>((set) => ({
  screen: 'home',
  language: 'id',
  settings: DEFAULT_SETTINGS,
  setScreen: (screen) => set({ screen }),
  setLanguage: (language) => set({ language }),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
}));
