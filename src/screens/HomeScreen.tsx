import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { INSTALLED_LANGUAGES, LANGUAGE_NAMES, packFor } from '../packs';
import { useApp } from '../store';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { buildSession } from '../lib/session/builder';
import { masteredItemIds } from '../lib/scheduler/scheduler';
import { isItemOfLanguage } from '../lib/progress/chat-items';
import { roundSpeakable, speakableCountForPack } from '../lib/review/speakable';
import { completedChunkCount, getAllMastery, loadSessionProgress, openDb } from '../db';

interface HomeData {
  chunksDone: number;
  doneToday: boolean;
  nextLessonRef: string | null;
  nextNewBlocks: number;
  resumeStep: { lessonRef: string; step: number; total: number } | null;
  speakable: number;
  /** it/zh/ja have no drill deck yet — the counter falls back to owned words. */
  hasDeck: boolean;
}

export function HomeScreen() {
  const { setScreen, language, setLanguage } = useApp();
  const { p } = useTheme();
  const styles = React.useMemo(() => makeStyles(p), [p]);
  const [data, setData] = useState<HomeData | null>(null);

  const refresh = useCallback(async () => {
    const db = await openDb();
    const [chunksDone, mastery, saved] = await Promise.all([
      completedChunkCount(language),
      getAllMastery(),
      loadSessionProgress(language),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM session WHERE language = ? AND core_completed = 1 AND started_at >= ?',
      language,
      today,
    );
    const pack = packFor(language);
    const plan = pack ? buildSession(pack, chunksDone, mastery, new Date()) : null;
    const mastered = new Set(masteredItemIds(mastery).filter((id) => isItemOfLanguage(id, language)));
    setData({
      chunksDone,
      doneToday: (row?.n ?? 0) > 0,
      nextLessonRef: plan?.lessonRef ?? null,
      nextNewBlocks: plan?.newItemIds.length ?? 0,
      resumeStep: saved ? { lessonRef: saved.lessonRef, step: saved.stepIndex + 1, total: saved.stepKeys.length } : null,
      speakable: pack ? roundSpeakable(speakableCountForPack(pack, mastered)) : mastered.size,
      hasDeck: pack != null,
    });
  }, [language]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const d = data;

  return (
    <View style={styles.screen}>
      <Animated.View entering={FadeInDown.duration(300)}>
        <Text style={styles.brand}>kataku</Text>
        <View style={styles.chips}>
          {INSTALLED_LANGUAGES.map((l) => (
            <Pressable
              key={l}
              onPress={() => {
                Haptics.selectionAsync();
                setLanguage(l);
              }}
              style={[styles.chip, l === language && styles.chipActive]}
            >
              <Text style={[styles.chipText, l === language && styles.chipTextActive]}>{l.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.langTitle}>{LANGUAGE_NAMES[language]}</Text>
      </Animated.View>

      {d?.resumeStep && (
        <Animated.View entering={FadeInDown.delay(100).duration(300)}>
          <Pressable style={styles.resume} onPress={() => setScreen('session')}>
            <SymbolView name="play.circle.fill" size={26} tintColor={p.live} />
            <View style={{ flex: 1 }}>
              <Text style={styles.resumeTitle}>Resume lesson {d.resumeStep.lessonRef}</Text>
              <Text style={styles.resumeMeta}>
                step {d.resumeStep.step} of {d.resumeStep.total}
              </Text>
            </View>
            <SymbolView name="chevron.right" size={14} tintColor={p.faint} />
          </Pressable>
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(140).duration(300)}>
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.985 }] }]}
          onPress={() => {
            Haptics.selectionAsync();
            setScreen('teacher');
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTitle}>Sit with the teacher</Text>
            <Text style={styles.ctaMeta}>build sentences out loud, one block at a time</Text>
          </View>
          <SymbolView name="bubble.left.and.text.bubble.right.fill" size={48} tintColor={p.onAccent} />
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(170).duration(300)}>
        <Pressable
          style={({ pressed }) => [styles.convo, pressed && { transform: [{ scale: 0.985 }] }]}
          onPress={() => {
            Haptics.selectionAsync();
            setScreen('conversation');
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.convoTitle}>Have a conversation</Text>
            <Text style={styles.convoMeta}>all voice, both ways — it corrects by rephrasing</Text>
          </View>
          <SymbolView name="waveform.circle.fill" size={40} tintColor={p.live} />
        </Pressable>
      </Animated.View>

      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setScreen('map');
        }}
        style={styles.mapLink}
        hitSlop={8}
      >
        <Text style={styles.mapLinkText}>your map — all lessons →</Text>
      </Pressable>

      <Animated.View entering={FadeInDown.delay(200).duration(300)} style={styles.secondaryRow}>
        <Pressable style={styles.secondary} onPress={() => setScreen('review')}>
          <Text style={styles.secondaryValue}>
            {d ? `${d.hasDeck ? '~' : ''}${d.speakable.toLocaleString()}` : '—'}
          </Text>
          <Text style={styles.secondaryLabel}>{d?.hasDeck === false ? 'words you own' : 'sentences you can say'}</Text>
          <Text style={styles.secondaryLink}>weekly review →</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => setScreen('settings')}>
          <SymbolView name="gearshape.fill" size={26} tintColor={p.dim} />
          <Text style={[styles.secondaryLabel, { marginTop: space.s }]}>think time · coach · spend</Text>
          <Text style={styles.secondaryLink}>settings →</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: p.bg, paddingHorizontal: space.l, paddingTop: 76, gap: space.m },
  brand: { color: p.faint, fontSize: type.caption, letterSpacing: 3, textTransform: 'uppercase' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, marginTop: space.m },
  chip: {
    backgroundColor: p.card,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  chipActive: { backgroundColor: p.accent },
  chipText: { color: p.dim, fontSize: type.small, fontWeight: '700' },
  chipTextActive: { color: p.onAccent },

  langTitle: { color: p.text, fontSize: type.hero, fontWeight: '800', marginTop: space.m, letterSpacing: -0.5 },

  convo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: p.card,
    borderRadius: radii.l,
    borderWidth: 1,
    borderColor: p.stroke,
    padding: space.l,
    minHeight: 88,
  },
  convoTitle: { color: p.text, fontSize: type.heading, fontWeight: '800' },
  convoMeta: { color: p.dim, fontSize: type.small, marginTop: 4 },

  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: p.card,
    borderRadius: radii.m,
    borderWidth: 1,
    borderColor: p.stroke,
    padding: space.m,
  },
  resumeTitle: { color: p.text, fontSize: type.body, fontWeight: '700' },
  resumeMeta: { color: p.dim, fontSize: type.small },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: p.accent,
    borderRadius: radii.l,
    padding: space.l,
    minHeight: 110,
  },
  ctaTitle: { color: p.onAccent, fontSize: type.title, fontWeight: '800' },
  ctaMeta: { color: p.onAccent, opacity: 0.75, fontSize: type.small, marginTop: 4 },
  ctaDone: { color: p.onAccent, opacity: 0.6, fontSize: type.caption, marginTop: 6 },

  mapLink: { alignSelf: 'center', paddingVertical: space.xs },
  mapLinkText: { color: p.dim, fontSize: type.small, fontWeight: '600' },
  secondaryRow: { flexDirection: 'row', gap: space.m },
  secondary: {
    flex: 1,
    backgroundColor: p.card,
    borderRadius: radii.l,
    padding: space.m,
    minHeight: 116,
    justifyContent: 'space-between',
  },
  secondaryValue: { color: p.accent, fontSize: type.title, fontWeight: '800' },
  secondaryLabel: { color: p.dim, fontSize: type.caption, lineHeight: 16 },
  secondaryLink: { color: p.faint, fontSize: type.caption, marginTop: space.s },
  });
