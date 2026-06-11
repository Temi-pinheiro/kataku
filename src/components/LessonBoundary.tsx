import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BigButton } from './BigButton';
import { space, type, type Palette } from '../theme';

interface Props {
  p: Palette;
  /** Remount the lesson — progress is persisted per step, so this resumes. */
  onRecover: () => void;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * A lesson must never die on a red screen. Anything that escapes the
 * defensive layers lands here: one calm card, one button, and the
 * per-step persistence means recovery resumes exactly where it broke.
 */
export class LessonBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.warn('lesson recovered from error:', error);
  }

  render(): React.ReactNode {
    const { p } = this.props;
    if (this.state.error) {
      return (
        <View style={[styles.wrap, { backgroundColor: p.bg }]}>
          <Text style={[styles.title, { color: p.text }]}>That one hiccuped.</Text>
          <Text style={[styles.body, { color: p.dim }]}>
            Your place is saved — picking up right where you were.
          </Text>
          <BigButton
            label="Resume lesson"
            onPress={() => {
              this.setState({ error: null });
              this.props.onRecover();
            }}
          />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: space.l, gap: space.s },
  title: { fontSize: type.title, fontWeight: '800' },
  body: { fontSize: type.body, marginBottom: space.m },
});
