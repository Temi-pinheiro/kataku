import { OUTLINES, type CourseOutline } from '../../content/outlines';
import type { InstalledLanguage } from '../../packs';

/**
 * Modules: the fixed, ordered spine of a course (owner decision 2026-06-21).
 * Each lesson node in a language's outline (content/outlines.ts) is one
 * module — a bounded section the teacher runs start-to-finish before the
 * learner taps Continue. The map browses this spine; real completion (not a
 * blocks-owned estimate) decides done/here/ahead. Pure logic, no I/O — the
 * persisted completion set and the current pointer are passed in.
 */

export interface Module {
  /** Stable id along the spine: `${language}-${index}`. */
  id: string;
  language: InstalledLanguage;
  /** 0-based position along the spine. */
  index: number;
  monthLabel: string;
  /** '' when the outline's week carries no label. */
  weekLabel: string;
  topic: string;
  /** Illustrative focus words (·-separated) — anchors, not the full vocab. */
  words: string;
}

export type ModuleState = 'done' | 'here' | 'ahead';

/** Flatten an outline into the ordered module spine. */
export function flattenModules(language: InstalledLanguage, outline: CourseOutline): Module[] {
  const modules: Module[] = [];
  for (const month of outline) {
    for (const week of month.weeks) {
      for (const lesson of week.lessons) {
        const index = modules.length;
        modules.push({
          id: `${language}-${index}`,
          language,
          index,
          monthLabel: month.label,
          weekLabel: week.label,
          topic: lesson.topic,
          words: lesson.words,
        });
      }
    }
  }
  return modules;
}

export function modulesFor(language: InstalledLanguage): Module[] {
  return flattenModules(language, OUTLINES[language]);
}

export function moduleById(language: InstalledLanguage, id: string): Module | undefined {
  return modulesFor(language).find((m) => m.id === id);
}

/**
 * The module to teach by default: the first not-yet-completed one — or the
 * last module once everything's done (nothing locks; revisiting is always on).
 * Null only for an empty spine.
 */
export function firstIncompleteId(modules: Module[], completed: ReadonlySet<string>): string | null {
  if (modules.length === 0) return null;
  const next = modules.find((m) => !completed.has(m.id));
  return (next ?? modules[modules.length - 1]).id;
}

/** The module after a given one; null at the end of the spine. */
export function nextModule(modules: Module[], id: string): Module | null {
  const i = modules.findIndex((m) => m.id === id);
  if (i === -1 || i + 1 >= modules.length) return null;
  return modules[i + 1];
}

/**
 * Map state: the active module is always 'here' (where you are now, even when
 * revisiting a finished one); other completed modules are 'done'; the rest are
 * 'ahead'. Nothing is ever locked.
 */
export function moduleState(module: Module, completed: ReadonlySet<string>, currentId: string | null): ModuleState {
  if (module.id === currentId) return 'here';
  if (completed.has(module.id)) return 'done';
  return 'ahead';
}

/**
 * Approximate "already taught" vocabulary for the teacher directive: the focus
 * words of every module before `index`, flattened and de-duped. Anchors only
 * (the outline is illustrative), but enough that the teacher resumes the
 * cumulative course instead of re-introducing earlier blocks.
 */
export function knownWordsBefore(modules: Module[], index: number): string[] {
  const words: string[] = [];
  for (const m of modules) {
    if (m.index >= index) break;
    for (const w of m.words.split('·').map((s) => s.trim()).filter(Boolean)) {
      if (!words.includes(w)) words.push(w);
    }
  }
  return words;
}
