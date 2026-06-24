import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { LANGUAGE_NAMES } from '../packs';
import { useApp } from '../store';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { ttsToFile } from '../services/tts';
import { voiceEngine } from '../services/instances';
import {
  getOrGenerateVerbEntry,
  loadVerbList,
  type VerbDetailResult,
  type VerbListReason,
  type VerbListResult,
} from '../services/verbs';
import type { VerbListEntry } from '../lib/verbs/select';
import type { VerbTable } from '../lib/verbs/types';

/**
 * Verbs reference (owner ask 2026-06-23): the verbs you've actually used,
 * each with conjugations across tenses, original examples, and usage notes.
 * One screen, master→detail inside it (we resist adding screens). Only ever
 * shows verbs from your own mastery — never a dictionary dump. Detail pages
 * are generated once then cached forever (local + bundled + shared), so a
 * verb costs tokens at most once. Degrades quietly: no key / over cap / offline
 * shows a calm notice, never a block, never red (design-principles).
 */
export function VerbsScreen() {
  const { setScreen, language, settings } = useApp();
  const { p } = useTheme();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [result, setResult] = useState<VerbListResult | null>(null);
  const [selected, setSelected] = useState<VerbListEntry | null>(null);
  const [detail, setDetail] = useState<VerbDetailResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const cacheRef = useRef<Map<string, VerbDetailResult>>(new Map());
  const reqRef = useRef(0);

  const reload = useCallback(async () => {
    setResult(null);
    try {
      setResult(await loadVerbList(language, settings.monthlyCapUsd));
    } catch (e) {
      console.warn('verb list failed', e);
      setResult({ verbs: [], reason: 'empty_no_verbs', encountered: 0 });
    }
  }, [language, settings.monthlyCapUsd]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Switching language resets the open verb (the cache is per-lemma+lang anyway).
  useEffect(() => {
    setSelected(null);
    cacheRef.current.clear();
  }, [language]);

  const playLine = useCallback(
    async (text: string) => {
      try {
        voiceEngine.stop();
        const uri = await ttsToFile(text, language, 'natural');
        if (uri) await voiceEngine.play({ uri });
      } catch {
        // missing audio = silence + text (owner rule)
      }
    },
    [language],
  );

  const openVerb = useCallback(
    async (v: VerbListEntry) => {
      Haptics.selectionAsync();
      const id = ++reqRef.current;
      setSelected(v);
      const cached = cacheRef.current.get(v.lemma);
      if (cached) {
        setDetail(cached);
        setDetailLoading(false);
        return;
      }
      setDetail(null);
      setDetailLoading(true);
      try {
        const r = await getOrGenerateVerbEntry(language, v.lemma, v.glossEn, settings.monthlyCapUsd);
        cacheRef.current.set(v.lemma, r);
        if (reqRef.current === id) setDetail(r);
      } catch {
        if (reqRef.current === id) setDetail({ kind: 'error', message: 'could not load this verb' });
      } finally {
        if (reqRef.current === id) setDetailLoading(false);
      }
    },
    [language, settings.monthlyCapUsd],
  );

  const closeVerb = () => {
    reqRef.current++; // ignore any in-flight generation for the UI
    voiceEngine.stop();
    setSelected(null);
  };

  if (selected) {
    return (
      <VerbDetailView
        verb={selected}
        detail={detail}
        loading={detailLoading}
        p={p}
        styles={styles}
        onBack={closeVerb}
        onPlay={playLine}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 80 }}>
      <Pressable onPress={() => setScreen('home')} style={styles.back} hitSlop={12}>
        <SymbolView name="chevron.left" size={16} tintColor={p.dim} />
        <Text style={styles.backText}>home</Text>
      </Pressable>
      <Text style={styles.eyebrow}>{LANGUAGE_NAMES[language]}</Text>
      <Text style={styles.title}>Your verbs</Text>
      <Text style={styles.subtitle}>
        {result === null
          ? 'gathering the verbs you’ve used…'
          : result.verbs.length === 0
            ? 'verbs you use with the teacher collect here'
            : `${result.verbs.length} verb${result.verbs.length === 1 ? '' : 's'} you’ve used · weakest first`}
      </Text>

      {result === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={p.accent} />
        </View>
      ) : result.verbs.length === 0 ? (
        <EmptyState reason={result.reason} encountered={result.encountered} p={p} styles={styles} onSettings={() => setScreen('settings')} />
      ) : (
        <View style={{ marginTop: space.m }}>
          {result.verbs.map((v, i) => (
            <Animated.View key={v.lemma} entering={FadeInDown.duration(160).delay(Math.min(i, 8) * 20)}>
              <Pressable style={styles.row} onPress={() => void openVerb(v)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLemma}>{v.lemma}</Text>
                  {v.glossEn ? <Text style={styles.rowGloss}>{v.glossEn}</Text> : null}
                </View>
                <Dots n={v.familiarity} styles={styles} />
                <SymbolView name="chevron.right" size={14} tintColor={p.faint} />
              </Pressable>
            </Animated.View>
          ))}
          <Text style={styles.footer}>only verbs you’ve met — not a dictionary</Text>
        </View>
      )}
    </ScrollView>
  );
}

