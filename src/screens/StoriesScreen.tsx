import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { storiesFor, type Story } from '../content/stories';
import { useApp } from '../store';
import { radii, space, type, SERIF, storyPalettes, type StoryPalette } from '../theme';
import { useTheme } from '../hooks/useTheme';

/**
 * Stories list — the editorial side door (handoff): warmer, literary skin
 * (serif titles, cream/ink), the same teal-is-the-live-voice + no-pressure
 * rules. Playable samples open the player; higher levels are level-gated
 * (labelled "ahead," never "forbidden"), not paywalled.
 */
export function StoriesScreen() {
  const { setScreen, language, openStory } = useApp();
  const { scheme } = useTheme();
  const sp = storyPalettes[scheme];
  const styles = useMemo(() => makeStyles(sp), [sp]);
  const stories = storiesFor(language);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: space.l, paddingTop: 64, paddingBottom: 64 }}>
      <View style={styles.header}>
        <Pressable onPress={() => setScreen('home')} style={styles.backBtn} hitSlop={10}>
          <SymbolView name="chevron.left" size={18} tintColor={sp.ink} />
        </Pressable>
        <Text style={styles.title}>Stories</Text>
      </View>

      {stories.map((s, i) => (
        <Animated.View key={s.id} entering={FadeInDown.delay(i * 40).duration(220)}>
          <StoryCard story={s} sp={sp} styles={styles} onOpen={() => openStory(s.id)} />
        </Animated.View>
      ))}
    </ScrollView>
  );
}

function StoryCard({
  story,
  sp,
  styles,
  onOpen,
}: {
  story: Story;
  sp: StoryPalette;
  styles: ReturnType<typeof makeStyles>;
  onOpen: () => void;
}) {
  const locked = !story.lines; // level-gated until authored + rendered
  const progress = 0; // wired to per-story progress once audio is produced
  return (
    <Pressable
      style={[styles.card, locked && styles.cardLocked]}
      onPress={() => {
        if (locked) return;
        Haptics.selectionAsync();
        onOpen();
      }}
    >
      <Thumb tint={story.tint} locked={locked} styles={styles} />
      <View style={{ flex: 1 }}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{story.level.toUpperCase()}</Text>
          </View>
          {locked && <SymbolView name="lock.fill" size={13} tintColor={sp.sub} />}
        </View>
        <Text style={styles.cardTitle}>{story.title}</Text>
        <Text style={styles.cardDesc}>{story.description}</Text>
        {!locked && (
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${Math.max(6, progress * 100)}%` }]} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Warm placeholder art — a tinted block with a soft sun, until illustrations land. */
function Thumb({ tint, locked, styles }: { tint: string; locked: boolean; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={[styles.thumb, { backgroundColor: tint }, locked && { opacity: 0.5 }]}>
      <View style={styles.thumbSun} />
    </View>
  );
}

const makeStyles = (sp: StoryPalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: sp.paper },
    header: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.l },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: sp.card,
      borderWidth: 1,
      borderColor: sp.hair,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: sp.ink, fontSize: 30, fontFamily: SERIF, fontWeight: '600' },
    card: {
      flexDirection: 'row',
      gap: space.m,
      backgroundColor: sp.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: sp.hair,
      padding: space.m,
      marginBottom: space.m,
      alignItems: 'center',
    },
    cardLocked: { opacity: 0.6 },
    thumb: { width: 72, height: 72, borderRadius: radii.m, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
    thumbSun: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.5)' },
    badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    badge: { backgroundColor: sp.badgeBg, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
    badgeText: { color: sp.badgeText, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    cardTitle: { color: sp.ink, fontSize: 19, fontFamily: SERIF, fontWeight: '600', marginTop: 4 },
    cardDesc: { color: sp.sub, fontSize: type.small, marginTop: 2 },
    track: { height: 5, borderRadius: 3, backgroundColor: sp.track, marginTop: space.s, overflow: 'hidden' },
    trackFill: { height: 5, borderRadius: 3, backgroundColor: sp.teal },
  });
