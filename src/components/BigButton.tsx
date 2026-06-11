import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { radii, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'quiet';
  small?: boolean;
  style?: ViewStyle;
}

/** The app's button: 56pt target, spring press, selection haptic. */
export function BigButton({ label, onPress, kind = 'primary', small, style }: Props) {
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
      }}
      style={[styles.base, styles[kind], small && styles.small, animated, style]}
    >
      <Text
        style={[
          styles.label,
          small && styles.labelSmall,
          kind !== 'primary' && { color: kind === 'quiet' ? p.dim : p.text },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    base: {
      minHeight: 56,
      paddingVertical: 16,
      paddingHorizontal: 28,
      borderRadius: radii.l,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 6,
    },
    primary: { backgroundColor: p.accent },
    ghost: { backgroundColor: p.raised },
    quiet: { backgroundColor: 'transparent' },
    small: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 18, borderRadius: radii.m },
    label: { fontSize: type.body, fontWeight: '700', color: p.onAccent, letterSpacing: 0.2 },
    labelSmall: { fontSize: type.small },
  });
