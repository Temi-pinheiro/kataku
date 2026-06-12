import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { BigButton } from '../components/BigButton';
import { FeedbackSheet } from '../components/FeedbackSheet';
import { MicOrb } from '../components/MicOrb';
import { SessionProgress } from '../components/SessionProgress';
import { TutorDots } from '../components/TutorDots';
import { LANGUAGE_NAMES, packFor, type InstalledLanguage } from '../packs';
import { useApp } from '../store';
import { radii, resultFor, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import type { ContentItem, ContentPrompt, CoursePack } from '../lib/content/types';
import { allItems, allPrompts } from '../lib/content/types';
import { buildSession, type SessionPlan } from '../lib/session/builder';
import { newMastery, recordOutcome, type MasteryState } from '../lib/scheduler/scheduler';
import { canRetry, lastAttempt, outcomeForMastery, type LoopState } from '../lib/voice-loop/machine';
import { useVoiceLoop } from '../hooks/useVoiceLoop';
import {
  clearSessionProgress,
  completedChunkCount,
  deleteUnfinishedSession,
  finishSession,
  getAllMastery,
  loadSessionProgress,
  recordAttempt,
  saveSessionProgress,
  startSession,
  upsertMastery,
  type SavedSessionProgress,
  type SavedStepKey,
} from '../db';
import { recognizer, voiceEngine } from '../services/instances';

/** Session steps as the UI runs them: plan steps + spoken ritual moments. */
type UiStep =
  | { kind: 'announce'; line: string }
  | { kind: 'teach'; item: ContentItem }
  | { kind: 'prompt'; prompt: ContentPrompt; isRecycle: boolean; isVictoryLap: boolean };

interface RunInfo {
  steps: UiStep[];
  stepIndex: number;
  sessionId: number;
  lessonRef: string;
  newItemIds: string[];
  recycledItemIds: string[];
  isLastLesson: boolean;
}

type Stage =
  | { kind: 'loading' }
  | { kind: 'intro'; fresh: RunInfo | null; resume: RunInfo | null }
  | { kind: 'running'; run: RunInfo }
  | { kind: 'finished'; run: RunInfo }
  | { kind: 'course-done' };

function planToUiSteps(plan: SessionPlan): UiStep[] {
  const steps: UiStep[] = [{ kind: 'announce', line: 'session_open' }];
  let announcedLap = false;
  for (const s of plan.steps) {
    if (s.kind === 'prompt' && s.isVictoryLap && !announcedLap) {
      announcedLap = true;
      steps.push({ kind: 'announce', line: 'victory_intro' });
    }
    steps.push(s);
  }
  return steps;
}

function toStepKeys(steps: UiStep[]): SavedStepKey[] {
  return steps.map((s) =>
    s.kind === 'announce'
      ? { k: 'a', line: s.line }
      : s.kind === 'teach'
        ? { k: 't', id: s.item.id }
        : { k: 'p', id: s.prompt.id, r: s.isRecycle, v: s.isVictoryLap },
  );
}

function fromStepKeys(keys: SavedStepKey[], pack: CoursePack): UiStep[] | null {
  const items = new Map(allItems(pack).map((i) => [i.id, i]));
  const prompts = new Map(allPrompts(pack).map((p) => [p.id, p]));
  const steps: UiStep[] = [];
  for (const key of keys) {
    if (key.k === 'a') steps.push({ kind: 'announce', line: key.line });
    else if (key.k === 't') {
      const item = items.get(key.id);
      if (!item) return null; // content changed under the saved session
      steps.push({ kind: 'teach', item });
    } else {
      const prompt = prompts.get(key.id);
      if (!prompt) return null;
      steps.push({ kind: 'prompt', prompt, isRecycle: key.r, isVictoryLap: key.v });
    }
  }
  return steps;
}

export function SessionScreen() {
  const { setScreen, settings, language } = useApp();
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  // it/zh/ja have no rendered deck yet — the teacher and conversation
  // modes carry them. language is fixed for this screen's mount (Home
  // unmounts it to switch), so the early return keeps a stable hook order.
  const PACK = packFor(language);
  if (!PACK) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, justifyContent: 'center', padding: space.l, gap: space.m }}>
        <Text style={{ color: p.text, fontSize: type.title, fontWeight: '800' }}>No drill deck yet</Text>
        <Text style={{ color: p.dim, fontSize: type.body, lineHeight: 23 }}>
          {LANGUAGE_NAMES[language]} lives with the teacher and conversation modes for now — the offline deck
          arrives with its course pack.
        </Text>
        <BigButton label="Back" kind="quiet" onPress={() => setScreen('home')} />
      </View>
    );
  }
  /* eslint-disable react-hooks/rules-of-hooks -- PACK is constant for this mount; see note above */
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const masteryRef = useRef(new Map<string, MasteryState>());
  const promptsDoneRef = useRef(0);
  // "Keep going" rebuilds and starts the next chunk with no intro stop (§3.2).
  const autoStartRef = useRef(false);

  const persist = useCallback(
    (run: RunInfo) => {
      void saveSessionProgress(language, {
        sessionId: run.sessionId,
        lessonRef: run.lessonRef,
        stepKeys: toStepKeys(run.steps),
        stepIndex: run.stepIndex,
        newItemIds: run.newItemIds,
        recycledItemIds: run.recycledItemIds,
        isLastLesson: run.isLastLesson,
      });
    },
    [language],
  );

  const begin = useCallback(
    async (run: RunInfo, isResume: boolean) => {
      await recognizer.requestPermissions(); // dialogs here, never mid-prompt
      promptsDoneRef.current = 0;
      let sessionId = run.sessionId;
      if (!isResume || sessionId < 0) {
        sessionId = await startSession(language, new Date());
      }
      const live = { ...run, sessionId };
      persist(live);
      setStage({ kind: 'running', run: live });
    },
    [language, persist],
  );

  // Build a fresh plan and look for a resumable one.
  const load = useCallback(async () => {
    setStage({ kind: 'loading' });
    const [chunks, mastery, saved] = await Promise.all([
      completedChunkCount(language),
      getAllMastery(),
      loadSessionProgress(language),
    ]);
    masteryRef.current = new Map(mastery.map((m) => [m.itemId, m]));

    let resume: RunInfo | null = null;
    if (saved) {
      const steps = fromStepKeys(saved.stepKeys, PACK);
      if (steps && saved.stepIndex < steps.length) {
        resume = {
          steps,
          stepIndex: saved.stepIndex,
          sessionId: saved.sessionId,
          lessonRef: saved.lessonRef,
          newItemIds: saved.newItemIds,
          recycledItemIds: saved.recycledItemIds,
          isLastLesson: saved.isLastLesson,
        };
      } else {
        await clearSessionProgress(language);
      }
    }

    const plan = buildSession(PACK, chunks, mastery, new Date());
    if (!plan && !resume) {
      setStage({ kind: 'course-done' });
      return;
    }
    const fresh: RunInfo | null = plan
      ? {
          steps: planToUiSteps(plan),
          stepIndex: 0,
          sessionId: -1, // assigned on start
          lessonRef: plan.lessonRef,
          newItemIds: plan.newItemIds,
          recycledItemIds: plan.recycledItemIds,
          isLastLesson: plan.isLastLesson,
        }
      : null;

    if (autoStartRef.current && fresh && !resume) {
      autoStartRef.current = false;
      await begin(fresh, false);
      return;
    }
    autoStartRef.current = false;
    setStage({ kind: 'intro', fresh, resume });
  }, [language, PACK, begin]);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = useCallback(() => {
    setStage((s) => {
      if (s.kind !== 'running') return s;
      const next = s.run.stepIndex + 1;
      if (next >= s.run.steps.length) {
        void finishSession(
          s.run.sessionId,
          { newItems: s.run.newItemIds.length, promptsDone: promptsDoneRef.current, coreCompleted: true },
          new Date(),
        );
        void clearSessionProgress(language);
        return { kind: 'finished', run: s.run };
      }
      const run = { ...s.run, stepIndex: next };
      persist(run);
      return { kind: 'running', run };
    });
  }, [language, persist]);

  const onPromptFinished = useCallback(
    async (prompt: ContentPrompt, loopState: LoopState) => {
      promptsDoneRef.current += 1;
      const now = new Date();
      try {
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
      } catch (e) {
        // A bookkeeping failure may cost one prompt's stats, never the lesson.
        console.warn('progress write failed, continuing', e);
      }
      advance();
    },
    [advance],
  );

  const confirmLeave = useCallback(() => {
    Alert.alert('Leave the lesson?', 'Your place is saved — resume any time from Home.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'default', onPress: () => setScreen('home') },
    ]);
  }, [setScreen]);

  // ---- stages ----

  if (stage.kind === 'loading') {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={p.accent} />
      </View>
    );
  }

  if (stage.kind === 'course-done') {
    return (
      <View style={[styles.screen, styles.center, { padding: space.l }]}>
        <Text style={styles.h1}>Foundation complete.</Text>
        <Text style={styles.dim}>Builder packs are next on the roadmap.</Text>
        <BigButton label="Home" onPress={() => setScreen('home')} />
      </View>
    );
  }

  if (stage.kind === 'intro') {
    const { fresh, resume } = stage;
    const info = resume ?? fresh!;
    const promptCount = info.steps.filter((s) => s.kind === 'prompt').length;
    const minutes = Math.max(5, Math.round((promptCount * 40 + info.newItemIds.length * 15) / 60 / 5) * 5);
    return (
      <View style={[styles.screen, { padding: space.l, justifyContent: 'center' }]}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.introCard}>
          <Text style={styles.eyebrow}>{resume ? 'In progress' : 'Today'}</Text>
          <Text style={styles.h1}>Lesson {info.lessonRef}</Text>
          <Text style={styles.introMeta}>
            {info.newItemIds.length} new blocks · ~{minutes} min
            {info.recycledItemIds.length > 0 ? ` · ${info.recycledItemIds.length} coming back around` : ''}
          </Text>
          {resume ? (
            <>
              <BigButton
                label={`Resume — step ${resume.stepIndex + 1} of ${resume.steps.length}`}
                onPress={() => begin(resume, true)}
              />
              {fresh && (
                <BigButton
                  label="Start over"
                  kind="ghost"
                  onPress={async () => {
                    await deleteUnfinishedSession(resume.sessionId);
                    await clearSessionProgress(language);
                    begin(fresh, false);
                  }}
                />
              )}
            </>
          ) : (
            <BigButton label="Start" onPress={() => begin(fresh!, false)} />
          )}
          <BigButton label="Back" kind="quiet" onPress={() => setScreen('home')} />
        </Animated.View>
      </View>
    );
  }

  if (stage.kind === 'finished') {
    const { run } = stage;
    const newWords = run.newItemIds
      .map((id) => allItems(PACK).find((i) => i.id === id)?.target_text)
      .filter(Boolean)
      .join(' · ');
    return (
      <View style={[styles.screen, { padding: space.l, justifyContent: 'center' }]}>
        <OutroCard
          pack={PACK}
          lessonRef={run.lessonRef}
          newWords={newWords}
          promptsDone={promptsDoneRef.current}
          recycled={run.recycledItemIds.length}
          isLastLesson={run.isLastLesson}
          onHome={() => setScreen('home')}
          onKeepGoing={() => {
            autoStartRef.current = true;
            void load();
          }}
        />
      </View>
    );
  }

  const { run } = stage;
  const step = run.steps[run.stepIndex];
  const promptSteps = run.steps.filter((s) => s.kind === 'prompt').length;
  const promptsBefore = run.steps.slice(0, run.stepIndex).filter((s) => s.kind === 'prompt').length;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={confirmLeave} hitSlop={12} style={styles.close}>
          <SymbolView name="xmark" size={17} tintColor={p.dim} />
        </Pressable>
        <SessionProgress value={run.stepIndex / run.steps.length} />
        <Text style={styles.counter}>
          {promptsBefore}/{promptSteps}
        </Text>
      </View>

      {step.kind === 'announce' && (
        <AnnounceCard key={`a-${run.stepIndex}`} pack={PACK} line={step.line} onDone={advance} />
      )}
      {step.kind === 'teach' && <TeachCard key={step.item.id} item={step.item} lang={language} onDone={advance} />}
      {step.kind === 'prompt' && (
        <PromptCard
          key={`${step.prompt.id}:${run.stepIndex}`}
          prompt={step.prompt}
          pack={PACK}
          lang={language}
          isVictoryLap={step.isVictoryLap}
          isRecycle={step.isRecycle}
          thinkMs={settings.thinkSeconds * 1000}
          onFinished={onPromptFinished}
        />
      )}
    </View>
  );
}

