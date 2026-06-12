import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { BigButton } from '../components/BigButton';
import { TutorDots } from '../components/TutorDots';
import { LANGUAGE_NAMES } from '../packs';
import { useApp } from '../store';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { formatUsd } from '../lib/cost/meter';
import { getSetting, setSetting, sttLocaleFor, openDb } from '../db';
import { recognizer, voiceEngine } from '../services/instances';
import { teacherReply, monthSpendUsd, type ChatTurn } from '../services/teacher';
import { ttsToFile } from '../services/tts';
import { getAnthropicKey, getOpenAIKey } from '../services/keys';
import { parseMarked, spanParts, targetOnly, teacherLines } from '../lib/teacher-markup';
import { digestProgress, markPracticeSession } from '../services/progress';

/** Digest the transcript window every N learner turns (and on exit/restart). */
const DIGEST_EVERY_LEARNER_TURNS = 8;
/** A sitting with this many answers marks the day done. */
const DAY_MARK_LEARNER_TURNS = 10;

// Mic pacing (mirrors conversation mode): the recognizer gives up early and
// reports empty finals — those are OUR problem, never the learner's.
/** Recognizer hiccups inside this window restart invisibly. */
const MIN_LISTEN_MS = 5000;
/** Speech followed by this much stillness = the answer is finished. */
const SILENCE_AFTER_SPEECH_MS = 2600;
/** Tap + total silence for this long → close the mic quietly. */
const NO_SPEECH_WINDOW_MS = 12000;
/** No recognizer events at all for this long = dead mic; restart it. */
const DEAD_MIC_MS = 4000;
const MAX_DEAD_RESTARTS = 3;

/**
 * The lesson IS a conversation (owner pivot): the teacher writes, you can
 * hear any line on demand, and you answer by voice (or keyboard). Full
 * voice-to-voice is conversation mode's job, later.
 */

type Status = 'checking' | 'no_key' | 'ready';

