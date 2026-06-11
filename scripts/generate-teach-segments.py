#!/usr/bin/env python3
"""Split each item's teach_script into en/target segments (run once per
content change; output reviewed by eye, oddities pinned in OVERRIDES).
Classifier: token runs whose normalized words all belong to the pack's
vocabulary (target_texts + every expected-variant token) become 'target';
isolated vocabulary tokens that are also common English words stay 'en'
unless quoted or sentence-initial repeats — those cases live in OVERRIDES.
"""
import json
import re
import sys

PACKS = ['id', 'es', 'fr']
ENGLISH_COMMON = {'no', 'is', 'a', 'to', 'the', 'or', 'for', 'so', 'on', 'in'}

# Hand-checked segmentations where the classifier can't win (quoted single
# words that are also English words, etc.). Reviewed against the printout.
OVERRIDES: dict[str, list[dict]] = {
    'es-f-006': [
        {'text': "'Not' is", 'lang': 'en'},
        {'text': "'no'. No.", 'lang': 'target'},
        {'text': 'Put it right before the verb:', 'lang': 'en'},
        {'text': 'no quiero', 'lang': 'target'},
        {'text': "— I don't want.", 'lang': 'en'},
    ],
    'es-f-019': [
        {'text': "'Is' is", 'lang': 'en'},
        {'text': "'es'. Es. Esto es bueno", 'lang': 'target'},
        {'text': '— this is good.', 'lang': 'en'},
    ],
    # "A" here is the English article, but it sits next to a target word
    # and 'a' is Spanish vocabulary — adjacency misclassifies it.
    'es-f-009': [
        {'text': "'To go' is", 'lang': 'en'},
        {'text': "'ir'. Ir.", 'lang': 'target'},
        {'text': 'A tiny word with huge use.', 'lang': 'en'},
    ],
    'es-f-025': [
        {'text': "'Tomorrow' is", 'lang': 'en'},
        {'text': "'mañana'. Mañana.", 'lang': 'target'},
        {'text': 'A time word — so it goes at the end.', 'lang': 'en'},
    ],
}


def norm_token(tok: str) -> str:
    # Strip edge punctuation INCLUDING quotes ('saya'. → saya) but keep
    # word-internal apostrophes (c'est, aujourd'hui).
    tok = tok.lower().replace('’', "'")
    return re.sub(r'^[^\w]+|[^\w]+$', '', tok)


def vocab_for(pack: dict) -> set:
    vocab = set()
    for unit in pack['units']:
        for lesson in unit['lessons']:
            for item in lesson['items']:
                for t in item['target_text'].split():
                    vocab.add(norm_token(t))
            for prompt in lesson['prompts']:
                for variant in prompt['expected']:
                    for t in variant.split():
                        vocab.add(norm_token(t))
    vocab.discard('')
    return vocab


def split_script(script: str, vocab: set) -> list[dict]:
    words = script.split(' ')
    classes = []
    for w in words:
        n = norm_token(w)
        classes.append(bool(n) and n in vocab)
    # Isolated vocab word that is also a common English word → English.
    # Cases where such a word IS the target ("'no'. No." in Spanish) are
    # pinned in OVERRIDES — adjacency can't decide them reliably.
    for i, w in enumerate(words):
        if not classes[i]:
            continue
        n = norm_token(w)
        prev_t = i > 0 and classes[i - 1]
        next_t = i + 1 < len(words) and classes[i + 1]
        if n in ENGLISH_COMMON and not prev_t and not next_t:
            classes[i] = False
    segments = []
    cur_words, cur_class = [], classes[0] if words else False
    for w, c in zip(words, classes):
        if c == cur_class:
            cur_words.append(w)
        else:
            segments.append({'text': ' '.join(cur_words), 'lang': 'target' if cur_class else 'en'})
            cur_words, cur_class = [w], c
    if cur_words:
        segments.append({'text': ' '.join(cur_words), 'lang': 'target' if cur_class else 'en'})
    # Merge segments that are only punctuation/dashes into the previous one.
    merged = []
    for seg in segments:
        if merged and not re.search(r'\w', seg['text']):
            merged[-1]['text'] += ' ' + seg['text']
        else:
            merged.append(seg)
    return merged


def split_target_sentences(segments: list[dict]) -> list[dict]:
    """Each sentence of a target segment becomes its own clip, so the app
    controls the beat between the first hearing and the echo ("mau … mau"
    instead of the TTS rushing "mau mau")."""
    out: list[dict] = []
    for seg in segments:
        if seg['lang'] != 'target':
            out.append(seg)
            continue
        parts = [p for p in re.split(r'(?<=[.!?])\s+', seg['text']) if p.strip()]
        for part in parts:
            out.append({'text': part, 'lang': 'target'})
    return out


def main() -> None:
    review = []
    for lang in PACKS:
        path = f'content/{lang}/foundation.json'
        pack = json.load(open(path))
        vocab = vocab_for(pack)
        for unit in pack['units']:
            for lesson in unit['lessons']:
                for item in lesson['items']:
                    segs = OVERRIDES.get(item['id']) or split_script(item['teach_script'], vocab)
                    segs = split_target_sentences(segs)
                    item['teach_segments'] = segs
                    review.append((item['id'], segs))
        json.dump(pack, open(path, 'w'), indent=2, ensure_ascii=False)
        open(path, 'a').write('\n')
    for item_id, segs in review:
        line = ' | '.join(f"[{s['lang'][:2].upper()}] {s['text']}" for s in segs)
        print(f'{item_id}: {line}')


if __name__ == '__main__':
    sys.exit(main())
