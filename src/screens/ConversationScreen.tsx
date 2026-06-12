import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { BigButton } from '../components/BigButton';
import { MicOrb } from '../components/MicOrb';
import { TutorDots } from '../components/TutorDots';
import { LANGUAGE_NAMES } from '../packs';
import { useApp } from '../store';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { sttLocaleFor } from '../db';
import { recognizer, voiceEngine } from '../services/instances';
import { debrief, partnerReply, SCENARIOS, type Mood, type Scenario } from '../services/conversation';
import type { ChatTurn } from '../services/teacher';
import { ttsToFile } from '../services/tts';
import { getAnthropicKey, getOpenAIKey } from '../services/keys';
import { stripMarks } from '../lib/teacher-markup';
import { buildWhitelist, digestProgress, markPracticeSession } from '../services/progress';

/** A conversation with this many learner turns marks the day done. */
const DAY_MARK_LEARNER_TURNS = 6;

/**
 * Conversation mode (S1): fully spoken, back and forth — the one place
 * voice-to-voice lives. Partner speaks, the mic opens itself, you answer,
 * it recasts and keeps going. End any time for the spoken debrief.
 *
 * PACING CONTRACT (owner, round 8): the partner NEVER jumps the gun.
 * Nothing may end the listening window before the hard floor — recognizer
 * hiccups and empty results before it just reopen the mic invisibly. True
 * silence needs TWO full patience windows before the partner is told.
 * Once real speech starts, the natural end-of-thought finalize applies.
 */

/** Hard floor: no finalization of any kind before this (owner-specified). */
const MIN_LISTEN_MS = 5_000;
/** One patience window of true no-speech before a silent attempt counts. */
const NO_SPEECH_WINDOW_MS = 12_000;
/** Quietly reopen after the first silent window; report only after the second. */
const MAX_SILENT_ATTEMPTS = 2;
/** After real speech: end-of-thought finalize (unchanged — this felt right). */
const SILENCE_AFTER_SPEECH_MS = 2_400;
/** Absolute per-attempt cap, speech included. */
const LISTEN_CAP_MS = 25_000;
/** Grace beat between partner audio ending and the mic opening. */
const MIC_GRACE_MS = 350;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Phase =
  | { kind: 'pick' }
  | { kind: 'no_key' }
  | { kind: 'partner_thinking' }
  | { kind: 'partner_speaking' }
  | { kind: 'listening' }
  | { kind: 'paused'; notice: string }
  | { kind: 'debrief'; text: string | null };

