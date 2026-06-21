import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import type { FeedbackKind } from '../lib/voice-loop/machine';
import type { LanguageCode } from '../lib/matching';
import { tokenize } from '../lib/matching';
import { radii, resultFor, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';

interface Props {
  kind: Exclude<FeedbackKind, null>;
  /** Normalized best variant — the answer being played. */
  answer: string;
  /** Verbatim transcript of what was heard (may be empty on silence/skip). */
  transcript: string;
  decompose?: string;
  lang: LanguageCode;
  /** True when the machine will give one more try after the audio. */
  retrying: boolean;
}

const ICONS: Record<Exclude<FeedbackKind, null>, string> = {
  pass: 'checkmark.circle.fill',
  near: 'arrow.triangle.2.circlepath',
  miss: 'ear',
  skip: 'arrow.right.circle',
};

function sentenceCase(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * The result moment, Duolingo-anatomy without the judgment: slides up,
 * shows the answer big with the blocks the learner missed highlighted,
 * always shows the verbatim transcript (§3.1) — and never red (§2.4).
 */
export function FeedbackSheet({ kind, answer, transcript, decompose, lang, retrying }: Props) {
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const palette = resultFor(p, kind);
  const said = new Set(tokenize(transcript, lang));
  const answerTokens = tokenize(answer, lang);
  const showTranscript = transcript.trim().length > 0 && transcript.trim() !== answer;

  return (
    <Animated.View
      // A quiet arrival: short fade + small rise. The full-screen sprung
      // slide read as "too much" on device (owner, round 3).
      entering={FadeInDown.duration(200)}
      style={[styles.sheet, { borderColor: palette.tint }]}
    >
      <View style={styles.titleRow}>
        <SymbolView name={ICONS[kind] as any} size={22} tintColor={palette.tint} />
        <Text style={[styles.title, { color: palette.tint }]}>{palette.label}</Text>
      </View>

      <Text style={styles.answer}>
        {answerTokens.map((tok, i) => (
          <Text key={i} style={kind !== 'pass' && !said.has(tok) ? [styles.answerTok, { color: palette.tint }] : undefined}>
            {(i > 0 ? ' ' : '') + (i === 0 ? sentenceCase(tok) : tok)}
          </Text>
        ))}
      </Text>

      {kind === 'miss' && decompose ? <Text style={styles.decompose}>{decompose}</Text> : null}

      {showTranscript ? (
        <Text style={styles.heard}>
          you said · <Text style={styles.heardText}>{transcript.trim()}</Text>
        </Text>
      ) : null}
      {transcript.trim().length === 0 && kind !== 'skip' ? (
        <Text style={styles.heard}>didn't catch anything that time</Text>
      ) : null}

      {retrying ? <Text style={[styles.retry, { color: palette.tint }]}>you've got one more go — Try again</Text> : null}
    </Animated.View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    sheet: {
      backgroundColor: p.raised,
      borderRadius: radii.l,
      borderWidth: 1,
      padding: space.l,
      gap: space.s,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
    title: { fontSize: type.heading, fontWeight: '800', letterSpacing: 0.2 },
    answer: { color: p.text, fontSize: type.title, fontWeight: '700', lineHeight: 34 },
    answerTok: { textDecorationLine: 'underline', fontWeight: '800' },
    decompose: { color: p.dim, fontSize: type.body, lineHeight: 23 },
    heard: { color: p.faint, fontSize: type.small, marginTop: space.xs },
    heardText: { color: p.live, fontSize: type.small },
    retry: { fontSize: type.small, fontWeight: '700', marginTop: space.xs },
  });
