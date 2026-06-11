import type { ContentItem, ContentPrompt, CoursePack } from '../content/types';
import { allLessons } from '../content/types';
import { selectDueItems, type MasteryState } from '../scheduler/scheduler';

/**
 * Daily session assembly (plan §3.2): the next lesson chunk's teach items
 * and prompts, with due items recycled *as components inside sentences* —
 * extra prompts pulled from earlier lessons, never flashcards.
 */

export type SessionStep =
  | { kind: 'teach'; item: ContentItem }
  | { kind: 'prompt'; prompt: ContentPrompt; isRecycle: boolean; isVictoryLap: boolean };

export interface SessionPlan {
  /** "unit.lesson", e.g. "1.3" — stored on session rows. */
  lessonRef: string;
  steps: SessionStep[];
  newItemIds: string[];
  recycledItemIds: string[];
  /** True when the pack has no lesson after this one. */
  isLastLesson: boolean;
}

export interface BuildSessionConfig {
  /** Extra recycled prompts woven in beyond the lesson's own. */
  maxRecycledPrompts: number;
  /** The final N prompts of a lesson are the victory lap (content/SPEC.md convention). */
  victoryLapSize: number;
}

export const DEFAULT_SESSION_CONFIG: BuildSessionConfig = {
  maxRecycledPrompts: 4,
  victoryLapSize: 3,
};

/**
 * `lessonsCompleted` is the count of lesson chunks finished in this pack
 * (0 = brand new learner): "Keep going" just builds again with the
 * incremented count. Returns null when the course is finished.
 */
export function buildSession(
  pack: CoursePack,
  lessonsCompleted: number,
  mastery: readonly MasteryState[],
  now: Date,
  config: BuildSessionConfig = DEFAULT_SESSION_CONFIG,
): SessionPlan | null {
  const lessons = allLessons(pack);
  const current = lessons[lessonsCompleted];
  if (!current) return null;

  const { unit, lesson } = current;
  const newItemIds = lesson.items.map((i) => i.id);

  // Recycling: due items not already exercised by this lesson's prompts get
  // an extra prompt each, drawn from earlier lessons.
  const coveredByLesson = new Set(lesson.prompts.flatMap((p) => p.components));
  const dueElsewhere = selectDueItems(
    mastery.filter((m) => !coveredByLesson.has(m.itemId) && !newItemIds.includes(m.itemId)),
    now,
    config.maxRecycledPrompts,
  );

  const earlierPrompts = lessons.slice(0, lessonsCompleted).flatMap(({ lesson: l }) => l.prompts);
  const recyclePrompts: ContentPrompt[] = [];
  const recycledItemIds: string[] = [];
  for (const due of dueElsewhere) {
    const candidates = earlierPrompts.filter(
      (p) => p.components.includes(due.itemId) && !recyclePrompts.includes(p),
    );
    if (candidates.length === 0) continue;
    // Hardest prompt containing the item — recombination over repetition.
    candidates.sort((a, b) => b.difficulty - a.difficulty);
    recyclePrompts.push(candidates[0]);
    recycledItemIds.push(due.itemId);
    if (recyclePrompts.length >= config.maxRecycledPrompts) break;
  }

  const steps = interleave(lesson.items, lesson.prompts, recyclePrompts, config.victoryLapSize);

  return {
    lessonRef: `${unit.index}.${lesson.index}`,
    steps,
    newItemIds,
    recycledItemIds,
    isLastLesson: lessonsCompleted === lessons.length - 1,
  };
}

/**
 * Ordering rules:
 *  - a teach step lands immediately before the first prompt using that item
 *    (blocks are taught in seconds, then used at once — plan §2.2);
 *  - recycled prompts are woven into the middle third, never displacing the
 *    victory lap at the end.
 */
function interleave(
  items: ContentItem[],
  prompts: ContentPrompt[],
  recyclePrompts: ContentPrompt[],
  victoryLapSize: number,
): SessionStep[] {
  const steps: SessionStep[] = [];
  const taught = new Set<string>();
  const itemById = new Map(items.map((i) => [i.id, i]));
  // Lessons too short for a distinct lap (mini-lessons, tests) have none.
  const lapStart = prompts.length > victoryLapSize ? prompts.length - victoryLapSize : prompts.length;

  const recycleQueue = [...recyclePrompts];
  const insertEvery = recycleQueue.length > 0 ? Math.max(2, Math.floor(lapStart / (recycleQueue.length + 1))) : 0;

  prompts.forEach((prompt, idx) => {
    for (const componentId of prompt.components) {
      const item = itemById.get(componentId);
      if (item && !taught.has(item.id)) {
        taught.add(item.id);
        steps.push({ kind: 'teach', item });
      }
    }
    steps.push({ kind: 'prompt', prompt, isRecycle: false, isVictoryLap: idx >= lapStart });
    if (recycleQueue.length > 0 && idx < lapStart && (idx + 1) % insertEvery === 0) {
      steps.push({ kind: 'prompt', prompt: recycleQueue.shift()!, isRecycle: true, isVictoryLap: false });
    }
  });

  // Anything due but not yet placed (short lessons): before the victory lap.
  const lapSteps = steps.filter((s) => s.kind === 'prompt' && s.isVictoryLap);
  const rest = steps.filter((s) => !(s.kind === 'prompt' && s.isVictoryLap));
  for (const prompt of recycleQueue) {
    rest.push({ kind: 'prompt', prompt, isRecycle: true, isVictoryLap: false });
  }
  // Items never referenced by any prompt (rare; usage notes) are taught at the start.
  const untaught = items.filter((i) => !taught.has(i.id));
  return [...untaught.map((item): SessionStep => ({ kind: 'teach', item })), ...rest, ...lapSteps];
}
