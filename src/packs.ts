import idPack from '../content/id/foundation.json';
import esPack from '../content/es/foundation.json';
import frPack from '../content/fr/foundation.json';
import type { CoursePack } from './lib/content/types';

/** Installed course packs. zh and it arrive with M5. */
export const PACKS = {
  id: idPack as unknown as CoursePack,
  es: esPack as unknown as CoursePack,
  fr: frPack as unknown as CoursePack,
} as const;

export type InstalledLanguage = keyof typeof PACKS;

export const LANGUAGE_NAMES: Record<InstalledLanguage, string> = {
  id: 'Bahasa Indonesia',
  es: 'Español',
  fr: 'Français',
};

export const INSTALLED_LANGUAGES = Object.keys(PACKS) as InstalledLanguage[];
