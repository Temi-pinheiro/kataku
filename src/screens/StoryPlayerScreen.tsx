import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { storyById } from '../content/stories';
import { useApp } from '../store';
import { space, type, SERIF, storyPalettes, type StoryPalette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { voiceEngine } from '../services/instances';
import { ttsToFile } from '../services/tts';

/**
 * Story player (handoff): a wide hero, a teal transport, and a read-along
 * transcript whose current line glows teal — teal = "the line you're hearing
 * now," faithful to the app-wide live-voice color. No produced track yet, so
 * the runtime voice speaks each line (target only — English is read, never
 * voiced) and the active line advances with it; swaps to the rendered track
 * when one is embedded. Nothing auto-advances past the listener's control.
 */
export function StoryPlayerScreen() {
  const { storyId, setScreen } = useApp();
  const { scheme } = useTheme();
  const sp = storyPalettes[scheme];
  const styles = useMemo(() => makeStyles(sp), [sp]);
  const story = storyById(storyId);

  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const tokenRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const lineYRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    voiceEngine.stop();
    setPlaying(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  // Keep the spoken line in view — ladder stories run 100+ lines.
  useEffect(() => {
    const y = lineYRef.current[active];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  }, [active]);

  const playFrom = useCallback(
    async (start: number) => {
      const lines = story?.lines;
      if (!lines || lines.length === 0) return;
      const token = ++tokenRef.current;
      setPlaying(true);
      // Native pace for stories (immersion); target line only, never English.
      // Prefetch the next line while the current one plays → gapless listening.
      let nextUri = ttsToFile(lines[start].target, story.language, 'natural');
      for (let i = start; i < lines.length; i++) {
        if (token !== tokenRef.current) return;
        const uri = await nextUri;
        if (token !== tokenRef.current) return;
        if (i + 1 < lines.length) nextUri = ttsToFile(lines[i + 1].target, story.language, 'natural');
        setActive(i);
        if (uri) await voiceEngine.play({ uri });
        if (token !== tokenRef.current) return;
      }
      setPlaying(false); // reached the end naturally
    },
    [story],
  );

  if (!story) {
    return (
      <View style={[styles.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.glossActive}>Story not found.</Text>
        <Pressable onPress={() => setScreen('stories')} hitSlop={10} style={{ marginTop: space.m }}>
          <Text style={styles.backText}>‹ stories</Text>
        </Pressable>
      </View>
    );
  }

  const lines = story.lines ?? [];
  const togglePlay = () => {
    Haptics.selectionAsync();
    if (playing) {
      stop();
    } else {
      void playFrom(active);
    }
  };
  const step = (delta: number) => {
    const next = Math.max(0, Math.min(lines.length - 1, active + delta));
    setActive(next);
    if (playing) void playFrom(next);
  };
  const tapLine = (i: number) => {
    Haptics.selectionAsync();
    setActive(i);
    void playFrom(i);
  };

  const progress = lines.length > 1 ? active / (lines.length - 1) : 0;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            stop();
            setScreen('stories');
          }}
          style={styles.backBtn}
          hitSlop={10}
        >
          <SymbolView name="chevron.left" size={18} tintColor={sp.ink} />
        </Pressable>
        <Text style={styles.title}>{story.title}</Text>
      </View>

      {/* Commissioned hero illustration when present; warm placeholder until then. */}
      {story.hero ? (
        <Image source={story.hero} style={styles.hero} />
      ) : (
        <View style={[styles.hero, { backgroundColor: story.tint }]}>
          <View style={styles.heroSun} />
        </View>
      )}

      {/* Transport */}
      <View style={styles.transport}>
        <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.skip}>
          <SymbolView name="gobackward" size={22} tintColor={sp.ink} />
        </Pressable>
        <Pressable onPress={togglePlay} style={styles.playBtn} hitSlop={8}>
          <SymbolView name={playing ? 'pause.fill' : 'play.fill'} size={28} tintColor="#FFFFFF" />
        </Pressable>
        <Pressable onPress={() => step(1)} hitSlop={10} style={styles.skip}>
          <SymbolView name="forward.end.fill" size={20} tintColor={sp.ink} />
        </Pressable>
      </View>

      {/* Scrubber — line position (real audio timings arrive with a produced track) */}
      <View style={styles.scrubTrack}>
        <View style={[styles.scrubFill, { width: `${Math.max(4, progress * 100)}%` }]} />
      </View>
      <View style={styles.scrubRow}>
        <Text style={styles.timestamp}>line {active + 1}</Text>
        <Text style={styles.timestamp}>of {lines.length}</Text>
      </View>

      {/* Transcript — its own scroll region; follows the spoken line (teal) */}
      <ScrollView ref={scrollRef} style={styles.transcriptScroll} contentContainerStyle={styles.transcriptContent}>
        {lines.map((line, i) => (
          <Pressable
            key={i}
            onPress={() => tapLine(i)}
            style={styles.lineRow}
            onLayout={(e) => {
              lineYRef.current[i] = e.nativeEvent.layout.y;
            }}
          >
            <Text style={[styles.target, i === active && styles.targetActive]}>{line.target}</Text>
            <Text style={styles.gloss}>{line.en}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (sp: StoryPalette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: sp.paper, paddingHorizontal: space.l, paddingTop: 64 },
    header: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginBottom: space.m },
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
    backText: { color: sp.sub, fontSize: type.small },
    title: { color: sp.ink, fontSize: 24, fontFamily: SERIF, fontWeight: '600', flexShrink: 1 },
    hero: { height: 150, borderRadius: 20, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
    heroSun: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.45)' },
    transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl, marginTop: space.l },
    skip: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    playBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: sp.teal,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: sp.teal,
      shadowOpacity: 0.5,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
    scrubTrack: { height: 4, borderRadius: 2, backgroundColor: sp.track, marginTop: space.l, overflow: 'hidden' },
    scrubFill: { height: 4, borderRadius: 2, backgroundColor: sp.teal },
    scrubRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.s },
    timestamp: { color: sp.sub, fontSize: type.caption, fontVariant: ['tabular-nums'] },
    transcriptScroll: {
      flex: 1,
      backgroundColor: sp.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: sp.hair,
      marginTop: space.l,
    },
    transcriptContent: { padding: space.m, gap: space.m, paddingBottom: 40 },
    lineRow: { gap: 2 },
    target: { color: sp.ink, fontSize: 18, fontWeight: '700', lineHeight: 26 },
    targetActive: { color: sp.teal },
    roman: { color: sp.sub, fontSize: type.small, fontStyle: 'italic' },
    romanActive: { color: sp.teal },
    gloss: { color: sp.sub, fontSize: type.small },
    glossActive: { color: sp.ink, fontSize: type.body },
  });
