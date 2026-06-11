import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { BigButton } from '../components/BigButton';
import { DEFAULT_SETTINGS, useApp, type Settings } from '../store';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { exportProgress, getSetting, setSetting, spendEvents } from '../db';
import { formatUsd, monthToDateUsd } from '../lib/cost/meter';
import { getOpenAIKey, setOpenAIKey } from '../services/keys';

const THEME_OPTIONS: { value: Settings['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export function SettingsScreen() {
  const { setScreen, settings, setSettings } = useApp();
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const [mtd, setMtd] = useState<string>('…');
  const [keyDraft, setKeyDraft] = useState('');
  const [keyPresent, setKeyPresent] = useState(false);

  useEffect(() => {
    getOpenAIKey().then((k) => setKeyPresent(Boolean(k)));
  }, []);

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
        <SymbolView name="chevron.left" size={16} tintColor={p.dim} />
        <Text style={styles.backText}>home</Text>
      </Pressable>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.section}>Appearance</Text>
      <View style={styles.segments}>
        {THEME_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => {
              Haptics.selectionAsync();
              update({ theme: opt.value });
            }}
            style={[styles.segment, settings.theme === opt.value && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, settings.theme === opt.value && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Teacher</Text>
      <View style={styles.keyCard}>
        <Text style={styles.label}>OpenAI API key</Text>
        <Text style={styles.rowValue}>
          {keyPresent ? 'saved in the device keychain' : 'powers the live teacher and its voice'}
        </Text>
        <TextInput
          style={styles.keyInput}
          value={keyDraft}
          onChangeText={setKeyDraft}
          placeholder={keyPresent ? 'paste to replace…' : 'sk-…'}
          placeholderTextColor={p.faint}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        {keyDraft.trim().length > 0 && (
          <BigButton
            label="Save key"
            small
            onPress={async () => {
              await setOpenAIKey(keyDraft);
              setKeyDraft('');
              setKeyPresent(true);
            }}
          />
        )}
      </View>

      <Text style={styles.section}>Lesson</Text>
      <Row styles={styles} label="Think time" value={`${settings.thinkSeconds}s`}>
        <Stepper styles={styles} p={p} onMinus={() => bumpThink(-1)} onPlus={() => bumpThink(1)} />
      </Row>
      <Pressable
        style={styles.row}
        onPress={() => {
          Haptics.selectionAsync();
          setScreen('session');
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Classic drill deck</Text>
          <Text style={styles.rowValue}>the structured prompt lessons — fully offline</Text>
        </View>
        <SymbolView name="chevron.right" size={14} tintColor={p.faint} />
      </Pressable>

      <Text style={styles.section}>Coach & spend</Text>
      <Row styles={styles} label="AI coach" value="≈$1–2/mo">
        <Switch
          value={settings.coachEnabled}
          onValueChange={(v) => update({ coachEnabled: v })}
          trackColor={{ true: p.accent }}
        />
      </Row>
      <Row styles={styles} label="Soft cap" value={`$${settings.monthlyCapUsd}/mo`}>
        <Stepper styles={styles} p={p} onMinus={() => bumpCap(-1)} onPlus={() => bumpCap(1)} />
      </Row>
      <Row styles={styles} label="Spent this month" value="">
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
        <SymbolView name="chevron.right" size={14} tintColor={p.faint} />
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

type Styles = ReturnType<typeof makeStyles>;

function Row({ styles, label, value, children }: { styles: Styles; label: string; value: string; children: React.ReactNode }) {
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

function Stepper({ styles, p, onMinus, onPlus }: { styles: Styles; p: Palette; onMinus: () => void; onPlus: () => void }) {
  const tap = (fn: () => void) => () => {
    Haptics.selectionAsync();
    fn();
  };
  return (
    <View style={styles.stepper}>
      <Pressable onPress={tap(onMinus)} style={styles.step} hitSlop={8}>
        <SymbolView name="minus" size={16} tintColor={p.text} />
      </Pressable>
      <Pressable onPress={tap(onPlus)} style={styles.step} hitSlop={8}>
        <SymbolView name="plus" size={16} tintColor={p.text} />
      </Pressable>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg, paddingHorizontal: space.l, paddingTop: 72 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: space.m },
    backText: { color: p.dim, fontSize: type.small },
    title: { color: p.text, fontSize: type.giant, fontWeight: '800', marginBottom: space.s },
    section: {
      color: p.faint,
      fontSize: type.caption,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      marginTop: space.l,
      marginBottom: space.s,
    },
    segments: {
      flexDirection: 'row',
      backgroundColor: p.card,
      borderRadius: radii.m,
      padding: 4,
      gap: 4,
    },
    segment: { flex: 1, paddingVertical: 10, borderRadius: radii.s, alignItems: 'center' },
    segmentActive: { backgroundColor: p.raised },
    segmentText: { color: p.dim, fontSize: type.small, fontWeight: '600' },
    segmentTextActive: { color: p.text, fontWeight: '700' },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: p.card,
      borderRadius: radii.m,
      padding: space.m,
      marginBottom: space.s,
      minHeight: 60,
    },
    label: { color: p.text, fontSize: type.body },
    rowValue: { color: p.faint, fontSize: type.caption, marginTop: 2 },
    value: { color: p.accent, fontSize: type.body, fontWeight: '700' },
    keyCard: { backgroundColor: p.card, borderRadius: radii.m, padding: space.m, gap: space.s },
    keyInput: {
      backgroundColor: p.raised,
      borderRadius: radii.s,
      paddingHorizontal: space.m,
      paddingVertical: 12,
      color: p.text,
      fontSize: type.small,
    },
    stepper: { flexDirection: 'row', gap: space.s },
    step: {
      width: 44,
      height: 44,
      borderRadius: radii.s,
      backgroundColor: p.raised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    note: { color: p.faint, fontSize: type.caption, textAlign: 'center', marginTop: space.s },
  });