// ---- the big state banner (owner: state must be readable at a glance) ----

function PhaseBanner({ label, tint }: { label: string; tint: string }) {
  const { p } = useTheme();
  return (
    <Animated.Text
      key={label}
      entering={FadeIn.duration(180)}
      style={{
        fontSize: 30,
        fontWeight: '900',
        letterSpacing: 0.4,
        color: tint || p.text,
        marginTop: space.s,
      }}
    >
      {label}
    </Animated.Text>
  );
}

// ---- step cards ----

function AnnounceCard({ pack, line, onDone }: { pack: CoursePack; line: string; onDone: () => void }) {
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const text = pack.system_lines[line]?.text ?? '';
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await voiceEngine.play({ key: pack.system_lines[line]?.audio });
      if (!cancelled) setTimeout(onDone, 350);
    })();
    return () => {
      cancelled = true;
      voiceEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line]);

  return (
    <View style={styles.stepArea}>
      <PhaseBanner label="Listen" tint={p.dim} />
      <Animated.View entering={FadeIn.duration(300)} style={[styles.stageCenter, styles.center]}>
        <TutorDots />
        <Text style={styles.announce}>{text}</Text>
      </Animated.View>
    </View>
  );
}

/** The "hear it … hear it again" beat between two target-language clips. */
const ECHO_GAP_MS = 900;
/** Natural beat at every other clip boundary (voice switch, narration). */
const SEGMENT_GAP_MS = 280;
/** Audio done → auto-Next, unless the learner acts first. */
const TEACH_AUTO_NEXT_MS = 1600;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function TeachCard({ item, lang, onDone }: { item: ContentItem; lang: InstalledLanguage; onDone: () => void }) {
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const [playKey, setPlayKey] = useState(0);
  const [speaking, setSpeaking] = useState(true);

  // Hear it (with deliberate echo beats), brief pause, then flow on —
  // Again restarts, Next jumps, doing nothing keeps the lesson moving.
  useEffect(() => {
    let cancelled = false;
    setSpeaking(true);
    (async () => {
      const segments = item.teach_segments?.length
        ? item.teach_segments
        : [{ text: item.teach_script, lang: 'en' as const }];
      for (const [i, seg] of segments.entries()) {
        if (cancelled) return;
        if (i > 0) {
          const echo = seg.lang === 'target' && segments[i - 1].lang === 'target';
          await sleep(echo ? ECHO_GAP_MS : SEGMENT_GAP_MS);
          if (cancelled) return;
        }
        await voiceEngine.play({ key: `${item.id}-t-${i}` });
      }
      if (cancelled) return;
      setSpeaking(false);
      await sleep(TEACH_AUTO_NEXT_MS);
      if (!cancelled) onDone();
    })();
    return () => {
      cancelled = true;
      voiceEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, playKey]);

  return (
    <View style={styles.stepArea}>
      <PhaseBanner label="New block" tint={p.accent} />
      <Animated.View entering={FadeInDown.duration(300)} style={[styles.stageCenter, styles.center]}>
        <Text style={styles.teachConcept}>{item.concept_en}</Text>
        <Text style={styles.teachTarget}>{item.target_text}</Text>
        {item.romanization ? <Text style={styles.dim}>{item.romanization}</Text> : null}
        <View style={{ height: space.l }} />
        {speaking ? <TutorDots /> : <View style={{ height: 28 }} />}
      </Animated.View>
      <Transport
        left={{ label: 'Again', onPress: () => setPlayKey((k) => k + 1) }}
        right={{ label: 'Next', onPress: onDone, primary: true }}
        styles={styles}
      />
    </View>
  );
}

/** The two big fixed buttons — same positions every step, tappable blind. */
function Transport({
  left,
  right,
  styles,
}: {
  left: { label: string; onPress: () => void } | null;
  right: { label: string; onPress: () => void; primary?: boolean };
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.controls}>
      {left ? (
        <BigButton label={left.label} kind="ghost" style={styles.control} onPress={left.onPress} />
      ) : (
        <View style={styles.control} />
      )}
      <BigButton label={right.label} kind={right.primary ? 'primary' : 'ghost'} style={styles.control} onPress={right.onPress} />
    </View>
  );
}