export function ConversationScreen() {
  const { setScreen, language, settings } = useApp();
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [phase, setPhase] = useState<Phase>({ kind: 'pick' });
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [mood, setMood] = useState<Mood>('gentle');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [heard, setHeard] = useState('');
  const volume = useSharedValue(0);
  const aliveRef = useRef(true);
  const turnsRef = useRef<ChatTurn[]>([]);
  turnsRef.current = turns;
  const whitelistRef = useRef<string[]>([]);
  const startedAtRef = useRef(new Date().toISOString());
  // Cancels stale listen attempts/turns when a new one starts or the
  // conversation ends; bump to invalidate everything in flight.
  const listenTokenRef = useRef(0);
  const userEndedTurnRef = useRef(false);
  const conversationOverRef = useRef(false);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      recognizer.abort();
      voiceEngine.stop();
    };
  }, []);

  const partnerTurn = useCallback(
    async (history: ChatTurn[]) => {
      if (!aliveRef.current || conversationOverRef.current) return;
      setPhase({ kind: 'partner_thinking' });
      const result = await partnerReply(language, scenario, mood, history, settings.monthlyCapUsd, whitelistRef.current);
      if (!aliveRef.current) return;
      if (result.kind === 'no_key') {
        setPhase({ kind: 'no_key' });
        return;
      }
      if (result.kind === 'capped') {
        setPhase({ kind: 'paused', notice: `Soft cap reached — raise it in Settings to keep talking.` });
        return;
      }
      if (result.kind === 'error') {
        setPhase({ kind: 'paused', notice: `Connection hiccup (${result.message}). Tap to retry.` });
        return;
      }
      const next: ChatTurn[] = [...history, { role: 'teacher', text: result.text }];
      setTurns(next);
      setPhase({ kind: 'partner_speaking' });
      // Partner speech is wholly target-language; the voice stays locked to it.
      const uri = await ttsToFile(stripMarks(result.text), language);
      if (!aliveRef.current || conversationOverRef.current) return;
      if (uri) await voiceEngine.play({ uri });
      if (!aliveRef.current || conversationOverRef.current) return;
      openMic(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, scenario, mood, settings.monthlyCapUsd],
  );

  const openMic = useCallback(
    async (history: ChatTurn[]) => {
      if (!aliveRef.current || conversationOverRef.current) return;
      const token = ++listenTokenRef.current;
      const live = () => aliveRef.current && !conversationOverRef.current && token === listenTokenRef.current;
      userEndedTurnRef.current = false;
      setHeard('');
      setPhase({ kind: 'listening' });
      await sleep(MIC_GRACE_MS); // let the partner's audio tail die first
      if (!live()) return;
      voiceEngine.tone('open');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      let silentAttempts = 0;

      const finishTurn = (text: string) => {
        if (!live()) return;
        listenTokenRef.current++; // invalidate anything still in flight
        voiceEngine.tone('close');
        const next: ChatTurn[] = [...history, { role: 'learner', text }];
        setTurns(next);
        setHeard('');
        void partnerTurn(next);
      };

      // One recognition attempt; restarts itself for hiccups and patience
      // windows. The learner never sees the restarts — just a mic that waits.
      const attempt = async (): Promise<void> => {
        if (!live()) return;
        const openedAt = Date.now();
        let spokeAt: number | null = null;
        let settled = false;

        const watchdog = setInterval(() => {
          if (settled || !live()) {
            clearInterval(watchdog);
            return;
          }
          const now = Date.now();
          // End-of-thought after real speech — but never inside the floor.
          if (spokeAt !== null && now - spokeAt >= SILENCE_AFTER_SPEECH_MS && now - openedAt >= MIN_LISTEN_MS) {
            clearInterval(watchdog);
            recognizer.stop();
            return;
          }
          // A full patience window with no speech, or the absolute cap.
          if ((spokeAt === null && now - openedAt >= NO_SPEECH_WINDOW_MS) || now - openedAt >= LISTEN_CAP_MS) {
            clearInterval(watchdog);
            recognizer.stop();
          }
        }, 250);

        const noSpeech = () => {
          if (settled) return;
          settled = true;
          clearInterval(watchdog);
          if (!live()) return;
          if (userEndedTurnRef.current) {
            // The learner tapped "done" without speaking — a deliberate pass.
            finishTurn('(the learner stayed silent)');
            return;
          }
          if (Date.now() - openedAt < MIN_LISTEN_MS) {
            // Recognizer hiccup inside the floor — doesn't count, keep listening.
            void attempt();
            return;
          }
          silentAttempts += 1;
          if (silentAttempts >= MAX_SILENT_ATTEMPTS) {
            finishTurn('(the learner stayed silent)');
          } else {
            void attempt(); // stay patient: reopen quietly and wait again
          }
        };

        await recognizer.start(
          { locale: sttLocaleFor(language), preferOnDevice: true, continuous: true, recordAudio: false },
          {
            onVolume: (level) => {
              volume.value = withSpring(level, { damping: 16, stiffness: 260 });
            },
            onPartial: (t) => {
              if (t.trim().length >= 2) spokeAt = Date.now(); // ignore one-char noise
              setHeard(t);
            },
            onFinal: (t) => {
              if (settled) return;
              const text = t.trim();
              if (text.length > 0) {
                settled = true;
                clearInterval(watchdog);
                finishTurn(text);
              } else {
                noSpeech();
              }
            },
            onEnd: noSpeech,
            onError: () => {
              if (settled) return;
              settled = true;
              clearInterval(watchdog);
              if (!live()) return;
              if (Date.now() - openedAt < MIN_LISTEN_MS) {
                void attempt(); // transient failure inside the floor — retry quietly
              } else {
                setPhase({ kind: 'paused', notice: 'The mic hiccuped. Tap to continue.' });
              }
            },
          },
        );
      };

      void attempt();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, partnerTurn],
  );

  const begin = useCallback(async () => {
    const key = (await getAnthropicKey()) ?? (await getOpenAIKey());
    if (!key) {
      setPhase({ kind: 'no_key' });
      return;
    }
    Haptics.selectionAsync();
    await recognizer.requestPermissions();
    // The S1 whitelist: the partner stays inside what you actually own.
    whitelistRef.current = await buildWhitelist(language);
    startedAtRef.current = new Date().toISOString();
    conversationOverRef.current = false;
    setTurns([]);
    void partnerTurn([]);
  }, [partnerTurn, language]);

  const endConversation = useCallback(async () => {
    conversationOverRef.current = true;
    listenTokenRef.current++; // kill any in-flight listen attempts
    recognizer.abort();
    voiceEngine.stop();
    setPhase({ kind: 'debrief', text: null });
    // Bank the progress and (if substantial) mark the day — best-effort.
    const learnerTurns = turnsRef.current.filter((t) => t.role === 'learner').length;
    void digestProgress(language, turnsRef.current);
    if (learnerTurns >= DAY_MARK_LEARNER_TURNS) {
      void markPracticeSession(language, learnerTurns, startedAtRef.current);
    }
    const result = await debrief(language, turnsRef.current, settings.monthlyCapUsd);
    if (!aliveRef.current) return;
    const text = result.kind === 'ok' ? result.text : 'No debrief this time — but you just held a conversation. That counts.';
    // Debrief is English narration — displayed, never spoken (owner rule).
    setPhase({ kind: 'debrief', text: stripMarks(text) });
  }, [language, settings.monthlyCapUsd]);

  const lastPartnerLine = [...turns].reverse().find((t) => t.role === 'teacher')?.text ?? '';
  const learnerTurnCount = turns.filter((t) => t.role === 'learner').length;

  // ---- screens per phase ----

  if (phase.kind === 'pick') {
    return (
      <View style={[styles.screen, { padding: space.l }]}>
        <Pressable onPress={() => setScreen('home')} hitSlop={12} style={{ marginTop: 48 }}>
          <SymbolView name="xmark" size={17} tintColor={p.dim} />
        </Pressable>
        <Text style={styles.h1}>Have a conversation</Text>
        <Text style={styles.dimBody}>
          All voice, both ways. It speaks {LANGUAGE_NAMES[language]}, listens, and corrects by naturally rephrasing —
          no interruptions. End whenever you like for a debrief.
        </Text>

        <Text style={styles.section}>scenario</Text>
        {SCENARIOS.map((s) => (
          <Pressable
            key={s.id}
            style={[styles.option, scenario.id === s.id && styles.optionActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setScenario(s);
            }}
          >
            <Text style={[styles.optionTitle, scenario.id === s.id && { color: p.accent }]}>{s.title}</Text>
            <Text style={styles.optionGoal}>{s.goal}</Text>
          </Pressable>
        ))}

        <Text style={styles.section}>mood</Text>
        <View style={styles.moodRow}>
          {(['gentle', 'normal'] as Mood[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.mood, mood === m && styles.optionActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setMood(m);
              }}
            >
              <Text style={[styles.optionTitle, mood === m && { color: p.accent }]}>
                {m === 'gentle' ? 'Gentle' : 'Normal'}
              </Text>
              <Text style={styles.optionGoal}>{m === 'gentle' ? 'partner leads, short answers fine' : 'fuller sentences expected'}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1 }} />
        <BigButton label="Start talking" onPress={begin} />
      </View>
    );
  }

  if (phase.kind === 'no_key') {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: space.l }]}>
        <Text style={styles.h1}>One key to turn</Text>
        <Text style={styles.dimBody}>Conversation mode needs a key — paste your Anthropic (or OpenAI) key in Settings first.</Text>
        <BigButton label="Open Settings" onPress={() => setScreen('settings')} />
        <BigButton label="Back" kind="quiet" onPress={() => setScreen('home')} />
      </View>
    );
  }

  if (phase.kind === 'debrief') {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: space.l }]}>
        <SymbolView name="checkmark.seal.fill" size={44} tintColor={p.accent} />
        <Text style={[styles.h1, { marginTop: space.m }]}>
          {learnerTurnCount > 0 ? `${learnerTurnCount} turns. Yours.` : 'Conversation over.'}
        </Text>
        {phase.text === null ? (
          <TutorDots />
        ) : (
          <ScrollView style={{ maxHeight: 320 }}>
            <Text style={styles.debriefText}>{phase.text}</Text>
          </ScrollView>
        )}
        <View style={{ height: space.l }} />
        <BigButton label="Again" kind="ghost" onPress={() => setPhase({ kind: 'pick' })} />
        <BigButton label="Home" onPress={() => setScreen('home')} />
      </View>
    );
  }

  // live phases
  return (
    <View style={[styles.screen, { padding: space.l }]}>
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>{scenario.title}</Text>
        <Text style={styles.turnCount}>{learnerTurnCount} turns</Text>
      </View>

      <View style={styles.stage}>
        {lastPartnerLine ? (
          <Animated.Text key={lastPartnerLine} entering={FadeIn.duration(250)} style={styles.partnerLine}>
            {stripMarks(lastPartnerLine)}
          </Animated.Text>
        ) : null}

        {phase.kind === 'partner_thinking' && <TutorDots />}
        {phase.kind === 'partner_speaking' && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.center}>
            <TutorDots />
            <Text style={styles.stateHint}>listening to them…</Text>
          </Animated.View>
        )}
        {phase.kind === 'listening' && (
          <Animated.View entering={FadeIn.duration(200)} style={styles.center}>
            <MicOrb
              mode="listen"
              volume={volume}
              thinkMs={0}
              thinkKey={0}
              onPress={() => {
                userEndedTurnRef.current = true; // deliberate end — bypasses the patience windows
                recognizer.stop();
              }}
            />
            <Text style={styles.heard}>{heard || ' '}</Text>
          </Animated.View>
        )}
        {phase.kind === 'paused' && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.center}>
            <Text style={styles.notice}>{phase.notice}</Text>
            <BigButton label="Continue" kind="ghost" onPress={() => void partnerTurn(turnsRef.current)} />
          </Animated.View>
        )}
      </View>

      <BigButton label="End conversation" kind="ghost" onPress={endConversation} />
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg },
    center: { alignItems: 'center' },
    h1: { color: p.text, fontSize: type.giant, fontWeight: '800', marginTop: space.m, marginBottom: space.s },
    dimBody: { color: p.dim, fontSize: type.body, lineHeight: 23, marginBottom: space.m },
    section: {
      color: p.faint,
      fontSize: type.caption,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      marginTop: space.m,
      marginBottom: space.s,
    },
    option: { backgroundColor: p.card, borderRadius: radii.m, padding: space.m, marginBottom: space.s },
    optionActive: { borderWidth: 1.5, borderColor: p.accent },
    optionTitle: { color: p.text, fontSize: type.body, fontWeight: '700' },
    optionGoal: { color: p.faint, fontSize: type.caption, marginTop: 2 },
    moodRow: { flexDirection: 'row', gap: space.s },
    mood: { flex: 1, backgroundColor: p.card, borderRadius: radii.m, padding: space.m },

    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 48 },
    topTitle: { color: p.text, fontSize: type.body, fontWeight: '700' },
    turnCount: { color: p.faint, fontSize: type.caption, fontVariant: ['tabular-nums'] },

    stage: { flex: 1, justifyContent: 'center', gap: space.l },
    partnerLine: { color: p.text, fontSize: type.heading, lineHeight: 30, textAlign: 'center' },
    stateHint: { color: p.faint, fontSize: type.caption, marginTop: space.s },
    heard: { color: p.live, fontSize: type.body, fontWeight: '600', minHeight: 24, textAlign: 'center', marginTop: space.s },
    notice: { color: p.warn, fontSize: type.body, textAlign: 'center', marginBottom: space.s },

    debriefText: { color: p.dim, fontSize: type.body, lineHeight: 24 },
  });
