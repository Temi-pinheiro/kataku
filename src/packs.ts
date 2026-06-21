import idPack from '../content/id/foundation.json';
import esPack from '../content/es/foundation.json';
import frPack from '../content/fr/foundation.json';
import type { CoursePack } from './lib/content/types';

/**
 * Every teachable language. The teacher chat and conversation mode need
 * only a protocol + an STT locale; the classic drill deck additionally
 * needs a rendered course pack — the it pack is on the roadmap, so it is
 * chat/conversation-only for now.
 */
export const LANGUAGES = ['id', 'es', 'fr', 'it'] as const;
export type InstalledLanguage = (typeof LANGUAGES)[number];

/** Course packs for the deck; absent = no deck yet for that language. */
export const PACKS: Partial<Record<InstalledLanguage, CoursePack>> = {
  id: idPack as unknown as CoursePack,
  es: esPack as unknown as CoursePack,
  fr: frPack as unknown as CoursePack,
};

export function packFor(language: InstalledLanguage): CoursePack | null {
  return PACKS[language] ?? null;
}

export function hasPack(language: InstalledLanguage): boolean {
  return PACKS[language] != null;
}

/** Native display names (UI surfaces). */
export const LANGUAGE_NAMES: Record<InstalledLanguage, string> = {
  id: 'Bahasa Indonesia',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
};

/** English names (LLM prompts — "you are teaching Italian"). */
export const LANGUAGE_NAMES_EN: Record<InstalledLanguage, string> = {
  id: 'Indonesian',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
};

export const INSTALLED_LANGUAGES = [...LANGUAGES] as InstalledLanguage[];