function PromptCard({
  prompt,
  pack,
  lang,
  isVictoryLap,
  isRecycle,
  thinkMs,
  onFinished,
}: {
  prompt: ContentPrompt;
  pack: CoursePack;
  lang: InstalledLanguage;
  isVictoryLap: boolean;
  isRecycle: boolean;
  thinkMs: number;
  onFinished: (prompt: ContentPrompt, state: LoopState) => void;
}) {
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const volume = useSharedValue(0);
  const [thinkKey, setThinkKey] = useState(0);

  const { state, heard, send, finishListening } = useVoiceLoop({
    prompt,
    lang,
    systemLines: pack.system_lines,
    recognizer,
    thinkMs,
    onVolume: (level) => {
      volume.value = withSpring(level, { damping: 16, stiffness: 260 });
    },
    onFinished: (s) => onFinished(prompt, s),
  });

  // State transitions you can feel: mic-open tap, result thud.
  const phase = state.phase;
  const feedbackKind = state.feedbackKind;
  useEffect(() => {
    if (phase === 'think') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (phase === 'listen') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [phase]);
  useEffect(() => {
    if (phase !== 'feedback' || !feedbackKind) return;
    if (feedbackKind === 'pass') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (feedbackKind === 'near') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
  }, [phase, feedbackKind]);

  const final = lastAttempt(state);
  const inFeedback = state.phase === 'feedback' || state.phase === 'done';

  // Hybrid pacing: after the result audio, passes/skips/exhausted-retries
  // flow on by themselves; a live Try-again decision holds; touching
  // Slower means "I'm studying this" and holds too.
  const heldRef = useRef(false);
  const audioIdle = state.phase === 'feedback' && state.pendingAudio.length === 0;
  useEffect(() => {
    if (!audioIdle || canRetry(state) || heldRef.current) return;
    const ms = state.feedbackKind === 'pass' ? 1800 : 2600;
    const t = setTimeout(() => send({ type: 'NEXT' }), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioIdle, state.feedbackKind, state.retriesUsed]);

  const banner: { label: string; tint: string } = (() => {
    switch (state.phase) {
      case 'play_cue':
        return { label: 'Listen', tint: p.dim };
      case 'think':
        return { label: 'Think it', tint: p.live };
      case 'listen':
        return { label: 'Say it', tint: p.accent };
      case 'feedback':
      case 'done': {
        const kind = state.feedbackKind ?? 'miss';
        const r = resultFor(p, kind);
        return { label: kind === 'pass' ? 'Yes' : kind === 'near' ? 'Almost' : kind === 'skip' ? 'Here it is' : 'Listen again', tint: r.tint };
      }
      default:
        return { label: ' ', tint: p.dim };
    }
  })();

  return (
    <View style={styles.stepArea}>
      <PhaseBanner label={banner.label} tint={banner.tint} />
      {isVictoryLap && (
        <Animated.Text entering={FadeIn} style={styles.lap}>
          victory lap
        </Animated.Text>
      )}
      {isRecycle && !isVictoryLap && <Text style={styles.recycleTag}>from earlier</Text>}

      <Text style={styles.cue}>{prompt.cue_en}</Text>

      <View style={styles.stageCenter}>
        {state.phase === 'play_cue' && (
          <Animated.View entering={FadeIn.duration(250)}>
            <TutorDots />
          </Animated.View>
        )}
        {(state.phase === 'think' || state.phase === 'listen') && (
          <Animated.View entering={FadeIn.duration(250)} style={styles.center}>
            <MicOrb
              mode={state.phase === 'think' ? 'think' : 'listen'}
              volume={volume}
              thinkMs={thinkMs}
              thinkKey={thinkKey}
              onPress={() => {
                if (state.phase === 'think') send({ type: 'TAP_TO_ANSWER' });
                else finishListening();
              }}
            />
            <Text style={styles.heardLive}>{state.phase === 'listen' ? heard || ' ' : ' '}</Text>
          </Animated.View>
        )}
        {inFeedback && state.feedbackKind && (
          <FeedbackSheet
            kind={state.feedbackKind}
            answer={final?.evaluation.bestVariant ?? prompt.expected[0]}
            transcript={final?.transcript ?? ''}
            decompose={prompt.decompose_script}
            lang={lang}
            retrying={canRetry(state)}
          />
        )}
      </View>

      {!inFeedback ? (
        <Transport
          left={{
            label: 'Repeat',
            onPress: () => {
              setThinkKey((k) => k + 1);
              send({ type: 'REPEAT' });
            },
          }}
          right={{ label: 'Skip', onPress: () => send({ type: 'SKIP' }) }}
          styles={styles}
        />
      ) : (
        <Transport
          left={
            canRetry(state)
              ? { label: 'Try again', onPress: () => send({ type: 'TRY_AGAIN' }) }
              : {
                  label: 'Slower',
                  onPress: () => {
                    heldRef.current = true; // studying — stop the auto-flow
                    send({ type: 'SLOWER' });
                  },
                }
          }
          right={{ label: 'Next', onPress: () => send({ type: 'NEXT' }), primary: true }}
          styles={styles}
        />
      )}
    </View>
  );
}

function OutroCard({
  pack,
  lessonRef,
  newWords,
  promptsDone,
  recycled,
  isLastLesson,
  onHome,
  onKeepGoing,
}: {
  pack: CoursePack;
  lessonRef: string;
  newWords: string;
  promptsDone: number;
  recycled: number;
  isLastLesson: boolean;
  onKeepGoing: () => void;
  onHome: () => void;
}) {
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  useEffect(() => {
    void voiceEngine.play({ key: pack.system_lines.session_close?.audio });
    return () => voiceEngine.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View entering={FadeInDown.duration(350)} style={styles.introCard}>
      <SymbolView name="checkmark.seal.fill" size={44} tintColor={p.accent} />
      <Text style={[styles.h1, { marginTop: space.m }]}>That's the day.</Text>
      <Text style={styles.introMeta}>
        Lesson {lessonRef} · {promptsDone} prompts{recycled > 0 ? ` · ${recycled} recycled` : ''}
      </Text>
      {newWords.length > 0 && <Text style={styles.newWords}>{newWords}</Text>}
      {!isLastLesson && <BigButton label="Keep going" onPress={onKeepGoing} />}
      <BigButton label="Home" kind="ghost" onPress={onHome} />
    </Animated.View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.m,
      paddingTop: 64,
      paddingHorizontal: space.l,
      paddingBottom: space.m,
    },
    close: { padding: 4 },
    counter: { color: p.faint, fontSize: type.caption, fontVariant: ['tabular-nums'] },

    stepArea: { flex: 1, paddingHorizontal: space.l, paddingBottom: space.xl },
    stageCenter: { flex: 1, justifyContent: 'center' },

    h1: { color: p.text, fontSize: type.giant, fontWeight: '800' },
    dim: { color: p.dim, fontSize: type.body },
    eyebrow: { color: p.faint, fontSize: type.caption, letterSpacing: 1.6, textTransform: 'uppercase' },

    introCard: {
      backgroundColor: p.card,
      borderRadius: radii.xl,
      padding: space.xl,
      gap: space.s,
      alignItems: 'flex-start',
    },
    introMeta: { color: p.dim, fontSize: type.body, marginBottom: space.m },
    newWords: { color: p.accent, fontSize: type.heading, fontWeight: '700', marginBottom: space.m },

    announce: { color: p.dim, fontSize: type.heading, textAlign: 'center', marginTop: space.l },

    teachConcept: { color: p.dim, fontSize: type.heading },
    teachTarget: { color: p.text, fontSize: type.hero, fontWeight: '800', marginVertical: space.s },

    cue: { color: p.text, fontSize: type.heading, lineHeight: 29, marginTop: space.m },
    heardLive: { color: p.live, fontSize: type.body, fontWeight: '600', minHeight: 24, marginTop: space.m, textAlign: 'center' },

    lap: {
      color: p.accent,
      fontSize: type.caption,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      marginTop: space.s,
    },
    recycleTag: { color: p.faint, fontSize: type.caption, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: space.s },

    controls: { flexDirection: 'row', gap: space.s },
    control: { flex: 1 },
  });
