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

| Locale | On-device available? | ~Accuracy (20 utterances) | Median latency | Verdict |
|---|---|---|---|---|
| id-ID | | | | |
| zh-CN | | | | |
| fr-FR (sanity) | | | | |

Watch for (plan §10):
- The recognizer auto-correcting your near-misses into the right answer
  (false passes). Try deliberately wrong word orders.
- id-ID requiring the network (acceptable: still free; note it here).

**Accept criteria:** tap → speak Indonesian → correct transcript on the
owner's iPhone. If a locale fails on-device, networked native recognition is
the documented path.
