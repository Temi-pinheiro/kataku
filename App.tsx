import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import packJson from './content/id/foundation.json';
import { useApp } from './src/store';
import { colors } from './src/theme';
import type { CoursePack } from './src/lib/content/types';
import { loadPack, openDb } from './src/db';
import { teachingAudio } from './src/services/instances';
import { configureAudioSession } from './src/services/audio';
import { HomeScreen } from './src/screens/HomeScreen';
import { SessionScreen } from './src/screens/SessionScreen';
import { WeeklyReviewScreen } from './src/screens/WeeklyReviewScreen';
import { SettingsScreen, loadPersistedSettings } from './src/screens/SettingsScreen';
import { M0SpikeScreen } from './src/screens/M0SpikeScreen';

const PACK = packJson as unknown as CoursePack;

export default function App() {
  const { screen, setSettings } = useApp();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await openDb();
      const row = await db.getFirstAsync<{ pack_version: number }>(
        "SELECT pack_version FROM language WHERE code = 'id'",
      );
      if ((row?.pack_version ?? -1) !== PACK.version) {
        await loadPack(PACK);
      }
      setSettings(await loadPersistedSettings());
      await teachingAudio.loadPackIndex('id');
      await configureAudioSession();
      setReady(true);
    })().catch((e) => {
      console.error('init failed', e);
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      {screen === 'home' && <HomeScreen />}
      {screen === 'session' && <SessionScreen />}
      {screen === 'review' && <WeeklyReviewScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'm0spike' && <M0SpikeScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bg },
  boot: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
});
