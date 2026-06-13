import type { InstalledLanguage } from '../packs';
import { LADDER_STORIES } from './story-ladders';

/**
 * Stories (handoff F2): produced audio episodes with a synced read-along
 * transcript. Scripts are original (plan §5.3) and live here as data;
 * audio is rendered + embedded MANUALLY later (owner-gated), so a story's
 * `audioBase` stays null for now and the player speaks each line with the
 * runtime voice (target only — English is read, never voiced).
 *
 * Indonesian carries a "listening ladder" (owner request): progressively
 * longer episodes — two Beginner (lengthy), one Intermediate (lengthier),
 * one Advanced (lengthiest) — to harden the ear. Length = line count.
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
  thumb?: number; // commissioned square illustration (require(...)); gradient until then
  hero?: number; // commissioned wide illustration (require(...)); gradient until then
  lines?: StoryLine[]; // present = playable; absent = level-gated (locked)
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
  // ============================ Indonesian ============================
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
  S('id', 'directions', 'Mencari Alamat', 'Intermediate', 'Asking the way across town', '#BFA98E', [
    { target: 'Permisi, saya mau ke Jalan Melati.', en: 'Excuse me, I want to go to Jalan Melati.' },
    { target: 'Oh, itu tidak jauh dari sini.', en: "Oh, that's not far from here." },
    { target: 'Anda jalan lurus, lalu belok kiri.', en: 'You go straight, then turn left.' },
    { target: 'Setelah pasar, belok kanan.', en: 'After the market, turn right.' },
    { target: 'Rumahnya yang warna biru.', en: 'The house is the blue one.' },
    { target: 'Terima kasih banyak, Pak!', en: 'Thank you very much, sir!' },
  ]),
  S('id', 'dinner', 'Makan Malam Bersama', 'Intermediate', 'A shared meal with new friends', '#C98A5E', [
    { target: 'Selamat malam! Silakan masuk.', en: 'Good evening! Please come in.' },
    { target: 'Wah, banyak sekali makanannya!', en: 'Wow, so much food!' },
    { target: 'Ini masakan khas Bali. Silakan dicoba.', en: 'This is typical Balinese cooking. Please try it.' },
    { target: 'Enak sekali! Tapi sedikit pedas.', en: 'Very delicious! But a little spicy.' },
    { target: 'Haha, ya, orang Bali suka pedas.', en: 'Haha, yes, Balinese people like spicy food.' },
    { target: 'Terima kasih sudah mengundang saya.', en: 'Thank you for inviting me.' },
  ]),
  S('id', 'lostkey', 'Kunci yang Hilang', 'Advanced', 'A small problem, calmly resolved', '#A88463', [
    { target: 'Aduh, kunci saya hilang!', en: 'Oh no, my key is lost!' },
    { target: 'Tenang, coba ingat-ingat dulu.', en: 'Calm down, try to remember first.' },
    { target: 'Tadi saya di warung, lalu di pantai.', en: 'Earlier I was at the warung, then at the beach.' },
    { target: 'Mungkin tertinggal di warung.', en: 'Maybe it was left at the warung.' },
    { target: 'Ayo kita ke sana dan tanya.', en: "Let's go there and ask." },
    { target: 'Permisi, apakah ada yang menemukan kunci?', en: 'Excuse me, did anyone find a key?' },
    { target: 'Oh, ini dia! Untung tidak hilang.', en: "Oh, here it is! Lucky it wasn't lost." },
  ]),

  // ============================ Spanish ============================
  S('es', 'arrival', 'Un viaje a la costa', 'Beginner', 'A trip to the coast', '#E8945A', [
    { target: '¡Buenos días! Quiero ir a la playa.', en: 'Good morning! I want to go to the beach.' },
    { target: '¿Dónde está la playa?', en: 'Where is the beach?' },
    { target: 'Está cerca, a la derecha.', en: "It's near, to the right." },
    { target: '¡Perfecto! Muchas gracias.', en: 'Perfect! Thank you very much.' },
  ]),
  S('es', 'market', 'En el mercado', 'Intermediate', 'Buying fruit and bargaining', '#D98036', [
    { target: 'Buenos días. ¿Cuánto cuestan las naranjas?', en: 'Good morning. How much are the oranges?' },
    { target: 'Dos euros el kilo, están muy buenas.', en: "Two euros a kilo, they're very good." },
    { target: '¿Me da un kilo, por favor?', en: 'Can you give me a kilo, please?' },
    { target: 'Claro. ¿Algo más?', en: 'Of course. Anything else?' },
    { target: 'No, gracias. ¿Cuánto es todo?', en: 'No, thank you. How much is everything?' },
    { target: 'Son dos euros. Muchas gracias.', en: "It's two euros. Thank you very much." },
  ]),
  S('es', 'lostkey', 'La llave perdida', 'Advanced', 'A small problem, calmly resolved', '#A88463', [
    { target: '¡No encuentro mis llaves!', en: "I can't find my keys!" },
    { target: 'Tranquilo, ¿dónde estuviste?', en: 'Calm down, where were you?' },
    { target: 'Estuve en el café y luego en el parque.', en: 'I was at the café and then the park.' },
    { target: 'Quizás las dejaste en el café.', en: 'Maybe you left them at the café.' },
    { target: 'Vamos a preguntar allí.', en: "Let's go ask there." },
    { target: 'Perdón, ¿encontraron unas llaves?', en: 'Excuse me, did you find some keys?' },
    { target: 'Sí, aquí están. ¡Qué suerte!', en: 'Yes, here they are. What luck!' },
  ]),

  // ============================ French ============================
  S('fr', 'arrival', 'Un voyage en Provence', 'Beginner', 'A journey through Provence', '#E8945A', [
    { target: 'Bonjour ! Je voudrais aller à la plage.', en: "Hello! I'd like to go to the beach." },
    { target: "Où est la plage, s'il vous plaît ?", en: 'Where is the beach, please?' },
    { target: "C'est tout près, à gauche.", en: "It's very near, on the left." },
    { target: 'Merci beaucoup !', en: 'Thank you very much!' },
  ]),
  S('fr', 'market', 'Au marché', 'Intermediate', 'A morning at the market', '#D98036', [
    { target: 'Bonjour ! Combien coûtent les pommes ?', en: 'Hello! How much are the apples?' },
    { target: 'Deux euros le kilo, monsieur.', en: 'Two euros a kilo, sir.' },
    { target: "Je voudrais un kilo, s'il vous plaît.", en: "I'd like a kilo, please." },
    { target: 'Très bien. Et avec ça ?', en: 'Very good. Anything else?' },
    { target: "C'est tout, merci. Ça fait combien ?", en: "That's all, thanks. How much is it?" },
    { target: 'Deux euros. Bonne journée !', en: 'Two euros. Have a good day!' },
  ]),
  S('fr', 'lostkey', 'La clé perdue', 'Advanced', 'A small problem, calmly resolved', '#A88463', [
    { target: 'Je ne trouve pas mes clés !', en: "I can't find my keys!" },
    { target: 'Du calme, où es-tu allé ?', en: 'Calm down, where did you go?' },
    { target: "J'étais au café, puis au parc.", en: 'I was at the café, then the park.' },
    { target: 'Tu les as peut-être laissées au café.', en: 'Maybe you left them at the café.' },
    { target: 'Allons demander là-bas.', en: "Let's go ask there." },
    { target: 'Excusez-moi, avez-vous trouvé des clés ?', en: 'Excuse me, did you find some keys?' },
    { target: 'Oui, les voici. Quelle chance !', en: 'Yes, here they are. What luck!' },
  ]),

  // ============================ Italian ============================
  S('it', 'arrival', 'Un viaggio in Toscana', 'Beginner', 'A journey through Tuscany', '#E8945A', [
    { target: 'Buongiorno! Vorrei andare al mare.', en: "Good morning! I'd like to go to the sea." },
    { target: "Dov'è il mare?", en: 'Where is the sea?' },
    { target: 'È vicino, a destra.', en: "It's near, on the right." },
    { target: 'Grazie mille!', en: 'Thank you so much!' },
  ]),
  S('it', 'market', 'Al mercato', 'Intermediate', 'A morning at the market', '#D98036', [
    { target: 'Buongiorno! Quanto costano le mele?', en: 'Good morning! How much are the apples?' },
    { target: 'Due euro al chilo, signore.', en: 'Two euros a kilo, sir.' },
    { target: 'Vorrei un chilo, per favore.', en: "I'd like a kilo, please." },
    { target: 'Benissimo. Altro?', en: 'Very good. Anything else?' },
    { target: "È tutto, grazie. Quant'è?", en: "That's all, thanks. How much is it?" },
    { target: 'Due euro. Buona giornata!', en: 'Two euros. Have a good day!' },
  ]),
  S('it', 'lostkey', 'La chiave smarrita', 'Advanced', 'A small problem, calmly resolved', '#A88463', [
    { target: 'Non trovo le mie chiavi!', en: "I can't find my keys!" },
    { target: 'Calma, dove sei stato?', en: 'Calm down, where were you?' },
    { target: 'Ero al bar, poi al parco.', en: 'I was at the bar, then the park.' },
    { target: 'Forse le hai lasciate al bar.', en: 'Maybe you left them at the bar.' },
    { target: 'Andiamo a chiedere lì.', en: "Let's go ask there." },
    { target: 'Scusi, avete trovato delle chiavi?', en: 'Excuse me, did you find some keys?' },
    { target: 'Sì, eccole. Che fortuna!', en: 'Yes, here they are. What luck!' },
  ]),

  // ============================ Mandarin ============================
  S('zh', 'arrival', '去海边', 'Beginner', 'A trip to the seaside', '#E8945A', [
    { target: '你好！我想去海边。', roman: 'nǐ hǎo! wǒ xiǎng qù hǎibiān.', en: 'Hello! I want to go to the seaside.' },
    { target: '海边在哪儿？', roman: 'hǎibiān zài nǎr?', en: 'Where is the seaside?' },
    { target: '在那儿，不远。', roman: 'zài nàr, bù yuǎn.', en: 'Over there, not far.' },
    { target: '谢谢！', roman: 'xièxie!', en: 'Thank you!' },
  ]),
  S('zh', 'market', '在市场', 'Intermediate', 'A morning at the market', '#D98036', [
    { target: '你好！苹果多少钱？', roman: 'nǐ hǎo! píngguǒ duōshǎo qián?', en: 'Hello! How much are the apples?' },
    { target: '一斤五块。', roman: 'yì jīn wǔ kuài.', en: 'Five yuan per jin.' },
    { target: '我要一斤。', roman: 'wǒ yào yì jīn.', en: 'I want one jin.' },
    { target: '还要别的吗？', roman: 'hái yào bié de ma?', en: 'Anything else?' },
    { target: '不要了，谢谢。', roman: 'bú yào le, xièxie.', en: 'Nothing more, thanks.' },
    { target: '一共五块。', roman: 'yígòng wǔ kuài.', en: 'Five yuan altogether.' },
  ]),
  S('zh', 'lostkey', '丢了钥匙', 'Advanced', 'A small problem, calmly resolved', '#A88463', [
    { target: '我的钥匙不见了！', roman: 'wǒ de yàoshi bú jiàn le!', en: 'My keys are gone!' },
    { target: '别着急，你去过哪儿？', roman: 'bié zháojí, nǐ qù guo nǎr?', en: "Don't worry, where did you go?" },
    { target: '我去了咖啡馆，然后去了公园。', roman: 'wǒ qù le kāfēiguǎn, ránhòu qù le gōngyuán.', en: 'I went to the café, then the park.' },
    { target: '可能丢在咖啡馆了。', roman: 'kěnéng diū zài kāfēiguǎn le.', en: 'Maybe you lost them at the café.' },
    { target: '我们去问问吧。', roman: 'wǒmen qù wènwen ba.', en: "Let's go ask." },
    { target: '请问，有人捡到钥匙吗？', roman: 'qǐngwèn, yǒu rén jiǎndào yàoshi ma?', en: 'Excuse me, did anyone find keys?' },
    { target: '找到了！真幸运。', roman: 'zhǎodào le! zhēn xìngyùn.', en: 'Found them! How lucky.' },
  ]),

  // ============================ Japanese ============================
  S('ja', 'arrival', '京都への旅', 'Beginner', 'A journey to Kyoto', '#E8945A', [
    { target: 'おはようございます！海に行きたいです。', roman: 'ohayō gozaimasu! umi ni ikitai desu.', en: 'Good morning! I want to go to the sea.' },
    { target: '海はどこですか？', roman: 'umi wa doko desu ka?', en: 'Where is the sea?' },
    { target: 'あそこです。近いです。', roman: 'asoko desu. chikai desu.', en: "Over there. It's near." },
    { target: 'ありがとうございます！', roman: 'arigatō gozaimasu!', en: 'Thank you!' },
  ]),
  S('ja', 'market', '市場で', 'Intermediate', 'A morning at the market', '#D98036', [
    { target: 'こんにちは！りんごはいくらですか？', roman: 'konnichiwa! ringo wa ikura desu ka?', en: 'Hello! How much are the apples?' },
    { target: '一キロ三百円です。', roman: 'ichi kiro sanbyaku en desu.', en: 'Three hundred yen per kilo.' },
    { target: '一キロください。', roman: 'ichi kiro kudasai.', en: 'One kilo, please.' },
    { target: 'ほかに何かいりますか？', roman: 'hoka ni nanika irimasu ka?', en: 'Anything else?' },
    { target: 'いいえ、けっこうです。', roman: 'iie, kekkō desu.', en: "No, that's all." },
    { target: 'ぜんぶで三百円です。', roman: 'zenbu de sanbyaku en desu.', en: 'Three hundred yen altogether.' },
  ]),
  S('ja', 'lostkey', '鍵をなくして', 'Advanced', 'A small problem, calmly resolved', '#A88463', [
    { target: '鍵がありません！', roman: 'kagi ga arimasen!', en: 'My key is gone!' },
    { target: '落ち着いて。どこへ行きましたか？', roman: 'ochitsuite. doko e ikimashita ka?', en: 'Calm down. Where did you go?' },
    { target: 'カフェへ行って、それから公園へ行きました。', roman: 'kafe e itte, sorekara kōen e ikimashita.', en: 'I went to the café, then the park.' },
    { target: 'カフェに忘れたかもしれません。', roman: 'kafe ni wasureta kamoshiremasen.', en: 'Maybe you forgot it at the café.' },
    { target: '聞きに行きましょう。', roman: 'kiki ni ikimashō.', en: "Let's go ask." },
    { target: 'すみません、鍵を見つけましたか？', roman: 'sumimasen, kagi o mitsukemashita ka?', en: 'Excuse me, did you find a key?' },
    { target: 'ありました！よかった。', roman: 'arimashita! yokatta.', en: 'Found it! What a relief.' },
  ]),

  // ===== Listening ladders (2/4/6/8 min × 6 languages) — src/content/story-ladders.ts =====
  ...LADDER_STORIES,
];

export function storiesFor(language: InstalledLanguage): Story[] {
  return STORY_LIST.filter((s) => s.language === language);
}

export function storyById(id: string | null): Story | undefined {
  return id ? STORY_LIST.find((s) => s.id === id) : undefined;
}
