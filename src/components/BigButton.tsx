import React from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, type } from '../theme';

interface Props {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost';
  style?: ViewStyle;
}

export function BigButton({ label, onPress, kind = 'primary', style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.base, kind === 'primary' ? styles.primary : styles.ghost, pressed && { opacity: 0.7 }, style]}
    >
      <Text style={[styles.label, kind === 'ghost' && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 18,
    paddingHorizontal: 28,
    borderRadius: 16,
    alignItems: 'center',
    marginVertical: 6,
  },
  primary: { backgroundColor: colors.accent },
  ghost: { backgroundColor: colors.card },
  label: { fontSize: type.body, fontWeight: '700', color: '#0B0F14' },
});
