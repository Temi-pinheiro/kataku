import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { BigButton } from '../components/BigButton';
import { DEFAULT_SETTINGS, useApp } from '../store';
import { colors, radii, space, type } from '../theme';
import { exportProgress, getSetting, setSetting, spendEvents } from '../db';
import { formatUsd, monthToDateUsd } from '../lib/cost/meter';

export function SettingsScreen() {
  const { setScreen, settings, setSettings } = useApp();
  const [mtd, setMtd] = useState<string>('…');

  useEffect(() => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    spendEvents(monthStart.toISOString())
      .then((events) => setMtd(formatUsd(monthToDateUsd(events, new Date()))))
      .catch(() => setMtd('$0.00'));
  }, []);

  const update = async (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(patch);
    await setSetting('app', JSON.stringify(next));
  };

  const bumpThink = (delta: number) =>
    update({ thinkSeconds: Math.min(10, Math.max(2, settings.thinkSeconds + delta)) });
  const bumpCap = (delta: number) =>
    update({ monthlyCapUsd: Math.min(50, Math.max(1, settings.monthlyCapUsd + delta)) });

  const onExport = async () => {
    const json = await exportProgress();
    await Share.share({ message: json }, { dialogTitle: 'Kataku progress export' });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 64 }}>
      <Pressable onPress={() => setScreen('home')} style={styles.back} hitSlop={12}>
        <SymbolView name="chevron.left" size={16} tintColor={colors.dim} />
        <Text style={styles.backText}>home</Text>
      </Pressable>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.section}>Lesson</Text>
      <Row label="Think time" value={`${settings.thinkSeconds}s`}>
        <Stepper onMinus={() => bumpThink(-1)} onPlus={() => bumpThink(1)} />
      </Row>

      <Text style={styles.section}>Coach & spend</Text>
      <Row label="AI coach" value="≈$1–2/mo">
        <Switch
          value={settings.coachEnabled}
          onValueChange={(v) => update({ coachEnabled: v })}
          trackColor={{ true: colors.accent }}
        />
      </Row>
      <Row label="Soft cap" value={`$${settings.monthlyCapUsd}/mo`}>
        <Stepper onMinus={() => bumpCap(-1)} onPlus={() => bumpCap(1)} />
      </Row>
      <Row label="Spent this month" value="">
        <Text style={styles.value}>{mtd}</Text>
      </Row>

      <Text style={styles.section}>Data</Text>
      <BigButton label="Export progress (JSON)" kind="ghost" onPress={onExport} />
      <Text style={styles.note}>Voice packs, notification time, and import arrive with M3–M5.</Text>

      <Text style={styles.section}>Developer</Text>
      <Pressable
        style={styles.row}
        onPress={() => {
          Haptics.selectionAsync();
          setScreen('m0spike');
        }}
      >
        <Text style={styles.label}>Mic test (M0)</Text>
        <SymbolView name="chevron.right" size={14} tintColor={colors.faint} />
      </Pressable>
    </ScrollView>
  );
}

/** Re-hydrate persisted settings at app start. */
export async function loadPersistedSettings(): Promise<typeof DEFAULT_SETTINGS> {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(await getSetting('app', '{}')) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Stepper({ onMinus, onPlus }: { onMinus: () => void; onPlus: () => void }) {
  const tap = (fn: () => void) => () => {
    Haptics.selectionAsync();
    fn();
  };
  return (
    <View style={styles.stepper}>
      <Pressable onPress={tap(onMinus)} style={styles.step} hitSlop={8}>
        <SymbolView name="minus" size={16} tintColor={colors.text} />
      </Pressable>
      <Pressable onPress={tap(onPlus)} style={styles.step} hitSlop={8}>
        <SymbolView name="plus" size={16} tintColor={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.l, paddingTop: 72 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: space.m },
  backText: { color: colors.dim, fontSize: type.small },
  title: { color: colors.text, fontSize: type.giant, fontWeight: '800', marginBottom: space.s },
  section: {
    color: colors.faint,
    fontSize: type.caption,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: space.l,
    marginBottom: space.s,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.m,
    padding: space.m,
    marginBottom: space.s,
    minHeight: 60,
  },
  label: { color: colors.text, fontSize: type.body },
  rowValue: { color: colors.faint, fontSize: type.caption, marginTop: 2 },
  value: { color: colors.accent, fontSize: type.body, fontWeight: '700' },
  stepper: { flexDirection: 'row', gap: space.s },
  step: {
    width: 44,
    height: 44,
    borderRadius: radii.s,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { color: colors.faint, fontSize: type.caption, textAlign: 'center', marginTop: space.s },
});
