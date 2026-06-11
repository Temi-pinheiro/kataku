import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LANGUAGE_NAMES, PACKS } from '../packs';
import { useApp } from '../store';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { allPrompts } from '../lib/content/types';
import { masteredItemIds } from '../lib/scheduler/scheduler';
import { isItemOfLanguage } from '../lib/progress/chat-items';
import { roundSpeakable, speakableCountForPack } from '../lib/review/speakable';
import { formatUsd, monthToDateUsd } from '../lib/cost/meter';
import { getAllMastery, openDb, spendEvents } from '../db';

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
  const { setScreen, language } = useApp();
  const { p } = useTheme();
  const styles = React.useMemo(() => makeStyles(p), [p]);
  const PACK = PACKS[language];
  const [data, setData] = useState<ReviewData | null>(null);

  useEffect(() => {
    (async () => {
      const db = await openDb();
      const weekStart = new Date(Date.now() - 7 * 86400_000).toISOString();
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const mastery = await getAllMastery();
      const mastered = new Set(masteredItemIds(mastery).filter((id) => isItemOfLanguage(id, language)));
      const speakable = roundSpeakable(speakableCountForPack(PACK, mastered));

      const sessionRows = await db.getAllAsync<{ started_at: string; ended_at: string | null }>(
        'SELECT started_at, ended_at FROM session WHERE language = ? AND started_at >= ? AND ended_at IS NOT NULL',
        language,
        weekStart,
      );
      const minutes = Math.round(
        sessionRows.reduce((ms, r) => ms + (new Date(r.ended_at!).getTime() - new Date(r.started_at).getTime()), 0) / 60000,
      );

      const attemptRows = await db.getAllAsync<{ prompt_id: string; result: string }>(
        'SELECT prompt_id, result FROM attempt WHERE at >= ? AND retries = 0 AND prompt_id LIKE ?',
        weekStart,
        `${language}-%`,
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
  }, [language, PACK]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 64 }}>
      <Text style={styles.back} onPress={() => setScreen('home')}>
        ‹ home
      </Text>
      <Text style={styles.eyebrow}>{LANGUAGE_NAMES[language]}</Text>
      <Text style={styles.title}>This week</Text>

      <Animated.View entering={FadeInDown.duration(300)} style={styles.hero}>
        <Text style={styles.heroNumber}>{data ? `~${data.speakable.toLocaleString()}` : '…'}</Text>
        <Text style={styles.heroCaption}>sentences you can now build</Text>
        <Text style={styles.heroFine}>an estimate — and the point is how fast it grows</Text>
      </Animated.View>

      {data && (
        <>
          <Animated.View entering={FadeInDown.delay(80).duration(300)} style={styles.grid}>
            <Stat styles={styles} label="minutes practiced" value={`${data.minutes}`} />
            <Stat styles={styles} label="sessions" value={`${data.sessions}`} />
            <Stat styles={styles} label="blocks mastered" value={`${data.newMastered}`} />
            <Stat styles={styles} label="spend this month" value={data.mtdSpend} />
          </Animated.View>

          {data.toughest.length > 0 && (
            <Animated.View entering={FadeInDown.delay(140).duration(300)}>
              <Text style={styles.section}>worth another look</Text>
              {data.toughest.map((t, i) => (
                <View key={i} style={styles.tough}>
                  <Text style={styles.toughCue}>{t.cue}</Text>
                  <Text style={styles.toughRate}>{Math.round(t.missRate * 100)}% missed</Text>
                </View>
              ))}
            </Animated.View>
          )}
          <Text style={styles.fine}>spoken checkpoint arrives with M4</Text>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ styles, label, value }: { styles: ReturnType<typeof makeStyles>; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: p.bg, paddingHorizontal: space.l, paddingTop: 72 },
  back: { color: p.dim, fontSize: type.small, marginBottom: space.m },
  eyebrow: { color: p.faint, fontSize: type.caption, letterSpacing: 1.6, textTransform: 'uppercase' },
  title: { color: p.text, fontSize: type.giant, fontWeight: '800', marginBottom: space.m },

  hero: {
    backgroundColor: p.card,
    borderRadius: radii.l,
    padding: space.xl,
    alignItems: 'center',
    marginBottom: space.m,
  },
  heroNumber: { color: p.accent, fontSize: 52, fontWeight: '800', fontVariant: ['tabular-nums'] },
  heroCaption: { color: p.text, fontSize: type.body, marginTop: space.s },
  heroFine: { color: p.faint, fontSize: type.caption, marginTop: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  stat: {
    width: '48.5%',
    backgroundColor: p.card,
    borderRadius: radii.m,
    padding: space.m,
    gap: 2,
  },
  statValue: { color: p.text, fontSize: type.title, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: p.dim, fontSize: type.caption },

  section: {
    color: p.faint,
    fontSize: type.caption,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: space.l,
    marginBottom: space.s,
  },
  tough: {
    backgroundColor: p.card,
    borderRadius: radii.m,
    padding: space.m,
    marginBottom: space.s,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.m,
  },
  toughCue: { color: p.miss, fontSize: type.body, flex: 1 },
  toughRate: { color: p.faint, fontSize: type.caption },
  fine: { color: p.faint, fontSize: type.caption, textAlign: 'center', marginTop: space.l },
  });
