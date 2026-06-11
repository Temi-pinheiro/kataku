import { describe, expect, it } from 'vitest';
import type { ContentItem, ContentPrompt, CoursePack } from '../content/types';
import type { MasteryState } from '../scheduler/scheduler';
import { buildSession } from './builder';

const T0 = new Date('2026-06-11T08:00:00Z');

function item(id: string, target: string): ContentItem {
  return {
    id,
    type: 'block',
    concept_en: id,
    target_text: target,
    romanization: null,
    teach_script: `The word is ${target}.`,
    audio: { teach: `${id}-t` },
  };
}

function prompt(id: string, components: string[], difficulty = 1): ContentPrompt {
  return {
    id,
    cue_en: `cue ${id}`,
    expected: [`answer ${id}`],
    components,
    difficulty,
    audio: { cue: `${id}-c`, answer: `${id}-a`, answer_slow: `${id}-s` },
  };
}

function mastered(itemId: string, strength: number, dueOffsetDays: number): MasteryState {
  return {
    itemId,
    strength,
    lastSeenAt: T0.toISOString(),
    dueAt: new Date(T0.getTime() + dueOffsetDays * 86400_000).toISOString(),
  };
}

const PACK: CoursePack = {
  language: 'id',
  phase: 'foundation',
  version: 1,
  templates: [],
  system_lines: {},
  units: [
    {
      index: 1,
      title: 'Unit 1',
      lessons: [
        {
          index: 1,
          items: [item('a', 'mau'), item('b', 'makan')],
          prompts: [prompt('p1', ['a']), prompt('p2', ['a', 'b'], 2), prompt('p3', ['a', 'b'], 3)],
        },
        {
          index: 2,
          items: [item('c', 'sekarang')],
          prompts: [
            prompt('p4', ['c']),
            prompt('p5', ['a', 'c'], 2),
            prompt('p6', ['b', 'c'], 2),
            prompt('p7', ['a', 'b', 'c'], 3),
            prompt('p8', ['a', 'b', 'c'], 3),
          ],
        },
      ],
    },
  ],
};

describe('buildSession', () => {
  it('serves lesson 1 to a brand-new learner with teach-before-first-use ordering', () => {
    const plan = buildSession(PACK, 0, [], T0)!;
    expect(plan.lessonRef).toBe('1.1');
    expect(plan.newItemIds).toEqual(['a', 'b']);

    const kinds = plan.steps.map((s) => (s.kind === 'teach' ? `teach:${s.item.id}` : s.prompt.id));
    // 'a' taught before p1; 'b' taught right before p2, its first use.
    expect(kinds).toEqual(['teach:a', 'p1', 'teach:b', 'p2', 'p3']);
  });

  it('marks the final prompts as the victory lap', () => {
    const plan = buildSession(PACK, 1, [], T0)!;
    const lap = plan.steps.filter((s) => s.kind === 'prompt' && s.isVictoryLap).map((s: any) => s.prompt.id);
    expect(lap).toEqual(['p6', 'p7', 'p8']);
  });

  it('weaves due items in as extra prompts from earlier lessons', () => {
    // 'b' is due and lesson 2's own prompts cover it — no extra needed.
    // Make a pack where lesson 2 doesn't cover 'b'.
    const pack: CoursePack = {
      ...PACK,
      units: [
        {
          index: 1,
          title: 'Unit 1',
          lessons: [
            PACK.units[0].lessons[0],
            {
              index: 2,
              items: [item('c', 'sekarang')],
              prompts: [prompt('p4', ['c']), prompt('p5', ['a', 'c'], 2), prompt('p6', ['a', 'c'], 2), prompt('p7', ['a', 'c'], 3)],
            },
          ],
        },
      ],
    };
    const plan = buildSession(pack, 1, [mastered('b', 1, -1)], T0)!;
    expect(plan.recycledItemIds).toEqual(['b']);
    const recycled = plan.steps.filter((s) => s.kind === 'prompt' && s.isRecycle).map((s: any) => s.prompt.id);
    // Hardest earlier prompt containing 'b' is p3 (difficulty 3).
    expect(recycled).toEqual(['p3']);
    // Recycled prompts never displace the victory lap at the end.
    const last = plan.steps[plan.steps.length - 1];
    expect(last.kind === 'prompt' && last.isVictoryLap).toBe(true);
  });

  it('skips recycling for items not due or already covered by the lesson', () => {
    const plan = buildSession(PACK, 1, [mastered('b', 4, +3)], T0)!;
    expect(plan.recycledItemIds).toEqual([]);
  });

  it('returns null when the course is finished and flags the last lesson', () => {
    expect(buildSession(PACK, 2, [], T0)).toBeNull();
    expect(buildSession(PACK, 1, [], T0)!.isLastLesson).toBe(true);
  });
});
