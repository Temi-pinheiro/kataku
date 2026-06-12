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
import { getOpenAIKey } from '../services/keys';
import { parseMarked, targetOnly } from '../lib/teacher-markup';
import { digestProgress, markPracticeSession } from '../services/progress';

/** Digest the transcript window every N learner turns (and on exit/restart). */
const DIGEST_EVERY_LEARNER_TURNS = 8;
/** A sitting with this many answers marks the day done. */
const DAY_MARK_LEARNER_TURNS = 10;

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
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [spendLabel, setSpendLabel] = useState('');
  const scrollRef = useRef<ScrollView>(null);
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
      const key = await getOpenAIKey();
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
    recognizer.abort();
    setListening(false);
  }, []);

  const toggleMic = useCallback(async () => {
    if (listening) {
      recognizer.stop(); // finalize what was said
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    voiceEngine.stop(); // never listen while the teacher is speaking
    setPlayingIdx(null);
    setListening(true);
    voiceEngine.tone('open');
    await recognizer.start(
      { locale: sttLocaleFor(language), preferOnDevice: true, continuous: true, recordAudio: false },
      {
        onPartial: (t) => setInput(t),
        onFinal: (t) => {
          setInput(t);
          setListening(false);
          voiceEngine.tone('close');
        },
        onEnd: () => setListening(false),
        onError: () => setListening(false),
      },
    );
  }, [listening, language]);

  // ---- per-bubble audio (runtime TTS, disk-cached; silence > robot voice) ----

  const playTurn = useCallback(
    async (idx: number, text: string) => {
      Haptics.selectionAsync();
      if (playingIdx === idx) {
        voiceEngine.stop();
        setPlayingIdx(null);
        return;
      }
      stopListening();
      voiceEngine.stop();
      // Owner rule: never speak English. Play ONLY the «target» spans,
      // with the voice locked to the learning language.
      const speakable = targetOnly(text);
      if (!speakable) return;
      setPlayingIdx(idx);
      const uri = await ttsToFile(speakable, language);
      if (!uri) {
        setPlayingIdx(null);
        setNotice('Audio unavailable right now — the text has everything.');
        return;
      }
      await voiceEngine.play({ uri });
      setPlayingIdx((cur) => (cur === idx ? null : cur));
      void refreshSpend();
    },
    [playingIdx, stopListening, refreshSpend, language],
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
          The live teacher and its voice run on your OpenAI account. Paste your API key in Settings — it's stored in
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
              {(() => {
                // Punctuation-only leftovers between «marks» ("." after a
                // wrapped word) would render as orphan dots — drop them.
                const segments = parseMarked(turn.text).filter(
                  (seg) => seg.target || !/^[\s\p{P}]*$/u.test(seg.text),
                );
                let firstTarget = true;
                return segments.map((seg, si) => {
                  if (!seg.target) {
                    return (
                      <Text key={si} style={styles.ambient}>
                        {seg.text.trim()}
                      </Text>
                    );
                  }
                  const withPlay = firstTarget;
                  firstTarget = false;
                  return (
                    <View key={si} style={styles.targetCard}>
                      <Text style={styles.targetText}>{seg.text.trim()}</Text>
                      {withPlay && (
                        <Pressable style={styles.playBtn} onPress={() => playTurn(idx, turn.text)} hitSlop={10}>
                          {playingIdx === idx ? (
                            <ActivityIndicator size="small" color={p.accent} />
                          ) : (
                            <SymbolView name="play.circle.fill" size={30} tintColor={p.accent} />
                          )}
                        </Pressable>
                      )}
                    </View>
                  );
                });
              })()}
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
    targetText: { color: p.text, fontSize: type.heading, fontWeight: '800', flexShrink: 1, lineHeight: 28 },
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
