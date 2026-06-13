import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { BigButton } from '../components/BigButton';
import { DEFAULT_SETTINGS, useApp, type Settings } from '../store';
import { hasPack } from '../packs';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { exportProgress, getSetting, setSetting, spendEvents } from '../db';
import { formatUsd, monthToDateUsd } from '../lib/cost/meter';
import {
  getAnthropicKey,
  getElevenLabsKey,
  getElevenLabsVoice,
  getOpenAIKey,
  setAnthropicKey,
  setElevenLabsKey,
  setElevenLabsVoice,
  setOpenAIKey,
} from '../services/keys';

/** Think time is stored as seconds; the UI offers three calm presets. */
const THINK_PRESETS = [
  { value: 8, label: 'Generous' },
  { value: 4, label: 'Normal' },
  { value: 2, label: 'Brisk' },
] as const;
const thinkLabel = (s: number) => (s >= 7 ? 8 : s <= 3 ? 2 : 4);

export function SettingsScreen() {
  const { setScreen, settings, setSettings, language } = useApp();
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);
  const [mtd, setMtd] = useState<string>('…');
  const [mtdNum, setMtdNum] = useState(0);

  useEffect(() => {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    spendEvents(monthStart.toISOString())
      .then((events) => {
        const n = monthToDateUsd(events, new Date());
        setMtdNum(n);
        setMtd(formatUsd(n));
      })
      .catch(() => setMtd('$0.00'));
  }, []);

  const update = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(patch);
    await setSetting('app', JSON.stringify(next));
  };

  const bumpCap = (delta: number) =>
    update({ monthlyCapUsd: Math.min(50, Math.max(1, settings.monthlyCapUsd + delta)) });

  const onExport = async () => {
    const json = await exportProgress();
    await Share.share({ message: json }, { dialogTitle: 'Kataku progress export' });
  };

  const capPct = Math.min(100, (mtdNum / settings.monthlyCapUsd) * 100);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 64 }}>
      <Pressable onPress={() => setScreen('home')} style={styles.back} hitSlop={12}>
        <SymbolView name="chevron.left" size={16} tintColor={p.dim} />
        <Text style={styles.backText}>home</Text>
      </Pressable>
      <Text style={styles.title}>Settings</Text>

      {/* Think time — never a penalty, only when a gentle hand arrives. */}
      <Text style={styles.section}>Think time</Text>
      <View style={styles.card}>
        <Segmented
          styles={styles}
          options={THINK_PRESETS.map((t) => ({ value: String(t.value), label: t.label }))}
          value={String(thinkLabel(settings.thinkSeconds))}
          onChange={(v) => update({ thinkSeconds: Number(v) })}
        />
        <Text style={styles.cardNote}>
          How long the teacher waits in silence before offering a nudge. Pauses are never penalised — this only sets
          when a gentle hand arrives.
        </Text>
      </View>

      {/* Coach — mood + speaking pace + the Tier-1 correction coach. */}
      <Text style={styles.section}>Coach</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Default mood</Text>
        <Text style={styles.cardNote}>how conversations start — you can still switch per scene</Text>
        <Segmented
          styles={styles}
          options={[
            { value: 'gentle', label: 'Gentle' },
            { value: 'normal', label: 'Normal' },
          ]}
          value={settings.defaultMood}
          onChange={(v) => update({ defaultMood: v as Settings['defaultMood'] })}
        />
        <View style={{ height: space.m }} />
        <Text style={styles.label}>Speaking pace</Text>
        <Text style={styles.cardNote}>a beat of air between taught words — native speed lives in conversation</Text>
        <Segmented
          styles={styles}
          options={[
            { value: 'slow', label: 'Slow' },
            { value: 'teaching', label: 'Teaching' },
            { value: 'natural', label: 'Natural' },
          ]}
          value={settings.speakingPace}
          onChange={(v) => update({ speakingPace: v as Settings['speakingPace'] })}
        />
      </View>
      <Row styles={styles} label="AI coach" value="≈$1–2/mo">
        <Switch
          value={settings.coachEnabled}
          onValueChange={(v) => update({ coachEnabled: v })}
          trackColor={{ true: p.accent }}
        />
      </Row>

      {/* Spend — honest, never alarming; a soft cap, no hard cutoff. */}
      <Text style={styles.section}>Spend</Text>
      <View style={styles.card}>
        <View style={styles.spendRow}>
          <Text style={styles.spendValue}>{mtd}</Text>
          <Text style={styles.spendCap}>of ${settings.monthlyCapUsd} soft cap</Text>
        </View>
        <View style={styles.meterTrack}>
          <View style={[styles.meterFill, { width: `${capPct}%` }]} />
        </View>
        <View style={{ height: space.m }} />
        <Row styles={styles} label="Soft cap" value={`$${settings.monthlyCapUsd}/mo`} bare>
          <Stepper styles={styles} p={p} onMinus={() => bumpCap(-1)} onPlus={() => bumpCap(1)} />
        </Row>
        <View style={styles.toggleRow}>
          <Text style={styles.label}>Show running cost in lessons</Text>
          <Switch
            value={settings.showSpendInLessons}
            onValueChange={(v) => update({ showSpendInLessons: v })}
            trackColor={{ true: p.accent }}
          />
        </View>
      </View>

      {/* Appearance — Auto follows the phone (iOS has no ambient-light API). */}
      <Text style={styles.section}>Appearance</Text>
      <Segmented
        styles={styles}
        options={[
          { value: 'system', label: 'Auto' },
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
        ]}
        value={settings.theme}
        onChange={(v) => update({ theme: v as Settings['theme'] })}
      />

      <Text style={styles.section}>Keys (device keychain only)</Text>
      <KeyField
        styles={styles}
        p={p}
        label="Anthropic API key"
        hint="the teacher's brain — Claude Sonnet"
        placeholder="sk-ant-…"
        get={getAnthropicKey}
        set={setAnthropicKey}
      />
      <KeyField
        styles={styles}
        p={p}
        label="ElevenLabs API key"
        hint="the live voice — same voice as the packs"
        placeholder="…"
        get={getElevenLabsKey}
        set={setElevenLabsKey}
      />
      <KeyField
        styles={styles}
        p={p}
        label="ElevenLabs voice ID"
        hint="from the voice's page in their library"
        placeholder="voice id…"
        secure={false}
        get={getElevenLabsVoice}
        set={setElevenLabsVoice}
      />
      <KeyField
        styles={styles}
        p={p}
        label="OpenAI API key"
        hint="fallback brain & voice, progress digest"
        placeholder="sk-…"
        get={getOpenAIKey}
        set={setOpenAIKey}
      />

      {hasPack(language) && (
        <>
          <Text style={styles.section}>More</Text>
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
        </>
      )}

      <Text style={styles.section}>Data</Text>
      <BigButton label="Export progress (JSON)" kind="ghost" onPress={onExport} />

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

      <Text style={styles.footer}>private · just you and the teacher · no account, no sync</Text>
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

