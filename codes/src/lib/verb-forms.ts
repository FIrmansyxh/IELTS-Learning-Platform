/**
 * Data dan aturan Verb Forms (5 bentuk) untuk menu Glosarium. Kata kerja umum sehari-hari, bukan akademik.
 *  V1 = bentuk dasar, V2 = past simple, V3 = past participle, V-ing, V-s/es (orang ketiga tunggal, present simple).
 * V2/V3 kata kerja beraturan dan bentuk -ing / -s/es diturunkan lewat aturan di bawah; kata kerja tak beraturan
 * menulis V2/V3-nya secara eksplisit. Ejaan mengikuti Inggris Amerika bila berbeda (traveled, organize).
 */

export interface VerbEntry {
  v1: string;
  v2: string;
  v3: string;
  ing: string;
  s: string;
  /** Arti singkat dalam bahasa Indonesia. */
  arti: string;
  irregular: boolean;
  /** Pola bentuk: A-A-A (V1=V2=V3), A-B-A, A-B-B, A-B-C, atau BERATURAN (-ed). */
  pattern: VerbPattern;
  /** Catatan pelafalan atau pemakaian (opsional). */
  note?: string;
}

export type VerbPattern = 'A-A-A' | 'A-B-A' | 'A-B-B' | 'A-B-C' | 'BERATURAN';

/** Kata kerja yang konsonan akhirnya digandakan sebelum -ing / -ed (suku kata akhir bertekanan, pola KVK). */
const DOUBLE = new Set([
  'begin', 'forget', 'get', 'hit', 'let', 'cut', 'put', 'run', 'set', 'shut', 'sit', 'swim', 'win', 'stop', 'plan', 'prefer',
]);

const isVowel = (c: string | undefined): boolean => c !== undefined && 'aeiou'.includes(c);

/** Bentuk -ing. */
export function toIng(v1: string): string {
  if (v1 === 'be') return 'being';
  if (v1.endsWith('ie')) return `${v1.slice(0, -2)}ying`;
  if (v1.endsWith('e') && !/(ee|oe|ye)$/.test(v1)) return `${v1.slice(0, -1)}ing`;
  if (DOUBLE.has(v1)) return `${v1}${v1.slice(-1)}ing`;
  return `${v1}ing`;
}

/** Bentuk -s/es untuk subjek orang ketiga tunggal. */
export function toS(v1: string): string {
  if (v1 === 'be') return 'is';
  if (v1 === 'have') return 'has';
  if (v1 === 'go' || v1 === 'do') return `${v1}es`;
  if (/(s|x|z|ch|sh)$/.test(v1)) return `${v1}es`;
  if (v1.endsWith('y') && !isVowel(v1.charAt(v1.length - 2))) return `${v1.slice(0, -1)}ies`;
  return `${v1}s`;
}

/** V2 = V3 untuk kata kerja beraturan (-ed). */
export function toEd(v1: string): string {
  if (v1.endsWith('e')) return `${v1}d`;
  if (v1.endsWith('y') && !isVowel(v1.charAt(v1.length - 2))) return `${v1.slice(0, -1)}ied`;
  if (DOUBLE.has(v1)) return `${v1}${v1.slice(-1)}ed`;
  return `${v1}ed`;
}

function patternOf(v1: string, v2: string, v3: string, irregular: boolean): VerbPattern {
  if (!irregular) return 'BERATURAN';
  if (v1 === v2 && v2 === v3) return 'A-A-A';
  if (v1 === v3) return 'A-B-A';
  if (v2 === v3) return 'A-B-B';
  return 'A-B-C';
}

type IrregularRow = [v1: string, v2: string, v3: string, arti: string, note?: string];

