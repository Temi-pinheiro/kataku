import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { INSTALLED_LANGUAGES, PACKS } from './src/packs';
import { useApp } from './src/store';
import { useTheme } from './src/hooks/useTheme';
import { loadPack, openDb } from './src/db';
import { voiceEngine } from './src/services/instances';
import { HomeScreen } from './src/screens/HomeScreen';
import { LessonBoundary } from './src/components/LessonBoundary';
import { SessionScreen } from './src/screens/SessionScreen';
import { WeeklyReviewScreen } from './src/screens/WeeklyReviewScreen';
import { SettingsScreen, loadPersistedSettings } from './src/screens/SettingsScreen';
import { M0SpikeScreen } from './src/screens/M0SpikeScreen';

export default function App() {
  const { screen, setSettings } = useApp();
  const { p, scheme } = useTheme();
  const [ready, setReady] = useState(false);
  const [lessonEpoch, setLessonEpoch] = useState(0);

  useEffect(() => {
    (async () => {
      const db = await openDb();
      for (const lang of INSTALLED_LANGUAGES) {
        const row = await db.getFirstAsync<{ pack_version: number }>(
          'SELECT pack_version FROM language WHERE code = ?',
          lang,
        );
        if ((row?.pack_version ?? -1) !== PACKS[lang].version) {
          await loadPack(PACKS[lang]);
        }
        await voiceEngine.loadPackIndex(lang);
      }
      setSettings(await loadPersistedSettings());
      await voiceEngine.init();
      setReady(true);
    })().catch((e) => {
      console.error('init failed', e);
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <View style={[styles.boot, { backgroundColor: p.bg }]}>
        <ActivityIndicator color={p.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.app, { backgroundColor: p.bg }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {screen === 'home' && <HomeScreen />}
      {screen === 'session' && (
        <LessonBoundary p={p} onRecover={() => setLessonEpoch((e) => e + 1)}>
          <SessionScreen key={lessonEpoch} />
        </LessonBoundary>
      )}
      {screen === 'review' && <WeeklyReviewScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'm0spike' && <M0SpikeScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  boot: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
