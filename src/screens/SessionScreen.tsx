import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BigButton } from '../components/BigButton';
import { PACKS, type InstalledLanguage } from '../packs';
import { useApp } from '../store';
import { colors, type } from '../theme';
import type { ContentItem, ContentPrompt, CoursePack } from '../lib/content/types';
import { buildSession, type SessionPlan, type SessionStep } from '../lib/session/builder';
import { newMastery, recordOutcome, type MasteryState } from '../lib/scheduler/scheduler';
import { lastAttempt, outcomeForMastery, type LoopState } from '../lib/voice-loop/machine';
import { useVoiceLoop } from '../hooks/useVoiceLoop';
import { completedChunkCount, finishSession, getAllMastery, recordAttempt, startSession, upsertMastery } from '../db';
import { recognizer, teachingAudio } from '../services/instances';

type Stage =
  | { kind: 'loading' }
  | { kind: 'running'; plan: SessionPlan; stepIndex: number; sessionId: number }
  | { kind: 'finished'; plan: SessionPlan; sessionId: number }
  | { kind: 'course-done' };

export function SessionScreen() {
  const { setScreen, settings, language } = useApp();
  const PACK = PACKS[language];
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const masteryRef = useRef(new Map<string, MasteryState>());
  const promptsDoneRef = useRef(0);

  const begin = useCallback(async () => {
    setStage({ kind: 'loading' });
    const [chunks, mastery] = await Promise.all([completedChunkCount(language), getAllMastery()]);
    masteryRef.current = new Map(mastery.map((m) => [m.itemId, m]));
    const plan = buildSession(PACK, chunks, mastery, new Date());
    if (!plan) {
      setStage({ kind: 'course-done' });
      return;
    }
    promptsDoneRef.current = 0;
    const sessionId = await startSession(language, new Date());
    setStage({ kind: 'running', plan, stepIndex: 0, sessionId });
  }, [language, PACK]);

  useEffect(() => {
    begin();
  }, [begin]);

  const advance = useCallback(() => {
    setStage((s) => {
      if (s.kind !== 'running') return s;
      const next = s.stepIndex + 1;
      if (next >= s.plan.steps.length) {
        finishSession(
          s.sessionId,
          { newItems: s.plan.newItemIds.length, promptsDone: promptsDoneRef.current, coreCompleted: true },
          new Date(),
        );
        return { kind: 'finished', plan: s.plan, sessionId: s.sessionId };
      }
      return { ...s, stepIndex: next };
    });
  }, []);

  const onPromptFinished = useCallback(
    async (prompt: ContentPrompt, loopState: LoopState) => {
      promptsDoneRef.current += 1;
      const now = new Date();
      for (const [i, attempt] of loopState.attempts.entries()) {
        await recordAttempt({
          promptId: prompt.id,
          at: now.toISOString(),
          transcript: attempt.transcript,
          result: attempt.evaluation.result,
          thinkMs: null,
          retries: i,
          audioUri: null,
        });
      }
      const outcome = outcomeForMastery(loopState);
      for (const itemId of prompt.components) {
        const prev = masteryRef.current.get(itemId) ?? newMastery(itemId, now);
        const updated = recordOutcome(prev, outcome, now);
        masteryRef.current.set(itemId, updated);
        await upsertMastery(updated);
      }
      advance();
    },
    [advance],
  );

  if (stage.kind === 'loading') {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (stage.kind === 'course-done') {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Foundation complete.</Text>
        <Text style={styles.dim}>Builder packs are next on the roadmap.</Text>
        <BigButton label="Home" onPress={() => setScreen('home')} />
      </View>
    );
  }

  if (stage.kind === 'finished') {
    const { plan } = stage;
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{PACK.system_lines.session_close?.text ?? 'Done.'}</Text>
        <Text style={styles.dim}>
          Lesson {plan.lessonRef} — {plan.newItemIds.length} new blocks, {promptsDoneRef.current} prompts
          {plan.recycledItemIds.length > 0 ? `, ${plan.recycledItemIds.length} recycled` : ''}.
        </Text>
        {!plan.isLastLesson && <BigButton label="Keep going" onPress={begin} />}
        <BigButton label="Home" kind="ghost" onPress={() => setScreen('home')} />
      </View>
    );
  }

  const step = stage.plan.steps[stage.stepIndex];
  const progress = `${stage.stepIndex + 1} / ${stage.plan.steps.length}`;
  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <Text style={styles.dim} onPress={() => setScreen('home')}>
          ‹ pause
        </Text>
        <Text style={styles.dim}>{progress}</Text>
      </View>
      {step.kind === 'teach' ? (
        <TeachCard key={step.item.id} item={step.item} onDone={advance} />
      ) : (
        <PromptCard
          key={step.prompt.id + ':' + stage.stepIndex}
          prompt={step.prompt}
          pack={PACK}
          lang={language}
          isVictoryLap={step.isVictoryLap}
          thinkMs={settings.thinkSeconds * 1000}
          onFinished={onPromptFinished}
        />
      )}
    </View>
  );
}