const IRREGULAR: IrregularRow[] = [
  ['be', 'was / were', 'been', 'adalah, berada', 'Subjek I = was, he/she/it = was, you/we/they = were. Present: am / is / are.'],
  ['become', 'became', 'become', 'menjadi'],
  ['begin', 'began', 'begun', 'memulai'],
  ['blow', 'blew', 'blown', 'meniup'],
  ['break', 'broke', 'broken', 'memecahkan, merusak'],
  ['bring', 'brought', 'brought', 'membawa'],
  ['build', 'built', 'built', 'membangun'],
  ['buy', 'bought', 'bought', 'membeli'],
  ['catch', 'caught', 'caught', 'menangkap'],
  ['choose', 'chose', 'chosen', 'memilih'],
  ['come', 'came', 'come', 'datang'],
  ['cost', 'cost', 'cost', 'berharga, berbiaya'],
  ['cut', 'cut', 'cut', 'memotong'],
  ['do', 'did', 'done', 'melakukan'],
  ['draw', 'drew', 'drawn', 'menggambar'],
  ['drink', 'drank', 'drunk', 'minum'],
  ['drive', 'drove', 'driven', 'mengemudi'],
  ['eat', 'ate', 'eaten', 'makan'],
  ['fall', 'fell', 'fallen', 'jatuh'],
  ['feel', 'felt', 'felt', 'merasa'],
  ['fight', 'fought', 'fought', 'bertarung, berkelahi'],
  ['find', 'found', 'found', 'menemukan'],
  ['fly', 'flew', 'flown', 'terbang'],
  ['forget', 'forgot', 'forgotten', 'lupa'],
  ['get', 'got', 'got / gotten', 'mendapat, menjadi', 'Inggris Amerika memakai gotten; Inggris Britania memakai got.'],
  ['give', 'gave', 'given', 'memberi'],
  ['go', 'went', 'gone', 'pergi'],
  ['grow', 'grew', 'grown', 'tumbuh, menumbuhkan'],
  ['hang', 'hung', 'hung', 'menggantung'],
  ['have', 'had', 'had', 'memiliki, mempunyai'],
  ['hear', 'heard', 'heard', 'mendengar'],
  ['hide', 'hid', 'hidden', 'bersembunyi, menyembunyikan'],
  ['hit', 'hit', 'hit', 'memukul, menabrak'],
  ['hold', 'held', 'held', 'memegang, menahan'],
  ['keep', 'kept', 'kept', 'menyimpan, tetap'],
  ['know', 'knew', 'known', 'tahu, mengenal'],
  ['lead', 'led', 'led', 'memimpin'],
  ['leave', 'left', 'left', 'meninggalkan, berangkat'],
  ['lend', 'lent', 'lent', 'meminjamkan'],
  ['let', 'let', 'let', 'membiarkan, mengizinkan'],
  ['lose', 'lost', 'lost', 'kehilangan, kalah'],
  ['make', 'made', 'made', 'membuat'],
  ['mean', 'meant', 'meant', 'berarti, bermaksud'],
  ['meet', 'met', 'met', 'bertemu'],
  ['pay', 'paid', 'paid', 'membayar'],
  ['put', 'put', 'put', 'meletakkan'],
  ['read', 'read', 'read', 'membaca', 'V2 dan V3 ditulis sama, tetapi dibaca /red/ (V1 dibaca /ri:d/).'],
  ['ride', 'rode', 'ridden', 'menunggang, mengendarai'],
  ['ring', 'rang', 'rung', 'berdering, menelepon'],
  ['rise', 'rose', 'risen', 'naik, terbit'],
  ['run', 'ran', 'run', 'berlari, menjalankan'],
  ['say', 'said', 'said', 'berkata, mengatakan'],
  ['see', 'saw', 'seen', 'melihat'],
  ['sell', 'sold', 'sold', 'menjual'],
  ['send', 'sent', 'sent', 'mengirim'],
  ['set', 'set', 'set', 'mengatur, menetapkan'],
  ['shake', 'shook', 'shaken', 'menggoyang, berjabat'],
  ['show', 'showed', 'shown', 'menunjukkan', 'V3 juga boleh showed, tetapi shown lebih umum.'],
  ['shut', 'shut', 'shut', 'menutup'],
  ['sing', 'sang', 'sung', 'bernyanyi'],
  ['sit', 'sat', 'sat', 'duduk'],
  ['sleep', 'slept', 'slept', 'tidur'],
  ['speak', 'spoke', 'spoken', 'berbicara'],
  ['spend', 'spent', 'spent', 'menghabiskan (uang, waktu)'],
  ['stand', 'stood', 'stood', 'berdiri'],
  ['steal', 'stole', 'stolen', 'mencuri'],
  ['swim', 'swam', 'swum', 'berenang'],
  ['take', 'took', 'taken', 'mengambil, membawa'],
  ['teach', 'taught', 'taught', 'mengajar'],
  ['tear', 'tore', 'torn', 'merobek'],
  ['tell', 'told', 'told', 'memberi tahu, menceritakan'],
  ['think', 'thought', 'thought', 'berpikir, menganggap'],
  ['throw', 'threw', 'thrown', 'melempar'],
  ['understand', 'understood', 'understood', 'mengerti, memahami'],
  ['wake', 'woke', 'woken', 'bangun, membangunkan'],
  ['wear', 'wore', 'worn', 'memakai (pakaian)'],
  ['win', 'won', 'won', 'menang'],
  ['write', 'wrote', 'written', 'menulis'],
];

