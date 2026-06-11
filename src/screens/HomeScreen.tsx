import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BigButton } from '../components/BigButton';
import { INSTALLED_LANGUAGES, LANGUAGE_NAMES, PACKS } from '../packs';
import { useApp } from '../store';
import { colors, type } from '../theme';
import { allLessons } from '../lib/content/types';
import { completedChunkCount, openDb } from '../db';

export function HomeScreen() {
  const { setScreen, language, setLanguage } = useApp();
  const [chunksDone, setChunksDone] = useState<number | null>(null);
  const [doneToday, setDoneToday] = useState(false);

  const refresh = useCallback(async () => {
    const db = await openDb();
    const n = await completedChunkCount(language);
    setChunksDone(n);
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM session WHERE language = ? AND core_completed = 1 AND started_at >= ?',
      language,
      today,
    );
    setDoneToday((row?.n ?? 0) > 0);
  }, [language]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const total = allLessons(PACKS[language]).length;
  const dayLabel =
    chunksDone === null ? ' ' : chunksDone >= total ? 'Foundation complete' : `Day ${chunksDone + 1} of Foundation`;

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>Kataku</Text>
      <View style={styles.chips}>
        {INSTALLED_LANGUAGES.map((l) => (
          <Text key={l} style={[styles.chip, l === language && styles.chipActive]} onPress={() => setLanguage(l)}>
            {l.toUpperCase()}
          </Text>
        ))}
      </View>
      <Text style={styles.lang}>{LANGUAGE_NAMES[language]}</Text>
      <Text style={styles.day}>{dayLabel}</Text>

      <BigButton
        label={doneToday ? 'Keep going' : "Start today's session"}
        onPress={() => setScreen('session')}
      />
      {doneToday && <Text style={styles.done}>Today is done — anything more is extra.</Text>}

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => setScreen('review')}>
          Weekly review
        </Text>
        <Text style={styles.link} onPress={() => setScreen('settings')}>
          Settings
        </Text>
        <Text style={styles.link} onPress={() => setScreen('m0spike')}>
          Mic test
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' },
  brand: { color: colors.dim, fontSize: type.small, letterSpacing: 2, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 16 },
  chip: {
    color: colors.dim,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    fontSize: type.small,
    fontWeight: '700',
    overflow: 'hidden',
  },
  chipActive: { color: '#0B0F14', backgroundColor: colors.accent },
  lang: { color: colors.text, fontSize: type.giant, fontWeight: '800', marginTop: 12 },
  day: { color: colors.dim, fontSize: type.body, marginBottom: 32 },
  done: { color: colors.dim, fontSize: type.small, textAlign: 'center', marginTop: 4 },
  footer: { flexDirection: 'row', gap: 24, justifyContent: 'center', marginTop: 48 },
  link: { color: colors.dim, fontSize: type.body, textDecorationLine: 'underline' },
});
