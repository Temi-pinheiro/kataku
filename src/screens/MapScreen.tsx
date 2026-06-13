import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { LANGUAGE_NAMES } from '../packs';
import { OUTLINES } from '../content/outlines';
import { useApp } from '../store';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { masteredItemIds } from '../lib/scheduler/scheduler';
import { isItemOfLanguage } from '../lib/progress/chat-items';
import { getAllMastery, openDb } from '../db';

/** Rough blocks-per-lesson, to place "you're here" from what's actually owned. */
const BLOCKS_PER_LESSON = 4;

type NodeState = 'done' | 'here' | 'ahead';

/**
 * Your map (handoff F5): the protocol spine, browsable, a mirror not a
 * leaderboard. Done/here/ahead comes from how much you actually own; nothing
 * is ever locked — every lesson opens the teacher.
 */
export function MapScreen() {
  const { setScreen, language } = useApp();
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const [owned, setOwned] = useState(0);

  useEffect(() => {
    (async () => {
      await openDb();
      const mastery = await getAllMastery();
      setOwned(masteredItemIds(mastery).filter((id) => isItemOfLanguage(id, language)).length);
    })();
  }, [language]);

  const outline = OUTLINES[language];
  // Flatten lessons in order so "you're here" is a single index along the path.
  const flat = useMemo(() => {
    const lessons: { mi: number; wi: number; li: number }[] = [];
    outline.forEach((m, mi) => m.weeks.forEach((w, wi) => w.lessons.forEach((_, li) => lessons.push({ mi, wi, li }))));
    return lessons;
  }, [outline]);
  const hereIdx = Math.min(flat.length - 1, Math.floor(owned / BLOCKS_PER_LESSON));

  let flatCursor = -1;
  const stateOf = (): NodeState => {
    flatCursor += 1;
    return flatCursor < hereIdx ? 'done' : flatCursor === hereIdx ? 'here' : 'ahead';
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 80 }}>
      <Pressable onPress={() => setScreen('home')} style={styles.back} hitSlop={12}>
        <SymbolView name="chevron.left" size={16} tintColor={p.dim} />
        <Text style={styles.backText}>home</Text>
      </Pressable>
      <Text style={styles.eyebrow}>{LANGUAGE_NAMES[language]}</Text>
      <Text style={styles.title}>Your map</Text>
      <Text style={styles.mirror}>
        <Text style={styles.mirrorStrong}>{owned} blocks</Text> are yours so far · revisit any, any time
      </Text>

      {outline.map((month, mi) => {
        return (
          <View key={mi} style={{ marginTop: space.l }}>
            <Text style={styles.monthLabel}>{month.label}</Text>
            {month.weeks.map((week, wi) => (
              <View key={wi}>
                {week.label ? <Text style={styles.weekLabel}>{week.label}</Text> : null}
                {week.lessons.map((lesson, li) => {
                  const st = stateOf();
                  return (
                    <Animated.View key={li} entering={FadeInDown.duration(180)}>
                      <Pressable
                        style={[styles.node, st === 'ahead' && styles.nodeAhead]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setScreen('teacher'); // nothing locked — every lesson opens the teacher
                        }}
                      >
                        <Dot state={st} p={p} styles={styles} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.topic, st === 'ahead' && styles.aheadText]}>{lesson.topic}</Text>
                          <Text style={[styles.words, st === 'ahead' && styles.aheadFaint]}>{lesson.words}</Text>
                        </View>
                        {st === 'done' && (
                          <View style={styles.revisit}>
                            <SymbolView name="arrow.counterclockwise" size={13} tintColor={p.live} />
                            <Text style={styles.revisitText}>revisit</Text>
                          </View>
                        )}
                        {st === 'here' && <Text style={styles.hereText}>you’re here</Text>}
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            ))}
          </View>
        );
      })}

      <Text style={styles.footer}>nothing locked — wander ahead or back whenever you like</Text>
    </ScrollView>
  );
}

function Dot({ state, p, styles }: { state: NodeState; p: Palette; styles: ReturnType<typeof makeStyles> }) {
  if (state === 'done') {
    return (
      <View style={[styles.dot, { backgroundColor: p.accent }]}>
        <SymbolView name="checkmark" size={12} tintColor={p.onAccent} />
      </View>
    );
  }
  if (state === 'here') {
    return (
      <View style={styles.hereHalo}>
        <View style={[styles.dot, styles.hereDot]} />
      </View>
    );
  }
  return <View style={[styles.dot, styles.dotAhead]} />;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg, paddingHorizontal: space.l, paddingTop: 72 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: space.m },
    backText: { color: p.dim, fontSize: type.small },
    eyebrow: { color: p.dim, fontSize: type.small },
    title: { color: p.text, fontSize: type.giant, fontWeight: '800', marginTop: 2 },
    mirror: { color: p.dim, fontSize: type.small, marginTop: space.s, lineHeight: 20 },
    mirrorStrong: { color: p.text, fontWeight: '800' },
    monthLabel: {
      color: p.faint,
      fontSize: type.caption,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      fontWeight: '700',
      marginBottom: space.s,
    },
    weekLabel: { color: p.dim, fontSize: type.small, fontWeight: '700', marginTop: space.s, marginBottom: space.xs, marginLeft: 38 },
    node: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.m,
      paddingVertical: space.s,
    },
    nodeAhead: { opacity: 0.9 },
    dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    dotAhead: { borderWidth: 1.5, borderColor: p.stroke, backgroundColor: 'transparent' },
    hereHalo: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.accentDeep,
      borderWidth: 2,
      borderColor: p.accent,
    },
    hereDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: p.accent },
    topic: { color: p.text, fontSize: type.cue, fontWeight: '800' },
    words: { color: p.dim, fontSize: type.small, marginTop: 1 },
    aheadText: { color: p.faint },
    aheadFaint: { color: p.stroke },
    revisit: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    revisitText: { color: p.live, fontSize: type.small, fontWeight: '700' },
    hereText: { color: p.accent, fontSize: type.small, fontWeight: '800' },
    footer: { color: p.faint, fontSize: type.caption, textAlign: 'center', marginTop: space.xl },
  });
