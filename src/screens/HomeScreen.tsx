import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { INSTALLED_LANGUAGES, LANGUAGE_NAMES, packFor, type InstalledLanguage } from '../packs';
import { useApp } from '../store';
import { radii, space, type, type Palette } from '../theme';
import { useTheme } from '../hooks/useTheme';
import { masteredItemIds } from '../lib/scheduler/scheduler';
import { isItemOfLanguage } from '../lib/progress/chat-items';
import { roundSpeakable, speakableCountForPack } from '../lib/review/speakable';
import { stripMarks } from '../lib/teacher-markup';
import { OUTLINES } from '../content/outlines';
import { getAllMastery, getSetting, loadSessionProgress, openDb } from '../db';

const BLOCKS_PER_LESSON = 4;

interface DoneLesson {
  topic: string;
  words: string;
}
interface HomeData {
  doneToday: boolean;
  resumeStep: { lessonRef: string; step: number; total: number } | null;
  teacherResume: string | null; // a half-spoken fragment / last cue to pick up
  speakable: number;
  hasDeck: boolean;
  owned: number;
  inProgress: InstalledLanguage[]; // languages with a saved teacher chat
  done: DoneLesson[]; // earlier lessons, most recent first
}

function cleanFragment(text: string): string {
  return stripMarks(text)
    .replace(/^[+~\-–>\s]+/, '') // drop verdict/cue line markers
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 52);
}

