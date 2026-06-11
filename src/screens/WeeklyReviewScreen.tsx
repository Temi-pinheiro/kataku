import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import pack from '../../content/id/foundation.json';
import { useApp } from '../store';
import { colors, type } from '../theme';
import type { CoursePack } from '../lib/content/types';
import { allPrompts } from '../lib/content/types';
import { masteredItemIds } from '../lib/scheduler/scheduler';
import { roundSpeakable, speakableCountForPack } from '../lib/review/speakable';
import { formatUsd, monthToDateUsd } from '../lib/cost/meter';
import { getAllMastery, openDb, spendEvents } from '../db';

const PACK = pack as unknown as CoursePack;

interface ReviewData {
  speakable: number;
  minutes: number;
  sessions: number;
  newMastered: number;
  toughest: { cue: string; missRate: number }[];
  mtdSpend: string;
}

/**
 * Weekly review §8 — v1 shows the counter and honest stats; the spoken
 * checkpoint and what's-next line land in M4.
 */
export function WeeklyReviewScreen() {
  const { setScreen } = useApp();
  const [data, setData] = useState<ReviewData | null>(null);

  useEffect(() => {
    (async () => {
      const db = await openDb();
      const weekStart = new Date(Date.now() - 7 * 86400_000).toISOString();
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const mastery = await getAllMastery();
      const mastered = new Set(masteredItemIds(mastery));
      const speakable = roundSpeakable(speakableCountForPack(PACK, mastered));

      const sessionRows = await db.getAllAsync<{ started_at: string; ended_at: string | null }>(
        'SELECT started_at, ended_at FROM session WHERE started_at >= ? AND ended_at IS NOT NULL',
        weekStart,
      );
      const minutes = Math.round(
        sessionRows.reduce((ms, r) => ms + (new Date(r.ended_at!).getTime() - new Date(r.started_at).getTime()), 0) / 60000,
      );

      const attemptRows = await db.getAllAsync<{ prompt_id: string; result: string }>(
        'SELECT prompt_id, result FROM attempt WHERE at >= ? AND retries = 0',
        weekStart,
      );
      const byPrompt = new Map<string, { miss: number; total: number }>();
      for (const a of attemptRows) {
        const s = byPrompt.get(a.prompt_id) ?? { miss: 0, total: 0 };
        s.total += 1;
        if (a.result === 'miss') s.miss += 1;
        byPrompt.set(a.prompt_id, s);
      }
      const cueById = new Map(allPrompts(PACK).map((p) => [p.id, p.cue_en]));
      const toughest = [...byPrompt.entries()]
        .filter(([, s]) => s.total >= 2 && s.miss > 0)
        .map(([id, s]) => ({ cue: cueById.get(id) ?? id, missRate: s.miss / s.total }))
        .sort((a, b) => b.missRate - a.missRate)
        .slice(0, 3);

      const events = await spendEvents(monthStart.toISOString());
      setData({
        speakable,
        minutes,
        sessions: sessionRows.length,
        newMastered: mastered.size,
        toughest,
        mtdSpend: formatUsd(monthToDateUsd(events, new Date())),
      });
    })();
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={styles.back} onPress={() => setScreen('home')}>
        ‹ home
      </Text>
      <Text style={styles.title}>This week</Text>

      <View style={styles.hero}>
        <Text style={styles.heroNumber}>{data ? `~${data.speakable.toLocaleString()}` : '…'}</Text>
        <Text style={styles.dim}>sentences you can now build — an estimate, and growing fast</Text>
      </View>

      {data && (
        <>
          <Stat label="Minutes practiced" value={`${data.minutes}`} />
          <Stat label="Sessions" value={`${data.sessions}`} />
          <Stat label="Blocks mastered" value={`${data.newMastered}`} />
          <Stat label="Spend this month" value={data.mtdSpend} />

          {data.toughest.length > 0 && (
            <>
              <Text style={styles.section}>Worth another look</Text>
              {data.toughest.map((t, i) => (
                <Text key={i} style={styles.tough}>
                  {t.cue} ({Math.round(t.missRate * 100)}% missed)
                </Text>
              ))}
            </>
          )}
          <Text style={styles.dim}>Spoken checkpoint arrives with M4.</Text>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 72 },
  back: { color: colors.dim, fontSize: type.small, marginBottom: 12 },
  title: { color: colors.text, fontSize: type.title, fontWeight: '700', marginBottom: 16 },
  hero: { backgroundColor: colors.card, borderRadius: 20, padding: 28, alignItems: 'center', marginBottom: 16 },
  heroNumber: { color: colors.accent, fontSize: 48, fontWeight: '800' },
  stat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 18,
    marginBottom: 8,
  },
  statLabel: { color: colors.text, fontSize: type.body },
  statValue: { color: colors.accent, fontSize: type.body, fontWeight: '700' },
  section: { color: colors.text, fontSize: type.body, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  tough: { color: colors.miss, fontSize: type.body, marginBottom: 6 },
  dim: { color: colors.dim, fontSize: type.small, marginTop: 16, textAlign: 'center' },
});
