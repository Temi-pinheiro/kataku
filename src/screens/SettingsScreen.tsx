import React, { useEffect, useState } from 'react';
import { Share, StyleSheet, Switch, Text, View } from 'react-native';
import { BigButton } from '../components/BigButton';
import { DEFAULT_SETTINGS, useApp } from '../store';
import { colors, type } from '../theme';
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
    <View style={styles.screen}>
      <Text style={styles.back} onPress={() => setScreen('home')}>
        ‹ home
      </Text>
      <Text style={styles.title}>Settings</Text>

      <Row label={`Think time: ${settings.thinkSeconds}s`}>
        <Stepper onMinus={() => bumpThink(-1)} onPlus={() => bumpThink(1)} />
      </Row>

      <Row label="AI coach (≈$1–2/mo)">
        <Switch
          value={settings.coachEnabled}
          onValueChange={(v) => update({ coachEnabled: v })}
          trackColor={{ true: colors.accent }}
        />
      </Row>

      <Row label={`Soft cap: $${settings.monthlyCapUsd}/mo`}>
        <Stepper onMinus={() => bumpCap(-1)} onPlus={() => bumpCap(1)} />
      </Row>

      <Row label="Spend this month">
        <Text style={styles.value}>{mtd}</Text>
      </Row>

      <BigButton label="Export progress (JSON)" kind="ghost" onPress={onExport} />
      <Text style={styles.dim}>Voice packs, notification time, and import arrive with M3–M5.</Text>
    </View>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Stepper({ onMinus, onPlus }: { onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.step} onPress={onMinus}>
        −
      </Text>
      <Text style={styles.step} onPress={onPlus}>
        +
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 72 },
  back: { color: colors.dim, fontSize: type.small, marginBottom: 12 },
  title: { color: colors.text, fontSize: type.title, fontWeight: '700', marginBottom: 24 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 18,
    marginBottom: 10,
  },
  label: { color: colors.text, fontSize: type.body },
  value: { color: colors.accent, fontSize: type.body, fontWeight: '700' },
  stepper: { flexDirection: 'row', gap: 10 },
  step: {
    color: colors.text,
    backgroundColor: colors.bg,
    fontSize: type.title,
    width: 44,
    height: 44,
    textAlign: 'center',
    lineHeight: 44,
    borderRadius: 10,
    overflow: 'hidden',
  },
  dim: { color: colors.dim, fontSize: type.small, marginTop: 12, textAlign: 'center' },
});
