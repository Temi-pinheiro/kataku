import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';

const SIZE = 108;

interface Props {
  /** think = breathing + draining time bar; listen = live, volume-driven. */
  mode: 'think' | 'listen';
  /** Mic input level 0–1; drives scale + glow in listen mode. */
  volume: SharedValue<number>;
  /** think: answer now · listen: I'm done talking. */
  onPress: () => void;
  thinkMs: number;
  /** Bump to restart the think countdown (e.g. after Repeat). */
  thinkKey: number;
}

/**
 * The center of the voice loop. Voice UI rule #1: never let the learner
 * speak into a void — the orb visibly breathes while thinking and moves
 * with their actual voice while listening. One icon throughout; state is
 * carried by color, motion, and the phase banner above the card.
 */
export function MicOrb({ mode, volume, onPress, thinkMs, thinkKey }: Props) {
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const breath = useSharedValue(1);
  const drain = useSharedValue(1);

  useEffect(() => {
    if (mode === 'think') {
      breath.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(1.0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
      drain.value = 1;
      drain.value = withTiming(0, { duration: thinkMs, easing: Easing.linear });
    } else {
      breath.value = withSpring(1);
      drain.value = withTiming(0, { duration: 200 });
    }
  }, [mode, thinkKey, thinkMs, breath, drain]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: mode === 'listen' ? 1 + volume.value * 0.16 : breath.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: mode === 'listen' ? 0.2 + volume.value * 0.65 : 0.12,
    transform: [{ scale: mode === 'listen' ? 1.18 + volume.value * 0.3 : 1.15 }],
  }));
  const drainStyle = useAnimatedStyle(() => ({
    width: `${drain.value * 100}%`,
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.orbArea}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.View style={[styles.orb, mode === 'listen' && styles.orbLive, orbStyle]}>
          <Pressable onPress={onPress} style={styles.press} hitSlop={16}>
            <SymbolView name="mic.fill" size={40} tintColor={mode === 'listen' ? p.onAccent : p.accent} />
          </Pressable>
        </Animated.View>
      </View>
      {mode === 'think' ? (
        <View style={styles.meter}>
          <Animated.View style={[styles.meterFill, drainStyle]} />
        </View>
      ) : (
        <View style={styles.meter} />
      )}
      <Text style={styles.hint}>{mode === 'think' ? 'tap the mic to answer early' : 'tap the mic when you finish'}</Text>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    wrap: { alignItems: 'center' },
    orbArea: { width: SIZE * 1.6, height: SIZE * 1.6, alignItems: 'center', justifyContent: 'center' },
    glow: {
      position: 'absolute',
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      backgroundColor: p.live,
    },
    orb: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      backgroundColor: p.raised,
      borderWidth: 1.5,
      borderColor: p.stroke,
      alignItems: 'center',
      justifyContent: 'center',
    },
    orbLive: { backgroundColor: p.accent, borderColor: p.accent },
    press: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
    meter: {
      width: SIZE * 1.3,
      height: 4,
      borderRadius: 2,
      backgroundColor: p.raised,
      marginTop: 2,
      overflow: 'hidden',
    },
    meterFill: { height: '100%', borderRadius: 2, backgroundColor: p.accent },
    hint: { color: p.dim, fontSize: type.small, marginTop: 10, letterSpacing: 0.2 },
  });
