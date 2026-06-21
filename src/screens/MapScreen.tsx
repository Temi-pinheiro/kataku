import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { LANGUAGE_NAMES } from '../packs';
import { OUTLINES } from '../content/outlines';
import { useApp } from '../store';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { modulesFor, moduleState, type Module } from '../lib/modules/manifest';
import { getCompletedModuleIds, getCurrentModuleId, setCurrentModuleId, markModulesComplete, openDb } from '../db';

type NodeState = 'done' | 'here' | 'ahead';

/**
 * Your map (handoff F5; modules 2026-06-21): the module spine, browsable, a
 * mirror not a leaderboard. Done/here/ahead is real recorded completion — done
 * modules are finished, "here" is the one you're on. Nothing is ever locked;
 * tapping any module points the teacher at it.
 */
export function MapScreen() {
  const { setScreen, language } = useApp();
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [currentId, setCurrentId] = useState<string | null>(null);

  const outline = OUTLINES[language];
  const modules = useMemo(() => modulesFor(language), [language]);

  const reload = useCallback(async () => {
    await openDb();
    setCompleted(new Set(await getCompletedModuleIds(language)));
    setCurrentId(await getCurrentModuleId(language));
  }, [language]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Open a module: point the teacher at it (nothing is ever locked). */
  const openModule = (moduleId: string) => {
    Haptics.selectionAsync();
    void setCurrentModuleId(language, moduleId);
    setScreen('teacher');
  };

  /**
   * Catch-up: mark every module before this one as done and land here — so the
   * map reflects where you already are without redoing the work. Stays on the
   * map so the change is visible.
   */
  const catchUpTo = async (module: Module) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const earlier = modules.filter((m) => m.index < module.index).map((m) => m.id);
    await markModulesComplete(language, earlier, new Date());
    await setCurrentModuleId(language, module.id);
    await reload();
  };

  /** A module ahead of you offers a choice: catch the map up to it, or just open it. */
  const onPressModule = (module: Module, st: NodeState) => {
    if (st !== 'ahead') {
      openModule(module.id);
      return;
    }
    const n = module.index; // count of modules before this one
    Alert.alert(
      'Catch up to here?',
      `“${module.topic}” is ${n} module${n === 1 ? '' : 's'} ahead. Mark the ones before it as done so the map matches where you already are? Nothing locks — you can still revisit any of them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Just open it', onPress: () => openModule(module.id) },
        { text: 'Mark earlier as done', onPress: () => void catchUpTo(module) },
      ],
    );
  };

  let flatCursor = -1;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 80 }}>
      <Pressable onPress={() => setScreen('home')} style={styles.back} hitSlop={12}>
        <SymbolView name="chevron.left" size={16} tintColor={p.dim} />
        <Text style={styles.backText}>home</Text>
      </Pressable>
      <Text style={styles.eyebrow}>{LANGUAGE_NAMES[language]}</Text>
      <Text style={styles.title}>Your map</Text>
      <Text style={styles.mirror}>
        <Text style={styles.mirrorStrong}>
          {completed.size} of {modules.length}
        </Text>{' '}
        done · revisit any, any time
      </Text>

      {outline.map((month, mi) => {
        return (
          <View key={mi} style={{ marginTop: space.l }}>
            <Text style={styles.monthLabel}>{month.label}</Text>
            {month.weeks.map((week, wi) => (
              <View key={wi}>
                {week.label ? <Text style={styles.weekLabel}>{week.label}</Text> : null}
                {week.lessons.map((lesson, li) => {
                  flatCursor += 1;
                  const module = modules[flatCursor];
                  const st: NodeState = module ? moduleState(module, completed, currentId) : 'ahead';
                  return (
                    <Animated.View key={li} entering={FadeInDown.duration(180)}>
                      <Pressable
                        style={[styles.node, st === 'ahead' && styles.nodeAhead]}
                        onPress={() => module && onPressModule(module, st)} // nothing locked
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

      <Text style={styles.footer}>
        nothing locked — tap a module ahead to jump there, or mark everything before it done
      </Text>
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
