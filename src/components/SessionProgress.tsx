import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';

/** Thin top progress bar — the only "where am I" the session needs. */
export function SessionProgress({ value }: { value: number }) {
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withSpring(Math.min(1, Math.max(0, value)), { damping: 20, stiffness: 140 });
  }, [value, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: p.raised, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 3, backgroundColor: p.accent },
  });
