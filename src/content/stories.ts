import type { InstalledLanguage } from '../packs';

/**
 * Stories (handoff F2): produced audio episodes with a synced read-along
 * transcript. Scripts are original (plan §5.3) and live here as data;
 * audio is rendered + embedded MANUALLY later (owner-gated), so a sample's
 * `audioBase` stays null for now and the player speaks each line with the
 * runtime voice (target only — English is read, never voiced). Locked
 * entries (no `lines`) are level-gated placeholders per content/stories/CATALOG.md.
 */
export type StoryLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export interface StoryLine {
  target: string; // the spoken line (native script for zh/ja)
  roman?: string; // pinyin/romaji for zh/ja read-along
  en: string; // gloss — shown, never spoken
}

export interface Story {
  id: string;
  language: InstalledLanguage;
  title: string;
  level: StoryLevel;
  description: string;
  tint: string; // placeholder-art base hue until illustrations are commissioned
  lines?: StoryLine[]; // present = playable sample; absent = level-gated (locked)
  audioBase?: string | null; // produced-track key once rendered (manual step)
}

const S = (
  language: InstalledLanguage,
  id: string,
  title: string,
  level: StoryLevel,
  description: string,
  tint: string,
  lines?: StoryLine[],
): Story => ({ language, id: `${language}-${id}`, title, level, description, tint, lines, audioBase: null });

const STORY_LIST: Story[] = [
  // ---- Indonesian (2 playable samples + leveled placeholders) ----
  S('id', 'arrival', 'Liburan ke Bali', 'Beginner', 'A vacation to the Island of Gods', '#E8945A', [
    { target: 'Selamat pagi!', en: 'Good morning!' },
    { target: 'Saya mau pergi ke pantai.', en: 'I want to go to the beach.' },
    { target: 'Pantai di mana?', en: 'Where is the beach?' },
    { target: 'Pantai di sana, tidak jauh.', en: 'The beach is over there, not far.' },
    { target: 'Terima kasih! Saya sangat senang.', en: "Thank you! I'm very happy." },
  ]),
  S('id', 'market', 'Di Pasar Tradisional', 'Beginner', 'Navigating local market bargaining', '#D98036', [
    { target: 'Selamat pagi, Pak. Berapa harga mangga ini?', en: 'Good morning, sir. How much are these mangoes?' },
    { target: 'Lima belas ribu satu kilo.', en: 'Fifteen thousand per kilo.' },
    { target: 'Mahal! Bisa kurang?', en: 'Expensive! Can it be less?' },
    { target: 'Boleh, dua belas ribu untuk Anda.', en: 'Okay, twelve thousand for you.' },
    { target: 'Baik, saya mau dua kilo.', en: 'Good, I want two kilos.' },
  ]),
  S('id', 'directions', 'Mencari Alamat', 'Intermediate', 'Asking the way across town', '#BFA98E'),
  S('id', 'dinner', 'Makan Malam Bersama', 'Intermediate', 'A shared meal with new friends', '#C98A5E'),
  S('id', 'lostkey', 'Kunci yang Hilang', 'Advanced', 'A small problem, calmly resolved', '#A88463'),

  // ---- Spanish ----
  S('es', 'arrival', 'Un viaje a la costa', 'Beginner', 'A trip to the coast', '#E8945A', [
    { target: '¡Buenos días! Quiero ir a la playa.', en: 'Good morning! I want to go to the beach.' },
    { target: '¿Dónde está la playa?', en: 'Where is the beach?' },
    { target: 'Está cerca, a la derecha.', en: "It's near, to the right." },
    { target: '¡Perfecto! Muchas gracias.', en: 'Perfect! Thank you very much.' },
  ]),
  S('es', 'market', 'En el mercado', 'Intermediate', 'Buying fruit and bargaining', '#D98036'),
  S('es', 'lostkey', 'La llave perdida', 'Advanced', 'A small problem, calmly resolved', '#A88463'),

  // ---- French ----
  S('fr', 'arrival', 'Un voyage en Provence', 'Beginner', 'A journey through Provence', '#E8945A', [
    { target: 'Bonjour ! Je voudrais aller à la plage.', en: "Hello! I'd like to go to the beach." },
    { target: "Où est la plage, s'il vous plaît ?", en: 'Where is the beach, please?' },
    { target: "C'est tout près, à gauche.", en: "It's very near, on the left." },
    { target: 'Merci beaucoup !', en: 'Thank you very much!' },
  ]),
  S('fr', 'market', 'Au marché', 'Intermediate', 'A morning at the market', '#D98036'),
  S('fr', 'lostkey', 'La clé perdue', 'Advanced', 'A small problem, calmly resolved', '#A88463'),

  // ---- Italian ----
  S('it', 'arrival', 'Un viaggio in Toscana', 'Beginner', 'A journey through Tuscany', '#E8945A', [
    { target: 'Buongiorno! Vorrei andare al mare.', en: "Good morning! I'd like to go to the sea." },
    { target: "Dov'è il mare?", en: 'Where is the sea?' },
    { target: 'È vicino, a destra.', en: "It's near, on the right." },
    { target: 'Grazie mille!', en: 'Thank you so much!' },
  ]),
  S('it', 'market', 'Al mercato', 'Intermediate', 'A morning at the market', '#D98036'),
  S('it', 'lostkey', 'La chiave smarrita', 'Advanced', 'A small problem, calmly resolved', '#A88463'),

  // ---- Mandarin (dual-script read-along) ----
  S('zh', 'arrival', '去海边', 'Beginner', 'A trip to the seaside', '#E8945A', [
    { target: '你好！我想去海边。', roman: 'nǐ hǎo! wǒ xiǎng qù hǎibiān.', en: 'Hello! I want to go to the seaside.' },
    { target: '海边在哪儿？', roman: 'hǎibiān zài nǎr?', en: 'Where is the seaside?' },
    { target: '在那儿，不远。', roman: 'zài nàr, bù yuǎn.', en: 'Over there, not far.' },
    { target: '谢谢！', roman: 'xièxie!', en: 'Thank you!' },
  ]),
  S('zh', 'market', '在市场', 'Intermediate', 'A morning at the market', '#D98036'),
  S('zh', 'lostkey', '丢了钥匙', 'Advanced', 'A small problem, calmly resolved', '#A88463'),

  // ---- Japanese (dual-script read-along) ----
  S('ja', 'arrival', '京都への旅', 'Beginner', 'A journey to Kyoto', '#E8945A', [
    { target: 'おはようございます！海に行きたいです。', roman: 'ohayō gozaimasu! umi ni ikitai desu.', en: 'Good morning! I want to go to the sea.' },
    { target: '海はどこですか？', roman: 'umi wa doko desu ka?', en: 'Where is the sea?' },
    { target: 'あそこです。近いです。', roman: 'asoko desu. chikai desu.', en: "Over there. It's near." },
    { target: 'ありがとうございます！', roman: 'arigatō gozaimasu!', en: 'Thank you!' },
  ]),
  S('ja', 'market', '市場で', 'Intermediate', 'A morning at the market', '#D98036'),
  S('ja', 'lostkey', '鍵をなくして', 'Advanced', 'A small problem, calmly resolved', '#A88463'),
];

export function storiesFor(language: InstalledLanguage): Story[] {
  return STORY_LIST.filter((s) => s.language === language);
}

export function storyById(id: string | null): Story | undefined {
  return id ? STORY_LIST.find((s) => s.id === id) : undefined;
}
