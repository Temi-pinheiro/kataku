import { create } from 'zustand';
import type { InstalledLanguage } from './packs';

export type Screen =
  | 'home'
  | 'teacher'
  | 'conversation'
  | 'session'
  | 'review'
  | 'map'
  | 'stories'
  | 'story'
  | 'verbs'
  | 'settings'
  | 'm0spike';

export interface Settings {
  thinkSeconds: number; // 2–10; set via Think time (Generous 8 / Normal 4 / Brisk 2)
  coachEnabled: boolean; // Tier 1, on by default (plan §11)
  monthlyCapUsd: number;
  theme: 'system' | 'dark' | 'light'; // 'system' surfaces as "Auto" (follows iOS)
  defaultMood: 'gentle' | 'normal'; // conversation opening mood (switchable per scene)
  speakingPace: 'slow' | 'teaching' | 'natural'; // teacher playback pace
  showSpendInLessons: boolean; // the quiet spend figure in the teacher chat
}

export const DEFAULT_SETTINGS: Settings = {
  thinkSeconds: 4,
  coachEnabled: true,
  monthlyCapUsd: 10,
  theme: 'system',
  defaultMood: 'gentle',
  speakingPace: 'natural',
  showSpendInLessons: true,
};

interface AppState {
  screen: Screen;
  language: InstalledLanguage;
  settings: Settings;
  storyId: string | null; // the story open in the player
  setScreen: (s: Screen) => void;
  setLanguage: (l: InstalledLanguage) => void;
  setSettings: (s: Partial<Settings>) => void;
  openStory: (id: string) => void;
}

export const useApp = create<AppState>((set) => ({
  screen: 'home',
  language: 'id',
  settings: DEFAULT_SETTINGS,
  storyId: null,
  setScreen: (screen) => set({ screen }),
  setLanguage: (language) => set({ language }),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  openStory: (storyId) => set({ storyId, screen: 'story' }),
}));
