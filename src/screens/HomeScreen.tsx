import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import pack from '../../content/id/foundation.json';
import { BigButton } from '../components/BigButton';
import { useApp } from '../store';
import { colors, type } from '../theme';
import type { CoursePack } from '../lib/content/types';
import { allLessons } from '../lib/content/types';
import { completedChunkCount, openDb } from '../db';

const PACK = pack as unknown as CoursePack;

export function HomeScreen() {
  const { setScreen } = useApp();
  const [chunksDone, setChunksDone] = useState<number | null>(null);
  const [doneToday, setDoneToday] = useState(false);

  const refresh = useCallback(async () => {
    const db = await openDb();
    const n = await completedChunkCount('id');
    setChunksDone(n);
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM session WHERE language = 'id' AND core_completed = 1 AND started_at >= ?",
      today,
    );
    setDoneToday((row?.n ?? 0) > 0);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const total = allLessons(PACK).length;
  const dayLabel =
    chunksDone === null ? ' ' : chunksDone >= total ? 'Foundation complete' : `Day ${chunksDone + 1} of Foundation`;

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>Kataku</Text>
      <Text style={styles.lang}>Bahasa Indonesia</Text>
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
  lang: { color: colors.text, fontSize: type.giant, fontWeight: '800', marginTop: 4 },
  day: { color: colors.dim, fontSize: type.body, marginBottom: 32 },
  done: { color: colors.dim, fontSize: type.small, textAlign: 'center', marginTop: 4 },
  footer: { flexDirection: 'row', gap: 24, justifyContent: 'center', marginTop: 48 },
  link: { color: colors.dim, fontSize: type.body, textDecorationLine: 'underline' },
});
