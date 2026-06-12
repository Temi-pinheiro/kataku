# Kataku — design brief

A note from the owner to you, the designer. This is not a feature list —
it's what the app is trying to *feel like*, told through its flows. The
companion document `design-principles.md` is the existing contract (it
came out of a painful first round where the UI was so plain it read as
broken); this brief extends it. Where the two seem to disagree, ask me.

## 1. What Kataku is

Kataku is a private language tutor that lives in my pocket. One user —
me — learning Indonesian in the middle of an Indonesian life, with
Mandarin, Japanese, French, Italian and Spanish behind it. The method is
Michel Thomas: the teacher carries all the responsibility, the learner
just speaks, and relaxation is a learning condition — a tense student
learns nothing. Success feels like this: I open the app for ten minutes,
say things out loud I couldn't say yesterday, get corrected so gently I
barely notice it happening, and leave feeling slightly larger. The app
should feel like sitting across from an endlessly patient teacher who is
delighted I showed up — never like using software, and never, ever like
taking a test.

## 2. The person using it

Design for one specific person until told otherwise:

- I use it **one-handed, often while walking** — through Bali streets, in
  hard tropical daylight. Both dark and light themes exist; the light one
  has to survive direct sun, the dark one late evenings. Everything
  important must be reachable with a thumb and readable at arm's length.
- Sittings are **short and frequent** — ten or fifteen minutes, several
  times a day, often interrupted mid-sentence by real life. The app must
  make returning effortless and leaving consequence-free.
- I already speak conversational Spanish and some French, so I know what
  a good teacher sounds like. **Voice naturalness is make-or-break**: I
  have closed apps forever over one robotic voice or one false
  correction. The visual design has to live up to the audio — calm,
  warm, unhurried.
- I read English perfectly. The app never needs to speak English to me,
  and it never does — English is quiet text; the target language is the
  only thing that ever has a voice.

## 3. The flows

### Opening the app

Home is a **menu with one suggestion** — never a gate. The modes are
always there, one tap away: the teacher, conversation, the weekly
review, the offline drill deck tucked behind settings. Above them floats
a single suggestion chip — "Continue week 3 with the teacher", "Try the
warung conversation", "Your weekly review is ready". It knows where I am
in the six-month protocol and offers the next right thing. But it is a
shortcut, not an assignment: ignoring it costs nothing, there is no
streak to protect, no overdue badge, no guilt. If I did nothing
yesterday, Home greets me exactly as warmly as if I'd done five sessions.

### A teacher-chat exchange (the primary lesson)

The lesson is a conversation with the teacher, text-first, and it has a
strict **hierarchy of attention** — this typography is owner-specced and
settled:

1. The **taught word or phrase is the visual king**: it sits in its own
   small card, boldest and largest thing in the chat, with a play button
   on the card itself. Tapping it speaks *exactly the words on that
   card* — never the surrounding sentence — in the tutor's voice, at
   teaching pace: each word given a beat of air, room to be heard.
2. The **"now say:" cue is the clear second voice** — visibly smaller
   than the taught text but unmistakably a prompt. (Today the taught
   text sits at 20 against the cue's 16; keep at least that visible a
   step whatever numbers you land on.)
3. **Verdict lines are small, semibold, colored by result** — green for
   yes, muted apricot for close, slate for not-yet. One step above the
   ambient text, never shouting. A miss is information, not failure.
4. **English narration sits quiet and ambient on the background** — flat
   text, no bubbles, no boxes. I read it without effort; it should feel
   like the teacher's voice in the margins, not content competing for
   the stage.

The rhythm of an exchange: the teacher introduces a word (card appears,
I tap, I hear it breathe), sets up a sentence in plain English, then
cues me — *now say: I want to eat now*. I tap the mic — a soft tone and
a light tap of haptic say "I'm listening" — and speak. My words land in
the input field as I say them, editable, mine to correct before sending.
The teacher thinks (pulsing dots, the only motion on screen), then the
verdict lands quietly in color, and the next cue is already waiting.
A tiny month-to-date spend figure lives in the corner — honest, never
alarmed. If audio can't be fetched, nothing barks: silence, plus one
quiet line that the text has everything. **There is no robot fallback
voice and there never will be.**

For Mandarin and Japanese the cards are dual-script: I **see** pinyin or
romaji, I **hear** the native script spoken. Reading is an aid here, not
a subject.

### A conversation-mode session (the only voice-to-voice surface)

This is where the training wheels come off — full native pace, all
spoken. It opens with a one-screen picker: scenario cards (a warung
order, a driver negotiation — real situations, each with a stated goal)
and a mood toggle, gentle or normal. One big button: start talking.

Then the screen becomes a stage with one thing on it at a time. The
partner thinks (dots), speaks (their line appears large and centered as
the voice plays), and then — this matters more than anything else on
this screen — **the app waits before listening**. A couple of seconds of
breathing room, and only when the mic is *genuinely* capturing does the
listening orb appear, with its tone and a firmer haptic pulse. What you
see is always what's true: a visible orb with a dead mic behind it is
the worst lie this app can tell.