function VerbDetailView({
  verb,
  detail,
  loading,
  p,
  styles,
  onBack,
  onPlay,
}: {
  verb: VerbListEntry;
  detail: VerbDetailResult | null;
  loading: boolean;
  p: Palette;
  styles: ReturnType<typeof makeStyles>;
  onBack: () => void;
  onPlay: (text: string) => void;
}) {
  const entry = detail?.kind === 'ok' ? detail.entry : null;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 96 }}>
      <Pressable onPress={onBack} style={styles.back} hitSlop={12}>
        <SymbolView name="chevron.left" size={16} tintColor={p.dim} />
        <Text style={styles.backText}>verbs</Text>
      </Pressable>

      <Animated.View entering={FadeIn.duration(180)}>
        <Pressable style={styles.detailHead} onPress={() => onPlay(entry?.lemma ?? verb.lemma)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.detailLemma}>{entry?.lemma ?? verb.lemma}</Text>
            <Text style={styles.detailGloss}>{entry?.glossEn || verb.glossEn}</Text>
          </View>
          <View style={styles.playChip}>
            <SymbolView name="speaker.wave.2.fill" size={16} tintColor={p.live} />
          </View>
        </Pressable>
        {entry?.regular === true ? (
          <Text style={styles.regTag}>regular</Text>
        ) : entry?.regular === false ? (
          <Text style={[styles.regTag, styles.regTagIrr]}>irregular</Text>
        ) : null}
      </Animated.View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={p.accent} />
          <Text style={styles.loadingText}>writing the verb page…</Text>
        </View>
      ) : entry ? (
        <Animated.View entering={FadeInDown.duration(220)}>
          {entry.tables.map((t, i) => (
            <Table key={i} table={t} styles={styles} />
          ))}

          {entry.examples.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Examples</Text>
              {entry.examples.map((ex, i) => (
                <Pressable key={i} style={styles.example} onPress={() => onPlay(ex.target)}>
                  <SymbolView name="speaker.wave.2.fill" size={14} tintColor={p.live} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exTarget}>{ex.target}</Text>
                    {ex.en ? <Text style={styles.exEn}>{ex.en}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {entry.notes.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Good to know</Text>
              {entry.notes.map((n, i) => (
                <View key={i} style={styles.noteRow}>
                  <Text style={styles.noteBullet}>•</Text>
                  <Text style={styles.note}>{n}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Animated.View>
      ) : (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{detailNotice(detail)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Table({ table, styles }: { table: VerbTable; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.table}>
      <Text style={styles.tableLabel}>{table.label}</Text>
      {table.rows.map((row, i) => (
        <View key={i} style={styles.tableRow}>
          {row.map((cell, j) => (
            <Text key={j} style={[styles.cell, j === 0 && row.length > 1 ? styles.cellKey : styles.cellVal]}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function EmptyState({
  reason,
  encountered,
  p,
  styles,
  onSettings,
}: {
  reason: VerbListReason;
  encountered: number;
  p: Palette;
  styles: ReturnType<typeof makeStyles>;
  onSettings: () => void;
}) {
  const words = `${encountered} word${encountered === 1 ? '' : 's'}`;
  const showSettings = reason === 'needs_key' || reason === 'capped';
  const body =
    reason === 'needs_key'
      ? encountered > 0
        ? `You’ve used ${words} here, but spotting which are verbs needs an API key. Add one in Settings → Keys.`
        : 'Add an API key in Settings → Keys — it runs the teacher and records the words you use, which is what fills this page.'
      : reason === 'capped'
        ? 'You’ve reached your monthly spend cap, so verb detection is paused. It resumes next month, or raise the cap in Settings.'
        : reason === 'empty_no_verbs'
          ? `You’ve used ${words} so far, but no verbs among them yet — keep going with the teacher and they’ll appear.`
          : 'Use verbs with the teacher and they’ll collect here — each with its conjugations and examples to study.';
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.empty}>
      <SymbolView name="character.book.closed" size={34} tintColor={p.faint} />
      <Text style={styles.emptyText}>{body}</Text>
      {showSettings ? (
        <Pressable style={styles.emptyBtn} onPress={onSettings}>
          <SymbolView name="gearshape.fill" size={15} tintColor={p.live} />
          <Text style={styles.emptyBtnText}>Open Settings</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function Dots({ n, styles }: { n: number; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.fdot, i < n ? styles.fdotOn : styles.fdotOff]} />
      ))}
    </View>
  );
}

function detailNotice(r: VerbDetailResult | null): string {
  if (!r) return 'Couldn’t load this verb just now. Tap back and try again in a moment.';
  if (r.kind === 'no_key') return 'Add an API key in Settings, and verb pages will generate the first time you open them.';
  if (r.kind === 'capped')
    return 'You’ve reached your monthly spend cap, so new verb pages are paused. They resume next month, or raise the cap in Settings.';
  return 'Couldn’t load this verb just now. Tap back and try again in a moment.';
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg, paddingHorizontal: space.l, paddingTop: 72 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: space.m },
    backText: { color: p.dim, fontSize: type.small },
    eyebrow: { color: p.dim, fontSize: type.small },
    title: { color: p.text, fontSize: type.giant, fontWeight: '800', marginTop: 2 },
    subtitle: { color: p.dim, fontSize: type.small, marginTop: space.s },
    center: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl, gap: space.s },
    loadingText: { color: p.dim, fontSize: type.small },

    empty: { alignItems: 'center', gap: space.m, paddingVertical: space.xxl, paddingHorizontal: space.m },
    emptyText: { color: p.dim, fontSize: type.body, textAlign: 'center', lineHeight: 24 },
    emptyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s,
      paddingVertical: space.s,
      paddingHorizontal: space.m,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: p.stroke,
      backgroundColor: p.card,
    },
    emptyBtnText: { color: p.live, fontSize: type.small, fontWeight: '700' },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.m,
      paddingVertical: space.m,
      paddingHorizontal: space.m,
      backgroundColor: p.card,
      borderRadius: radii.m,
      borderWidth: 1,
      borderColor: p.stroke,
      marginBottom: space.s,
    },
    rowLemma: { color: p.text, fontSize: type.taught, fontWeight: '800' },
    rowGloss: { color: p.dim, fontSize: type.small, marginTop: 1 },
    footer: { color: p.faint, fontSize: type.caption, textAlign: 'center', marginTop: space.l },

    dots: { flexDirection: 'row', gap: 3 },
    fdot: { width: 6, height: 6, borderRadius: 3 },
    fdotOn: { backgroundColor: p.accent },
    fdotOff: { backgroundColor: p.stroke },

    detailHead: { flexDirection: 'row', alignItems: 'center', gap: space.m, marginTop: space.s },
    detailLemma: { color: p.text, fontSize: type.hero, fontWeight: '800' },
    detailGloss: { color: p.dim, fontSize: type.body, marginTop: 2 },
    playChip: {
      width: 44,
      height: 44,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.accentDeep,
    },
    regTag: {
      alignSelf: 'flex-start',
      color: p.accent,
      fontSize: type.caption,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginTop: space.s,
    },
    regTagIrr: { color: p.warn },

    table: {
      backgroundColor: p.card,
      borderRadius: radii.m,
      borderWidth: 1,
      borderColor: p.stroke,
      padding: space.m,
      marginTop: space.m,
    },
    tableLabel: {
      color: p.faint,
      fontSize: type.caption,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: space.s,
    },
    tableRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 3, gap: space.m },
    cell: { fontSize: type.body },
    cellKey: { flex: 1, color: p.dim },
    cellVal: { flex: 1.4, color: p.text, fontWeight: '600' },

    section: { marginTop: space.l },
    sectionLabel: {
      color: p.faint,
      fontSize: type.caption,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: space.s,
    },
    example: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.m,
      paddingVertical: space.s,
      paddingHorizontal: space.m,
      backgroundColor: p.card,
      borderRadius: radii.m,
      borderWidth: 1,
      borderColor: p.stroke,
      marginBottom: space.s,
    },
    exTarget: { color: p.text, fontSize: type.body, fontWeight: '600' },
    exEn: { color: p.dim, fontSize: type.small, marginTop: 1 },

    noteRow: { flexDirection: 'row', gap: space.s, marginBottom: space.s },
    noteBullet: { color: p.live, fontSize: type.body },
    note: { flex: 1, color: p.dim, fontSize: type.small, lineHeight: 20 },

    notice: {
      marginTop: space.l,
      padding: space.m,
      backgroundColor: p.missDeep,
      borderRadius: radii.m,
    },
    noticeText: { color: p.miss, fontSize: type.small, lineHeight: 20 },
  });