export function HomeScreen() {
  const { setScreen, language, setLanguage } = useApp();
  const { p } = useTheme();
  const styles = React.useMemo(() => makeStyles(p), [p]);
  const [data, setData] = useState<HomeData | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const refresh = useCallback(async () => {
    const db = await openDb();
    const [mastery, saved] = await Promise.all([getAllMastery(), loadSessionProgress(language)]);
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM session WHERE language = ? AND core_completed = 1 AND started_at >= ?',
      language,
      today,
    );
    const pack = packFor(language);
    const mastered = new Set(masteredItemIds(mastery).filter((id) => isItemOfLanguage(id, language)));
    const owned = mastered.size;

    // In-progress teacher chat → the resume fragment (draft first, else last cue).
    const chatRaw = await getSetting(`teacher_chat.${language}`, '');
    const draft = await getSetting(`teacher_chat.${language}.draft`, '');
    let teacherResume: string | null = null;
    if (chatRaw) {
      try {
        const turns = JSON.parse(chatRaw) as { role: string; text: string }[];
        if (Array.isArray(turns) && turns.length > 0) {
          const lastTeacher = [...turns].reverse().find((t) => t.role === 'teacher');
          teacherResume = cleanFragment(draft || (lastTeacher ? lastTeacher.text : '')) || null;
        }
      } catch {
        teacherResume = null;
      }
    }

    // Which languages have a lesson in progress (for the picker subtitles).
    const inProgress: InstalledLanguage[] = [];
    for (const l of INSTALLED_LANGUAGES) {
      if (await getSetting(`teacher_chat.${l}`, '')) inProgress.push(l);
    }

    // Earlier lessons = the lessons before "you're here", most recent first.
    const flat: DoneLesson[] = [];
    for (const m of OUTLINES[language]) for (const w of m.weeks) for (const l of w.lessons) flat.push(l);
    const hereIdx = Math.min(flat.length - 1, Math.floor(owned / BLOCKS_PER_LESSON));
    const done = flat.slice(0, hereIdx).reverse();

    setData({
      doneToday: (row?.n ?? 0) > 0,
      resumeStep: saved ? { lessonRef: saved.lessonRef, step: saved.stepIndex + 1, total: saved.stepKeys.length } : null,
      teacherResume,
      speakable: pack ? roundSpeakable(speakableCountForPack(pack, mastered)) : owned,
      hasDeck: pack != null,
      owned,
      inProgress,
      done,
    });
  }, [language]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const d = data;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: space.m }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(300)}>
          <View style={styles.headerRow}>
            <Text style={styles.brand}>kataku</Text>
            <View style={styles.headerCluster}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setScreen('stories');
                }}
                style={styles.iconBtn}
                hitSlop={8}
              >
                <SymbolView name="book.fill" size={18} tintColor={p.dim} />
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setPickerOpen(true);
                }}
                style={styles.langBubble}
                hitSlop={8}
              >
                <Text style={styles.langCode}>{language.toUpperCase()}</Text>
                <SymbolView name="chevron.down" size={11} tintColor={p.dim} />
              </Pressable>
            </View>
          </View>
          <Text style={styles.langTitle}>{LANGUAGE_NAMES[language]}</Text>
        </Animated.View>

        {/* Resume — pick up a half-spoken lesson in one tap (R4: leaving is safe). */}
        {d?.teacherResume ? (
          <Animated.View entering={FadeInDown.delay(80).duration(300)}>
            <Pressable style={styles.resume} onPress={() => setScreen('teacher')}>
              <SymbolView name="arrow.uturn.left.circle.fill" size={26} tintColor={p.live} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle}>Pick up where you left off</Text>
                <Text style={styles.resumeMeta} numberOfLines={1}>
                  “{d.teacherResume}…”
                </Text>
              </View>
              <SymbolView name="chevron.right" size={14} tintColor={p.faint} />
            </Pressable>
          </Animated.View>
        ) : null}

        {d?.resumeStep ? (
          <Pressable style={styles.resume} onPress={() => setScreen('session')}>
            <SymbolView name="play.circle.fill" size={26} tintColor={p.live} />
            <View style={{ flex: 1 }}>
              <Text style={styles.resumeTitle}>Resume deck {d.resumeStep.lessonRef}</Text>
              <Text style={styles.resumeMeta}>
                step {d.resumeStep.step} of {d.resumeStep.total}
              </Text>
            </View>
            <SymbolView name="chevron.right" size={14} tintColor={p.faint} />
          </Pressable>
        ) : null}

        <Animated.View entering={FadeInDown.delay(140).duration(300)}>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && { transform: [{ scale: 0.985 }] }]}
            onPress={() => {
              Haptics.selectionAsync();
              setScreen('teacher');
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>Sit with the teacher</Text>
              <Text style={styles.ctaMeta}>build sentences out loud, one block at a time</Text>
            </View>
            <SymbolView name="bubble.left.and.text.bubble.right.fill" size={48} tintColor={p.onAccent} />
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(170).duration(300)}>
          <Pressable
            style={({ pressed }) => [styles.convo, pressed && { transform: [{ scale: 0.985 }] }]}
            onPress={() => {
              Haptics.selectionAsync();
              setScreen('conversation');
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.convoTitle}>Have a conversation</Text>
              <Text style={styles.convoMeta}>all voice, both ways — it corrects by rephrasing</Text>
            </View>
            <SymbolView name="waveform.circle.fill" size={40} tintColor={p.live} />
          </Pressable>
        </Animated.View>

        {/* Earlier lessons — revisit anything; "all lessons" opens Your map. */}
        {d && d.done.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(190).duration(300)}>
            <View style={styles.stripHead}>
              <Text style={styles.stripTitle}>Earlier lessons</Text>
              <Pressable onPress={() => setScreen('map')} hitSlop={8}>
                <Text style={styles.stripLink}>all lessons →</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingRight: space.l }}>
              {d.done.map((l, i) => (
                <Pressable key={i} style={styles.lessonCard} onPress={() => setScreen('teacher')}>
                  <Text style={styles.lessonTopic} numberOfLines={1}>
                    {l.topic}
                  </Text>
                  <Text style={styles.lessonWords} numberOfLines={2}>
                    {l.words}
                  </Text>
                  <View style={styles.revisit}>
                    <SymbolView name="arrow.counterclockwise" size={12} tintColor={p.live} />
                    <Text style={styles.revisitText}>revisit</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(210).duration(300)} style={styles.secondaryRow}>
          <Pressable style={styles.secondary} onPress={() => setScreen('review')}>
            <Text style={styles.secondaryValue}>
              {d ? `${d.hasDeck ? '~' : ''}${d.speakable.toLocaleString()}` : '—'}
            </Text>
            <Text style={styles.secondaryLabel}>{d?.hasDeck === false ? 'words you own' : 'sentences you can say'}</Text>
            <Text style={styles.secondaryLink}>weekly review →</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setScreen('settings')}>
            <SymbolView name="gearshape.fill" size={26} tintColor={p.dim} />
            <Text style={[styles.secondaryLabel, { marginTop: space.s }]}>think time · coach · spend</Text>
            <Text style={styles.secondaryLink}>settings →</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>

      {/* Language picker popover — replaces the always-visible chip row. */}
      {pickerOpen && (
        <Pressable style={styles.scrim} onPress={() => setPickerOpen(false)}>
          <Animated.View entering={FadeIn.duration(140)} style={styles.picker}>
            {INSTALLED_LANGUAGES.map((l) => {
              const current = l === language;
              const sub = current ? 'current' : d?.inProgress.includes(l) ? 'in progress' : 'resting';
              return (
                <Pressable
                  key={l}
                  style={[styles.pickerRow, current && styles.pickerRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setLanguage(l);
                    setPickerOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerName}>{LANGUAGE_NAMES[l]}</Text>
                    <Text style={styles.pickerSub}>{sub}</Text>
                  </View>
                  <View style={[styles.pickerBadge, current && styles.pickerBadgeActive]}>
                    <Text style={[styles.pickerCode, current && styles.pickerCodeActive]}>{l.toUpperCase()}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Animated.View>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg, paddingHorizontal: space.l, paddingTop: 76 },
    brand: { color: p.faint, fontSize: type.caption, letterSpacing: 3, textTransform: 'uppercase' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerCluster: { flexDirection: 'row', alignItems: 'center', gap: space.s },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: p.card,
      borderWidth: 1,
      borderColor: p.stroke,
      alignItems: 'center',
      justifyContent: 'center',
    },
    langBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 42,
      paddingHorizontal: 14,
      borderRadius: 21,
      backgroundColor: p.card,
      borderWidth: 1,
      borderColor: p.stroke,
    },
    langCode: { color: p.text, fontSize: type.small, fontWeight: '800' },
    langTitle: { color: p.text, fontSize: type.hero, fontWeight: '800', marginTop: space.m, letterSpacing: -0.5 },

    resume: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.m,
      backgroundColor: p.accentDeep,
      borderRadius: radii.m,
      borderWidth: 1,
      borderColor: p.live,
      padding: space.m,
    },
    resumeTitle: { color: p.text, fontSize: type.body, fontWeight: '700' },
    resumeMeta: { color: p.dim, fontSize: type.small, marginTop: 1 },

    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.m,
      backgroundColor: p.accent,
      borderRadius: radii.l,
      padding: space.l,
      minHeight: 110,
    },
    ctaTitle: { color: p.onAccent, fontSize: type.title, fontWeight: '800' },
    ctaMeta: { color: p.onAccent, opacity: 0.78, fontSize: type.small, marginTop: 4 },

    convo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.m,
      backgroundColor: p.card,
      borderRadius: radii.l,
      borderWidth: 1,
      borderColor: p.stroke,
      padding: space.l,
      minHeight: 88,
    },
    convoTitle: { color: p.text, fontSize: type.heading, fontWeight: '800' },
    convoMeta: { color: p.dim, fontSize: type.small, marginTop: 4 },

    stripHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.s },
    stripTitle: { color: p.faint, fontSize: type.caption, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '700' },
    stripLink: { color: p.dim, fontSize: type.small, fontWeight: '600' },
    lessonCard: {
      width: 150,
      backgroundColor: p.card,
      borderRadius: radii.m,
      borderWidth: 1,
      borderColor: p.stroke,
      padding: space.m,
      gap: 4,
    },
    lessonTopic: { color: p.text, fontSize: type.cue, fontWeight: '800' },
    lessonWords: { color: p.dim, fontSize: type.small, minHeight: 36 },
    revisit: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    revisitText: { color: p.live, fontSize: type.caption, fontWeight: '700' },

    secondaryRow: { flexDirection: 'row', gap: space.m, marginTop: space.s },
    secondary: {
      flex: 1,
      backgroundColor: p.card,
      borderRadius: radii.l,
      padding: space.m,
      minHeight: 116,
      justifyContent: 'space-between',
    },
    secondaryValue: { color: p.accent, fontSize: type.title, fontWeight: '800' },
    secondaryLabel: { color: p.dim, fontSize: type.caption, lineHeight: 16 },
    secondaryLink: { color: p.faint, fontSize: type.caption, marginTop: space.s },

    scrim: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 120, paddingHorizontal: space.l },
    picker: { width: 256, backgroundColor: p.card, borderRadius: radii.l, borderWidth: 1, borderColor: p.stroke, padding: space.s, gap: 2 },
    pickerRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, borderRadius: radii.m },
    pickerRowActive: { backgroundColor: p.accentDeep },
    pickerName: { color: p.text, fontSize: type.body, fontWeight: '700' },
    pickerSub: { color: p.faint, fontSize: type.caption, marginTop: 1 },
    pickerBadge: { backgroundColor: p.raised, borderRadius: radii.s, paddingHorizontal: 8, paddingVertical: 4 },
    pickerBadgeActive: { backgroundColor: p.accent },
    pickerCode: { color: p.dim, fontSize: type.caption, fontWeight: '800' },
    pickerCodeActive: { color: p.onAccent },
  });
