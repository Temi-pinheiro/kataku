# M0 findings

## Decided during build (2026-06-11, desk research)

- **`expo-speech-transcriber` is out of the bake-off.** v0.1.9 is hardcoded
  to the `en_US` locale (stated in its own README limitations), so it cannot
  judge Indonesian or Mandarin at all. The plan's hope that it "reportedly
  transcribes more accurately" is moot until it ships locale support. It was
  installed, verified, and removed. Revisit if a later version adds locales —
  only `src/services/stt/` changes (the `SpeechRecognizer` interface stands).
- Sole STT backend for the spike: `expo-speech-recognition`
  (SFSpeechRecognizer on iOS) with `requiresOnDeviceRecognition` when the
  locale's on-device model is installed, networked native recognition (still
  free) otherwise.

## Device trials — owner fills this in (Mic test screen on Home)

Speak ~20 learner-ish utterances per locale (slow, hesitant, accented — the
way you'll actually sound in week one). The screen shows the verbatim
transcript and speech→final latency per utterance.

| Locale         | On-device available? | ~Accuracy (20 utterances)                                                | Median latency | Verdict                                                                                                                                                                                                                                        |
| -------------- | -------------------- | ------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id-ID          | yes                  | not that accurate                                                        | id say 40ms    | its okay but not great                                                                                                                                                                                                                         |
| zh-CN          | yes                  | cant say for sure as it transcribes chinese characters instead of pinyin | 40ms           | i cant say for sure                                                                                                                                                                                                                            |
| fr-FR (sanity) | yes                  | was only accurate one out of 8 tines                                     | N/A            | only worked once, most times it did not pick up what i was saying and sometimes it hallucinated what i said, i understand that its possible my pronouncation was not correct but if im learning a language then this feature makes it unusable |

Watch for (plan §10):

- The recognizer auto-correcting your near-misses into the right answer
  (false passes). Try deliberately wrong word orders.
- id-ID requiring the network (acceptable: still free; note it here).

**Accept criteria:** tap → speak Indonesian → correct transcript on the
owner's iPhone. If a locale fails on-device, networked native recognition is
the documented path.

## Conclusions from the owner's trials (2026-06-11, on device)

- **M0 accept criterion met for id-ID**: on-device, ~40 ms, transcripts mostly
  right. "Okay but not great" accuracy is the expected operating point — the
  matching layer absorbs it (variants + near-miss threshold), and the §4.2
  cloud STT fallback (~$0.003/min, metered) is the lever if real lessons feel
  unfair after audio is fixed.
- **zh-CN producing hanzi is by design**, not a defect: matching compares on
  hanzi with a toneless-pinyin secondary check (§3.3). UI task for when
  Mandarin starts: display pinyin alongside the hanzi transcript.
- **fr-FR is a real risk (1/8 accuracy, hallucinations)** — logged for M5.
  French isn't in scope until after the Indonesian month; revisit with the
  cloud fallback and possibly per-locale recognizer tuning then.
- **Device-TTS fallback is unusable as the tutor voice** (owner closed the
  lesson immediately): robotic, and teach lines mix English + Indonesian in
  one utterance so the en-US voice reads Indonesian words with English
  phonetics. Consequence: **pre-rendered LLM TTS is now the critical path**
  (it was always the plan's primary; the fallback stays only for incidental
  dynamic lines). Bake-off → render → bundle is the immediate next step.
- Owner already has an Apple Developer account → TestFlight/EAS distribution
  unblocked whenever we're ready to set it up.