export function TeacherScreen() {
  const { setScreen, language, settings } = useApp();
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [status, setStatus] = useState<Status>('checking');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const turnsRef = useRef<ChatTurn[]>([]);
  turnsRef.current = turns;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [spendLabel, setSpendLabel] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const listenTokenRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userStopRef = useRef(false);
  const playSeqRef = useRef(0);
  const storageKey = `teacher_chat.${language}`;
  const digestedUpToRef = useRef(0);
  const sittingStartRef = useRef(new Date().toISOString());
  const sittingTurnsRef = useRef(0);

  /** Best-effort, non-blocking: progress bookkeeping never touches the lesson. */
  const runDigest = useCallback(
    (allTurns: ChatTurn[]) => {
      const window = allTurns.slice(digestedUpToRef.current);
      if (window.filter((t) => t.role === 'learner').length === 0) return;
      digestedUpToRef.current = allTurns.length;
      void setSetting(`${storageKey}.digested`, String(digestedUpToRef.current));
      void digestProgress(language, window);
    },
    [language, storageKey],
  );

  const persist = useCallback(
    (next: ChatTurn[]) => {
      void setSetting(storageKey, JSON.stringify(next));
    },
    [storageKey],
  );

  const refreshSpend = useCallback(async () => {
    setSpendLabel(formatUsd(await monthSpendUsd()));
  }, []);

  const askTeacher = useCallback(
    async (history: ChatTurn[]) => {
      setBusy(true);
      setNotice(null);
      const result = await teacherReply(language, history, settings.monthlyCapUsd);
      setBusy(false);
      if (result.kind === 'ok') {
        const next: ChatTurn[] = [...history, { role: 'teacher', text: result.text }];
        setTurns(next);
        persist(next);
        void refreshSpend();
      } else if (result.kind === 'capped') {
        setNotice(`Monthly soft cap reached (${formatUsd(result.capUsd)}). Raise it in Settings to continue.`);
      } else if (result.kind === 'no_key') {
        setStatus('no_key');
      } else {
        setNotice(`The teacher didn't answer (${result.message}). Tap retry.`);
      }
    },
    [language, settings.monthlyCapUsd, persist, refreshSpend],
  );

  // Boot: key check, restore transcript, open the lesson if fresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await openDb();
      const key = (await getAnthropicKey()) ?? (await getOpenAIKey());
      if (cancelled) return;
      if (!key) {
        setStatus('no_key');
        return;
      }
      setStatus('ready');
      void refreshSpend();
      const saved = await getSetting(storageKey, '');
      if (cancelled) return;
      let history: ChatTurn[] = [];
      if (saved) {
        try {
          history = JSON.parse(saved) as ChatTurn[];
        } catch {
          history = [];
        }
      }
      setTurns(history);
      const digested = parseInt(await getSetting(`${storageKey}.digested`, '0'), 10);
      digestedUpToRef.current = Number.isFinite(digested) ? Math.min(digested, history.length) : 0;
      sittingStartRef.current = new Date().toISOString();
      sittingTurnsRef.current = 0;
      if (history.length === 0) {
        void askTeacher([]);
      }
    })();
    return () => {
      cancelled = true;
      listenTokenRef.current += 1;
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      recognizer.abort();
      voiceEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Leaving mid-conversation still banks the progress.
  useEffect(() => {
    return () => {
      const all = turnsRef.current;
      const window = all.slice(digestedUpToRef.current);
      if (window.some((t) => t.role === 'learner')) {
        void digestProgress(language, window);
        void setSetting(`${storageKey}.digested`, String(all.length));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [turns.length, busy]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    Haptics.selectionAsync();
    stopListening();
    setInput('');
    const next: ChatTurn[] = [...turns, { role: 'learner', text }];
    setTurns(next);
    persist(next);

    // Progress bookkeeping (all best-effort, never blocking the lesson):
    sittingTurnsRef.current += 1;
    if (sittingTurnsRef.current === DAY_MARK_LEARNER_TURNS) {
      void markPracticeSession(language, sittingTurnsRef.current, sittingStartRef.current);
    }
    const undigestedLearnerTurns = next.slice(digestedUpToRef.current).filter((t) => t.role === 'learner').length;
    if (undigestedLearnerTurns >= DIGEST_EVERY_LEARNER_TURNS) {
      runDigest(next);
    }

    void askTeacher(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, busy, turns, persist, askTeacher, language, runDigest]);

  // ---- voice input: listen first, transcript lands in the editable field ----

  const stopListening = useCallback(() => {
    listenTokenRef.current += 1; // invalidate every in-flight callback
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    recognizer.abort();
    setListening(false);
  }, []);

  const toggleMic = useCallback(async () => {
    if (listening) {
      userStopRef.current = true;
      recognizer.stop(); // deliberate finish: finalize what was said
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    voiceEngine.stop(); // never listen while the teacher is speaking
    setPlayingKey(null);
    setListening(true);
    voiceEngine.tone('open');

    const token = ++listenTokenRef.current;
    userStopRef.current = false;
    const openedAt = Date.now();
    let spoke = false;
    let best = '';
    let lastChangeAt = Date.now();
    let lastEventAt = Date.now();
    let deadRestarts = 0;

    // Bias recognition toward what the teacher has actually taught — short
    // words ("teh") get swallowed without hints. Safe here: the LLM judges
    // the answer either way; the no-hints ban belongs to the graded deck.
    const hintWords = new Set<string>();
    for (const t of turnsRef.current) {
      if (t.role !== 'teacher') continue;
      for (const w of targetOnly(t.text).split(/[^\p{L}\p{M}'’-]+/u)) {
        if (w) hintWords.add(w.toLowerCase());
      }
    }
    const hints = [...hintWords].slice(-60); // newest teachings last — keep those

    const closeMic = () => {
      if (token !== listenTokenRef.current) return;
      stopListening();
      voiceEngine.tone('close');
    };

    const attempt = async () => {
      if (token !== listenTokenRef.current) return;
      recognizer.abort();
      await new Promise((r) => setTimeout(r, 120)); // let the session settle
      if (token !== listenTokenRef.current) return;
      lastEventAt = Date.now();
      await recognizer.start(
        {
          locale: sttLocaleFor(language),
          preferOnDevice: true,
          continuous: true,
          recordAudio: false,
          contextualStrings: hints,
        },
        {
          onVolume: () => {
            lastEventAt = Date.now();
          },
          onSpeechStart: () => {
            spoke = true;
            lastChangeAt = Date.now();
          },
          onPartial: (t) => {
            if (token !== listenTokenRef.current) return;
            lastEventAt = Date.now();
            if (t.trim()) {
              spoke = true;
              best = t;
              lastChangeAt = Date.now();
              setInput(t);
            }
          },
          onFinal: (t) => {
            if (token !== listenTokenRef.current) return;
            const text = (t.trim() || best).trim();
            if (text) {
              setInput(text);
              closeMic();
            } else {
              retryOrClose(); // empty final = recognizer gave up, not the learner
            }
          },
          onEnd: () => {
            if (token === listenTokenRef.current) retryOrClose();
          },
          onError: () => {
            if (token === listenTokenRef.current) retryOrClose();
          },
        },
      );
    };

    const retryOrClose = () => {
      if (token !== listenTokenRef.current) return;
      if (userStopRef.current) {
        if (best) setInput(best);
        closeMic();
        return;
      }
      const elapsed = Date.now() - openedAt;
      if (elapsed < MIN_LISTEN_MS || (!spoke && elapsed < NO_SPEECH_WINDOW_MS)) {
        void attempt(); // invisible restart — the learner never sees the hiccup
        return;
      }
      if (best) setInput(best);
      closeMic();
    };

    watchdogRef.current = setInterval(() => {
      if (token !== listenTokenRef.current) return;
      const now = Date.now();
      if (spoke && best && now - lastChangeAt > SILENCE_AFTER_SPEECH_MS) {
        recognizer.stop(); // finished speaking → final lands via onFinal
        return;
      }
      if (!spoke && now - openedAt >= NO_SPEECH_WINDOW_MS) {
        closeMic(); // tapped but said nothing — close without fuss
        return;
      }
      if (now - lastEventAt > DEAD_MIC_MS) {
        if (userStopRef.current || deadRestarts >= MAX_DEAD_RESTARTS) {
          closeMic();
          if (!userStopRef.current) setNotice("The mic wouldn't start — tap it and try again.");
          return;
        }
        deadRestarts += 1;
        lastEventAt = Date.now();
        void attempt();
      }
    }, 400);

    void attempt();
  }, [listening, language, stopListening]);

  // ---- per-card audio (runtime TTS, disk-cached; silence > robot voice) ----

  const playSpan = useCallback(
    async (key: string, text: string) => {
      Haptics.selectionAsync();
      if (playingKey === key) {
        playSeqRef.current += 1;
        voiceEngine.stop();
        setPlayingKey(null);
        return;
      }
      stopListening();
      voiceEngine.stop();
      // Owner rules: never speak English; each card plays ONLY its own
      // «span» (not the whole turn), at teaching pace — a breath between
      // words. Native speed lives in conversation mode.
      const speakable = text.trim();
      if (!speakable) return;
      const seq = ++playSeqRef.current;
      setPlayingKey(key);
      const uri = await ttsToFile(speakable, language, 'teaching');
      if (seq !== playSeqRef.current) return; // another card was tapped meanwhile
      if (!uri) {
        setPlayingKey(null);
        setNotice('Audio unavailable right now — the text has everything.');
        return;
      }
      await voiceEngine.play({ uri });
      setPlayingKey((cur) => (cur === key ? null : cur));
      void refreshSpend();
    },
    [playingKey, stopListening, refreshSpend, language],
  );

  const restart = useCallback(() => {
    Alert.alert('Start a fresh lesson?', 'The current conversation will be cleared.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Restart',
        style: 'destructive',
        onPress: () => {
          runDigest(turnsRef.current); // bank what this lesson earned first
          digestedUpToRef.current = 0;
          void setSetting(`${storageKey}.digested`, '0');
          setTurns([]);
          persist([]);
          void askTeacher([]);
        },
      },
    ]);
  }, [persist, askTeacher]);

  if (status === 'no_key') {
    return (
      <View style={[styles.screen, { justifyContent: 'center', padding: space.l }]}>
        <Text style={styles.h1}>One key to turn</Text>
        <Text style={styles.dimBody}>
          The live teacher needs a brain: paste your Anthropic key in Settings (or OpenAI as fallback). Keys live in
          the device keychain only.
        </Text>
        <BigButton label="Open Settings" onPress={() => setScreen('settings')} />
        <BigButton label="Back" kind="quiet" onPress={() => setScreen('home')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topBar}>
        <Pressable onPress={() => setScreen('home')} hitSlop={12}>
          <SymbolView name="xmark" size={17} tintColor={p.dim} />
        </Pressable>
        <Text style={styles.topTitle}>{LANGUAGE_NAMES[language]}</Text>
        <View style={styles.topRight}>
          <Text style={styles.spend}>{spendLabel}</Text>
          <Pressable onPress={restart} hitSlop={12}>
            <SymbolView name="arrow.counterclockwise" size={16} tintColor={p.faint} />
          </Pressable>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.chat} contentContainerStyle={styles.chatContent}>
        {turns.map((turn, idx) =>
          turn.role === 'teacher' ? (
            // English narration sits flat on the background (the learner
            // reads English perfectly); only the target language gets a
            // box — the focal content, with the play control living on it.
            <Animated.View key={idx} entering={FadeInDown.duration(200)} style={styles.teacherTurn}>
              {teacherLines(turn.text).flatMap((line, li) => {
                // The line's role sets the narration style (owner typography
                // spec): verdicts semibold + result-colored, the "now say"
                // cue clearly second to the taught text, the rest ambient.
                const narration =
                  line.kind === 'verdict'
                    ? [
                        styles.verdictText,
                        { color: line.grade === 'good' ? p.accent : line.grade === 'close' ? p.warn : p.miss },
                      ]
                    : line.kind === 'cue'
                      ? styles.cueText
                      : styles.ambient;
                // Punctuation-only leftovers between «marks» ("." after a
                // wrapped word) render as orphan dots — drop them, and strip
                // stray leading punctuation off the narration that follows
                // a card ("». So" → "So").
                const segments = parseMarked(line.text)
                  .map((seg) =>
                    seg.target ? seg : { ...seg, text: seg.text.trim().replace(/^[.,;:]+\s*/, '') },
                  )
                  .filter((seg) => seg.target || (seg.text && !/^[\s\p{P}]*$/u.test(seg.text)));
                return segments.map((seg, si) => {
                  if (!seg.target) {
                    return (
                      <Text key={`${li}:${si}`} style={narration}>
                        {seg.text}
                      </Text>
                    );
                  }
                  // Every card speaks for itself: its button plays exactly
                  // the words on the card, never the whole turn. Dual-script
                  // spans (zh/ja «script|romanization») show the romanization
                  // and speak the script.
                  const parts = spanParts(seg.text);
                  const key = `${idx}:${li}:${si}`;
                  return (
                    <View key={`${li}:${si}`} style={styles.targetCard}>
                      <Text style={styles.targetText}>{parts.show}</Text>
                      <Pressable style={styles.playBtn} onPress={() => playSpan(key, parts.speak)} hitSlop={10}>
                        {playingKey === key ? (
                          <ActivityIndicator size="small" color={p.accent} />
                        ) : (
                          <SymbolView name="play.circle.fill" size={30} tintColor={p.accent} />
                        )}
                      </Pressable>
                    </View>
                  );
                });
              })}
            </Animated.View>
          ) : (
            <Animated.View key={idx} entering={FadeInDown.duration(200)} style={styles.learnerRow}>
              <View style={styles.learnerBubble}>
                <Text style={styles.learnerText}>{turn.text}</Text>
              </View>
            </Animated.View>
          ),
        )}
        {busy && (
          <View style={[styles.targetCard, { borderColor: 'transparent' }]}>
            <TutorDots />
          </View>
        )}
        {notice && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
            {!busy && turns.length > 0 && turns[turns.length - 1].role === 'learner' && (
              <BigButton label="Retry" kind="ghost" small onPress={() => void askTeacher(turns)} />
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        <Pressable
          onPress={toggleMic}
          style={[styles.micBtn, listening && { backgroundColor: p.accent, borderColor: p.accent }]}
          hitSlop={8}
        >
          <SymbolView name={listening ? 'waveform' : 'mic.fill'} size={22} tintColor={listening ? p.onAccent : p.accent} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={listening ? 'listening…' : 'speak or type your answer'}
          placeholderTextColor={p.faint}
          multiline
          editable={!busy}
        />
        <Pressable
          onPress={send}
          style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.35 }]}
          disabled={!input.trim() || busy}
          hitSlop={8}
        >
          <SymbolView name="arrow.up.circle.fill" size={32} tintColor={p.accent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 64,
      paddingHorizontal: space.l,
      paddingBottom: space.s,
    },
    topTitle: { color: p.text, fontSize: type.body, fontWeight: '700' },
    topRight: { flexDirection: 'row', alignItems: 'center', gap: space.m },
    spend: { color: p.faint, fontSize: type.caption, fontVariant: ['tabular-nums'] },

    chat: { flex: 1 },
    chatContent: { padding: space.m, gap: space.s, paddingBottom: space.l },

    teacherTurn: { gap: space.s, marginBottom: space.s, maxWidth: '94%' },
    ambient: { color: p.dim, fontSize: type.small, lineHeight: 21 },
    verdictText: { fontSize: type.verdict, fontWeight: '600', lineHeight: 22 },
    cueText: { color: p.dim, fontSize: type.cue, fontWeight: '500', lineHeight: 24 },
    targetCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.m,
      alignSelf: 'flex-start',
      backgroundColor: p.card,
      borderRadius: radii.m,
      borderWidth: 1,
      borderColor: p.stroke,
      paddingVertical: space.m,
      paddingHorizontal: space.m,
    },
    targetText: { color: p.text, fontSize: type.taught, fontWeight: '800', flexShrink: 1, lineHeight: 27 },
    playBtn: { marginLeft: 'auto' },

    learnerRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    learnerBubble: {
      backgroundColor: p.accentDeep,
      borderRadius: radii.l,
      borderBottomRightRadius: radii.s,
      padding: space.m,
      maxWidth: '82%',
    },
    learnerText: { color: p.text, fontSize: type.body, lineHeight: 24 },

    notice: { alignItems: 'center', gap: space.xs, paddingVertical: space.s },
    noticeText: { color: p.warn, fontSize: type.small, textAlign: 'center' },

    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: space.s,
      paddingHorizontal: space.m,
      paddingTop: space.s,
      paddingBottom: 34,
      backgroundColor: p.bg,
      borderTopWidth: 1,
      borderTopColor: p.stroke,
    },
    micBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: p.stroke,
      backgroundColor: p.raised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: p.raised,
      borderRadius: radii.m,
      paddingHorizontal: space.m,
      paddingVertical: 11,
      color: p.text,
      fontSize: type.body,
    },
    sendBtn: { paddingBottom: 4 },

    h1: { color: p.text, fontSize: type.title, fontWeight: '800', marginBottom: space.s },
    dimBody: { color: p.dim, fontSize: type.body, lineHeight: 23, marginBottom: space.l },
  });
