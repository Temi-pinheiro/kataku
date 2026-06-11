import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';

function Dot({ delay, color }: { delay: number; color: string }) {
  const v = useSharedValue(0.3);
  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 350, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.3, { duration: 350, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [delay, v]);
  const style = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ scale: 0.8 + v.value * 0.4 }],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** "The tutor is speaking" — the audio has a face. */
export function TutorDots() {
  const { p } = useTheme();
  const color = useMemo(() => p.accent, [p]);
  return (
    <View style={styles.row}>
      <Dot delay={0} color={color} />
      <Dot delay={160} color={color} />
      <Dot delay={320} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', height: 28 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