function Segmented({
  styles,
  options,
  value,
  onChange,
}: {
  styles: Styles;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.segments}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(opt.value);
            }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function KeyField({
  styles,
  p,
  label,
  hint,
  placeholder,
  secure = true,
  get,
  set,
}: {
  styles: Styles;
  p: Palette;
  label: string;
  hint: string;
  placeholder: string;
  secure?: boolean;
  get: () => Promise<string | null>;
  set: (v: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [present, setPresent] = useState(false);
  useEffect(() => {
    get().then((k) => setPresent(Boolean(k)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.keyCard}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.rowValue}>{present ? 'saved ✓' : hint}</Text>
      <TextInput
        style={styles.keyInput}
        value={draft}
        onChangeText={setDraft}
        placeholder={present ? 'paste to replace…' : placeholder}
        placeholderTextColor={p.faint}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
      />
      {draft.trim().length > 0 && (
        <BigButton
          label="Save"
          small
          onPress={async () => {
            await set(draft);
            setDraft('');
            setPresent(true);
          }}
        />
      )}
    </View>
  );
}

function Row({
  styles,
  label,
  value,
  children,
  bare = false,
}: {
  styles: Styles;
  label: string;
  value: string;
  children: React.ReactNode;
  bare?: boolean;
}) {
  return (
    <View style={[styles.row, bare && styles.rowBare]}>
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
    card: { backgroundColor: p.card, borderRadius: radii.l, padding: space.m, marginBottom: space.s },
    cardNote: { color: p.dim, fontSize: type.small, lineHeight: 20, marginTop: space.s },
    segments: {
      flexDirection: 'row',
      backgroundColor: p.raised,
      borderRadius: radii.m,
      padding: 4,
      gap: 4,
    },
    segment: { flex: 1, paddingVertical: 10, borderRadius: radii.s, alignItems: 'center' },
    segmentActive: { backgroundColor: p.accent },
    segmentText: { color: p.dim, fontSize: type.small, fontWeight: '600' },
    segmentTextActive: { color: p.onAccent, fontWeight: '800' },
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
    rowBare: { backgroundColor: 'transparent', padding: 0, marginBottom: 0, minHeight: 44 },
    toggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: space.m,
    },
    label: { color: p.text, fontSize: type.body },
    rowValue: { color: p.faint, fontSize: type.caption, marginTop: 2 },
    spendRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.s },
    spendValue: { color: p.text, fontSize: type.heading, fontWeight: '800' },
    spendCap: { color: p.faint, fontSize: type.small },
    meterTrack: { height: 8, borderRadius: 4, backgroundColor: p.raised, marginTop: space.s, overflow: 'hidden' },
    meterFill: { height: 8, borderRadius: 4, backgroundColor: p.accent },
    keyCard: { backgroundColor: p.card, borderRadius: radii.m, padding: space.m, gap: space.s, marginBottom: space.s },
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
    footer: { color: p.faint, fontSize: type.caption, textAlign: 'center', marginTop: space.xl },
  });
