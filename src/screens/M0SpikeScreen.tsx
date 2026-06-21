import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BigButton } from '../components/BigButton';
import { useApp } from '../store';
import { type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { recognizer } from '../services/instances';

/**
 * M0 spike (plan §9): tap, speak, see the verbatim transcript. Measures
 * speech→final latency per utterance and shows on-device availability for
 * the locale. Findings go to docs/m0-findings.md.
 */

const LOCALES = ['id-ID', 'es-ES', 'fr-FR'] as const;

interface Trial {
  locale: string;
  transcript: string;
  latencyMs: number;
}

export function M0SpikeScreen() {
  const { setScreen } = useApp();
  const { p } = useTheme();
  const styles = React.useMemo(() => makeStyles(p), [p]);
  const [locale, setLocale] = useState<(typeof LOCALES)[number]>('id-ID');
  const [availability, setAvailability] = useState('checking…');
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [trials, setTrials] = useState<Trial[]>([]);
  const speechStartRef = useRef<number | null>(null);

  useEffect(() => {
    recognizer
      .availability(locale)
      .then((a) => setAvailability(a.available ? (a.onDevice ? 'on-device' : 'networked (free)') : 'UNAVAILABLE'))
      .catch((e) => setAvailability(`error: ${e.message}`));
  }, [locale]);

  const toggle = async () => {
    if (listening) {
      recognizer.stop();
      return;
    }
    setPartial('');
    speechStartRef.current = null;
    setListening(true);
    await recognizer.start(
      { locale, preferOnDevice: true },
      {
        onSpeechStart: () => {
          speechStartRef.current = Date.now();
        },
        onPartial: setPartial,
        onFinal: (t) => {
          const started = speechStartRef.current ?? Date.now();
          setTrials((prev) => [{ locale, transcript: t, latencyMs: Date.now() - started }, ...prev]);
          setPartial('');
          setListening(false);
        },
        onEnd: () => setListening(false),
        onError: (e) => {
          setTrials((prev) => [{ locale, transcript: `⚠︎ ${e.code}: ${e.message}`, latencyMs: 0 }, ...prev]);
          setListening(false);
        },
      },
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.back} onPress={() => setScreen('home')}>
        ‹ home
      </Text>
      <Text style={styles.title}>Mic test (M0)</Text>
      <View style={styles.chips}>
        {LOCALES.map((l) => (
          <Text key={l} style={[styles.chip, l === locale && styles.chipActive]} onPress={() => setLocale(l)}>
            {l}
          </Text>
        ))}
      </View>
      <Text style={styles.dim}>recognition: {availability}</Text>

      <BigButton label={listening ? '■ Stop' : '● Tap, then speak'} onPress={toggle} />
      <Text style={styles.partial}>{partial || ' '}</Text>

      <ScrollView style={styles.log}>
        {trials.map((t, i) => (
          <View key={i} style={styles.trial}>
            <Text style={styles.transcript}>{t.transcript}</Text>
            <Text style={styles.dim}>
              {t.locale} · speech→final {t.latencyMs} ms
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: p.bg, padding: 24, paddingTop: 72 },
  back: { color: p.dim, fontSize: type.small, marginBottom: 12 },
  title: { color: p.text, fontSize: type.title, fontWeight: '700', marginBottom: 16 },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  chip: { color: p.dim, backgroundColor: p.card, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16, fontSize: type.small, overflow: 'hidden' },
  chipActive: { color: p.onAccent, backgroundColor: p.accent, fontWeight: '700' },
  dim: { color: p.dim, fontSize: type.small, marginBottom: 8 },
  partial: { color: p.live, fontSize: type.title, minHeight: 40, marginVertical: 12 },
  log: { flex: 1, marginTop: 8 },
  trial: { backgroundColor: p.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  transcript: { color: p.text, fontSize: type.body, marginBottom: 4 },
  });