/** Kata kerja beraturan umum: [V1, arti]. */
const REGULAR: Array<[v1: string, arti: string]> = [
  ['answer', 'menjawab'],
  ['apply', 'melamar, mendaftar'],
  ['arrive', 'tiba, sampai'],
  ['ask', 'bertanya, meminta'],
  ['book', 'memesan (tiket, kamar)'],
  ['borrow', 'meminjam'],
  ['call', 'memanggil, menelepon'],
  ['carry', 'membawa, mengangkut'],
  ['change', 'mengubah, berubah'],
  ['check', 'memeriksa'],
  ['clean', 'membersihkan'],
  ['close', 'menutup'],
  ['collect', 'mengumpulkan, menjemput'],
  ['cook', 'memasak'],
  ['count', 'menghitung'],
  ['cry', 'menangis'],
  ['dance', 'menari'],
  ['decide', 'memutuskan'],
  ['deliver', 'mengantar, mengirimkan'],
  ['depend', 'bergantung'],
  ['enjoy', 'menikmati'],
  ['explain', 'menjelaskan'],
  ['fill', 'mengisi'],
  ['finish', 'menyelesaikan, selesai'],
  ['follow', 'mengikuti'],
  ['help', 'membantu'],
  ['hope', 'berharap'],
  ['improve', 'memperbaiki, meningkatkan'],
  ['include', 'termasuk, mencakup'],
  ['invite', 'mengundang'],
  ['join', 'bergabung'],
  ['jump', 'melompat'],
  ['learn', 'belajar, mempelajari'],
  ['like', 'menyukai'],
  ['listen', 'mendengarkan'],
  ['live', 'tinggal, hidup'],
  ['look', 'melihat, tampak'],
  ['love', 'mencintai, sangat suka'],
  ['mention', 'menyebutkan'],
  ['miss', 'merindukan, melewatkan'],
  ['move', 'pindah, bergerak'],
  ['need', 'membutuhkan'],
  ['offer', 'menawarkan'],
  ['open', 'membuka'],
  ['order', 'memesan (makanan), memerintah'],
  ['organize', 'mengatur, menyelenggarakan'],
  ['pass', 'melewati, lulus'],
  ['plan', 'merencanakan'],
  ['play', 'bermain, memainkan'],
  ['prefer', 'lebih menyukai'],
  ['pull', 'menarik'],
  ['push', 'mendorong'],
  ['rain', 'hujan'],
  ['receive', 'menerima'],
  ['relax', 'bersantai'],
  ['remember', 'mengingat'],
  ['rent', 'menyewa'],
  ['repeat', 'mengulang'],
  ['reply', 'membalas'],
  ['reserve', 'memesan, menyediakan'],
  ['return', 'kembali, mengembalikan'],
  ['save', 'menyimpan, menabung'],
  ['shout', 'berteriak'],
  ['smile', 'tersenyum'],
  ['start', 'memulai, mulai'],
  ['stay', 'tinggal sementara, menginap'],
  ['stop', 'berhenti, menghentikan'],
  ['study', 'belajar, mempelajari'],
  ['suggest', 'menyarankan'],
  ['support', 'mendukung'],
  ['talk', 'berbicara, mengobrol'],
  ['thank', 'berterima kasih'],
  ['touch', 'menyentuh'],
  ['travel', 'bepergian'],
  ['try', 'mencoba'],
  ['turn', 'berbelok, memutar'],
  ['use', 'menggunakan'],
  ['visit', 'mengunjungi'],
  ['wait', 'menunggu'],
  ['walk', 'berjalan'],
  ['want', 'menginginkan'],
  ['wash', 'mencuci'],
  ['watch', 'menonton, mengamati'],
  ['wish', 'berharap, menginginkan'],
  ['work', 'bekerja'],
  ['worry', 'khawatir'],
];

function build(v1: string, v2: string, v3: string, arti: string, irregular: boolean, note?: string): VerbEntry {
  return {
    v1,
    v2,
    v3,
    ing: toIng(v1),
    s: v1 === 'be' ? 'is (am / are)' : toS(v1),
    arti,
    irregular,
    pattern: patternOf(v1, v2.split(' / ')[0]!, v3.split(' / ')[0]!, irregular),
    ...(note ? { note } : {}),
  };
}

const sortByV1 = (a: VerbEntry, b: VerbEntry): number => a.v1.localeCompare(b.v1);

export const VERBS: readonly VerbEntry[] = [
  ...IRREGULAR.map(([v1, v2, v3, arti, note]) => build(v1, v2, v3, arti, true, note)),
  ...REGULAR.map(([v1, arti]) => build(v1, toEd(v1), toEd(v1), arti, false)),
].sort(sortByV1);

export const PATTERN_HINT: Record<VerbPattern, string> = {
  'A-A-A': 'V1 = V2 = V3 (tiga bentuk sama)',
  'A-B-A': 'V1 = V3 (V2 berbeda)',
  'A-B-B': 'V2 = V3 (V1 berbeda)',
  'A-B-C': 'Ketiganya berbeda',
  BERATURAN: 'Beraturan: tambah -ed',
};