The orb moves with my actual voice level, and my words fade in beneath
it, big and teal — my speech made visible, word by word, exactly as a
native listener would have parsed it. And the partner is **patient to a
fault**: a hard floor before anything can end the turn, long windows of
silence tolerated without comment, because beginners pause mid-sentence
to build the next clause — that pause IS the method. I end the utterance:
by finishing my thought, or by tapping the orb. In my words: "a person
that keeps interrupting you and also does not let you speak is not very
realistic." Corrections arrive as recasts — the partner naturally
rephrases what I fumbled inside their next line, the conversation never
stops to scold. When I choose to end it: "7 turns. Yours." and a short
written debrief — warm, specific, in English on screen, never spoken.

### The weekly review

The emotional centerpiece, in strict order of impact: first, the
**speakable-sentences counter** — "~2,400 sentences you can now build,
up from ~900 last week." It's an estimate and says so; its job is to
make combinatorial growth *visible*, because watching your possible
sentences multiply is the deepest motivation this method has. Give that
number the reveal it deserves. Then a spoken checkpoint (ten cues, full
voice loop, a quiet score out of ten), then before/after replay — this
week's voice against the same sentence weeks ago, the single most
moving artifact the app can produce — then the honest stats: minutes,
sessions, toughest three items, what this month actually cost. It closes
with one line about next week. No grades, no red, ever. The review is a
mirror, not a report card.

### What's coming (design with room for these)

- **Pronunciation lab**: A/B replay — my attempt against the native
  render, toggled back and forth — plus syllable-level scoring bands for
  Mandarin tones. Attempt sheets and word views will want a "check my
  pronunciation" affordance.
- **Story mode**: serialized 60–120 second audio episodes, a recurring
  cast, native pace. Needs a listening screen (listen-first,
  tap-to-reveal transcript after) and an episode card with at most three
  new words previewed.
- **Live capture**: a five-second capture from Home — "I heard…" /
  "How do I say…" — for phrases caught in the street; life feeding the
  curriculum.
- **Persona voices**: conversation partners and story characters get
  their own voices; the tutor's voice stays reserved for the tutor,
  everywhere, always.
- **Mastery map**: one view-only screen of everything I own — protocol
  position as the header ("Month 2 · Week 6 — past tense"), words with
  strength shown as dots, structures written as abilities ("can talk
  about yesterday"), every word tappable to hear and drill.

## 4. The experience principles

- **Never let me speak into a void.** Every audio state is visible:
  tutor speaking, mic warming, mic live and moving with my voice. If the
  screen is still, the app is idle — anything else is a bug.
- **I end the utterance, not the OS.** Pauses are construction, not
  completion. Patience is a feature, designed in, not a timeout tuned up.
- **Motion is state, not decoration.** Transitions say "heard you /
  thinking / your turn / result" — springs, brief, one entering movement
  per state change. No idle animation except the tutor's thinking dots
  and the orb's breath. Haptics mirror the audio, never freelance.
- **Hierarchy of attention**: taught target language above all, the cue
  second, everything else ambient. One focal element per moment; the
  screen is a remote control, not a document.
- **Color is semantic.** One analogous green→teal family carries
  everything alive: green for go/pass/progress, teal exclusively for *my
  own voice* — transcripts, mic glow, resume. Muted apricot appears only
  for a near-miss, nowhere else. Slate is information. Red does not
  exist in this app.
- **Sound is designed silence.** A soft tone when the mic opens, another
  when it closes, the tutor's one voice — and otherwise nothing. Missing
  audio degrades to silence plus text. Silence is always better than a
  robot. English is never spoken aloud.
- **Pacing is pedagogy.** Taught words breathe at teaching pace; native
  speed lives in conversation mode. Slow is rendered properly, never
  stretched.
- **Leaving is always safe.** Every step persists; closing mid-sentence
  loses nothing; Home offers resume without comment. No exit modals that
  guilt, no "are you sure?" about resting.

## 5. What to never design

- **Red**, in any role. Errors are green/amber/slate information.
- **Streaks, XP, leagues, badges, daily goals, fire icons** — any
  mechanic that converts absence into debt.
- **Walls of text.** If a screen needs a paragraph to explain itself,
  the screen is wrong.
- **Dead UI** — a screen that sits inert while audio plays or a mic
  listens — and **lossy UI** — anything that paraphrases, truncates, or
  translates what I actually said instead of showing it verbatim.
- **Anything that makes me feel tested rather than taught**: visible
  countdown timers, percentage grades mid-lesson, "wrong!" moments,
  comparison to past selves framed as decline. The teacher carries the
  burden; the design must never hand it back to me.

## 6. Open questions — where I want your exploration

1. **The mastery map.** "Everything I own" as a single view — garden,
   constellation, territory? It must work offline, lead with the
   protocol position, and stay a mirror (no red, no decay-shaming). This
   is the most open canvas in the app.
2. **The suggestion chip.** How does one quiet recommendation feel
   inviting rather than assigned? Its voice, its motion when it changes,
   what ignoring it looks like.
3. **The conversation orb.** It's the partner's face during listening.
   How much personality can it carry — patience made visible, attention
   without pressure — before it becomes decoration?
4. **Story mode's listening screen.** Sixty to 120 seconds of
   audio-only attention, possibly while walking. What is on screen while
   I just listen, and how does the transcript reveal honor listen-first?
5. **The counter reveal.** The weekly speakable-sentences number is the
   emotional payload of the whole week. How should that number arrive?

Bring me flows before screens, and motion sketches before mockups — this
app is mostly time, voice, and waiting, and the stills will lie to you.