function TeachCard({ item, onDone }: { item: ContentItem; onDone: () => void }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await teachingAudio.play({ key: item.audio.teach, fallbackText: item.teach_script, lang: 'en' });
      if (!cancelled) setTimeout(onDone, 600);
    })();
    return () => {
      cancelled = true;
      teachingAudio.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <View style={styles.card}>
      <Text style={styles.dim}>{item.concept_en}</Text>
      <Text style={styles.giant}>{item.target_text}</Text>
      {item.romanization && <Text style={styles.dim}>{item.romanization}</Text>}
    </View>
  );
}

function PromptCard({
  prompt,
  pack,
  lang,
  isVictoryLap,
  thinkMs,
  onFinished,
}: {
  prompt: ContentPrompt;
  pack: CoursePack;
  lang: InstalledLanguage;
  isVictoryLap: boolean;
  thinkMs: number;
  onFinished: (prompt: ContentPrompt, state: LoopState) => void;
}) {
  const { state, heard, send } = useVoiceLoop({
    prompt,
    lang,
    systemLines: pack.system_lines,
    audio: teachingAudio,
    recognizer,
    thinkMs,
    onFinished: (s) => onFinished(prompt, s),
  });

  const phaseLine: Record<string, string> = {
    idle: ' ',
    play_cue: '…',
    think: 'think it',
    listen: '● say it',
    feedback: feedbackLabel(state.feedbackKind),
    done: ' ',
  };

  const final = lastAttempt(state);
  return (
    <View style={styles.card}>
      {isVictoryLap && <Text style={styles.lap}>victory lap</Text>}
      <Text style={styles.cue}>{prompt.cue_en}</Text>
      <Text style={[styles.phase, state.phase === 'listen' && { color: colors.accent }]}>{phaseLine[state.phase]}</Text>
      <Text style={styles.heard}>{heard || (final ? final.transcript : ' ')}</Text>
      <View style={styles.controls}>
        <BigButton label="Repeat" kind="ghost" onPress={() => send({ type: 'REPEAT' })} style={styles.control} />
        <BigButton label="Slower" kind="ghost" onPress={() => send({ type: 'SLOWER' })} style={styles.control} />
        <BigButton label="Skip" kind="ghost" onPress={() => send({ type: 'SKIP' })} style={styles.control} />
      </View>
      {state.phase === 'think' && (
        <BigButton label="I'm ready — listening" onPress={() => send({ type: 'TAP_TO_ANSWER' })} />
      )}
    </View>
  );
}

function feedbackLabel(kind: LoopState['feedbackKind']): string {
  switch (kind) {
    case 'pass':
      return 'yes';
    case 'near':
      return 'almost';
    case 'miss':
      return 'listen again';
    case 'skip':
      return 'here it is';
    default:
      return ' ';
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' },
  topRow: { position: 'absolute', top: 64, left: 24, right: 24, flexDirection: 'row', justifyContent: 'space-between' },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 28, minHeight: 360, justifyContent: 'center' },
  title: { color: colors.text, fontSize: type.title, fontWeight: '700', marginBottom: 8 },
  giant: { color: colors.text, fontSize: type.giant, fontWeight: '800', marginVertical: 12 },
  cue: { color: colors.text, fontSize: type.body, marginBottom: 20 },
  phase: { color: colors.dim, fontSize: type.title, fontWeight: '700', marginBottom: 16 },
  heard: { color: colors.warn, fontSize: type.title, minHeight: 40, marginBottom: 20 },
  dim: { color: colors.dim, fontSize: type.small, marginBottom: 6 },
  lap: { color: colors.accent, fontSize: type.small, fontWeight: '700', marginBottom: 10 },
  controls: { flexDirection: 'row', gap: 8 },
  control: { flex: 1, paddingHorizontal: 0 },
});
