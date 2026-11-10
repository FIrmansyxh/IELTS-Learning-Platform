/** Istilah glosarium: grammar, kosakata, dan IELTS General Training. Penjelasan bahasa Indonesia, contoh bahasa Inggris. */

export type TermCategory = 'GRAMMAR' | 'KOSAKATA' | 'IELTS';

export interface GlossaryTerm {
  term: string;
  /** Padanan atau arti singkat. */
  arti: string;
  /** Penjelasan satu atau dua kalimat. */
  penjelasan: string;
  contoh?: string;
  category: TermCategory;
}

export const TERM_CATEGORY_LABEL: Record<TermCategory, string> = {
  GRAMMAR: 'Grammar',
  KOSAKATA: 'Kosakata',
  IELTS: 'IELTS',
};

export const TERMS: readonly GlossaryTerm[] = [
  { term: 'Noun', arti: 'kata benda', penjelasan: 'Kata untuk orang, benda, tempat, atau gagasan.', contoh: 'The teacher opened the window.', category: 'GRAMMAR' },
  { term: 'Verb', arti: 'kata kerja', penjelasan: 'Kata yang menyatakan tindakan, keadaan, atau kejadian.', contoh: 'She works in a bank.', category: 'GRAMMAR' },
  { term: 'Adjective', arti: 'kata sifat', penjelasan: 'Menjelaskan noun; biasanya berada sebelum noun atau setelah to be.', contoh: 'a small room / The room is small.', category: 'GRAMMAR' },
  { term: 'Adverb', arti: 'kata keterangan', penjelasan: 'Menjelaskan verb, adjective, atau adverb lain (cara, waktu, tempat, frekuensi).', contoh: 'He drives carefully.', category: 'GRAMMAR' },
  { term: 'Pronoun', arti: 'kata ganti', penjelasan: 'Pengganti noun agar tidak diulang.', contoh: 'Anna is late. She missed the bus.', category: 'GRAMMAR' },
  { term: 'Preposition', arti: 'kata depan', penjelasan: 'Menunjukkan hubungan tempat, waktu, atau arah antara kata-kata.', contoh: 'at 7 pm, in London, on Monday', category: 'GRAMMAR' },
  { term: 'Conjunction', arti: 'kata sambung', penjelasan: 'Menghubungkan kata, frasa, atau klausa.', contoh: 'I was tired, but I finished the work.', category: 'GRAMMAR' },
  { term: 'Article', arti: 'kata sandang', penjelasan: 'a / an (tak tentu) dan the (tentu) yang berada di depan noun.', contoh: 'a ticket, an apartment, the manager', category: 'GRAMMAR' },
  { term: 'Auxiliary verb', arti: 'kata kerja bantu', penjelasan: 'Membantu membentuk tense, pertanyaan, dan kalimat negatif: do, have, be.', contoh: 'Do you live here? She has finished.', category: 'GRAMMAR' },
  { term: 'Modal verb', arti: 'kata kerja modal', penjelasan: 'Menyatakan kemampuan, izin, kewajiban, atau kemungkinan; diikuti V1: can, could, should, must, may, might, will, would.', contoh: 'You should book early.', category: 'GRAMMAR' },
  { term: 'Tense', arti: 'bentuk waktu', penjelasan: 'Bentuk verb yang menunjukkan waktu dan sifat kejadian (kini, lampau, akan datang; sederhana, sedang, selesai).', contoh: 'I work / I worked / I will work', category: 'GRAMMAR' },
  { term: 'Subject', arti: 'subjek', penjelasan: 'Pelaku atau hal yang dibicarakan dalam kalimat; biasanya di depan verb.', contoh: 'The manager called me.', category: 'GRAMMAR' },
  { term: 'Object', arti: 'objek', penjelasan: 'Penerima tindakan verb.', contoh: 'She sent an email.', category: 'GRAMMAR' },
  { term: 'Clause', arti: 'klausa', penjelasan: 'Kelompok kata yang punya subjek dan verb.', contoh: 'because it was raining', category: 'GRAMMAR' },
  { term: 'Phrase', arti: 'frasa', penjelasan: 'Kelompok kata tanpa subjek + verb lengkap.', contoh: 'in the morning', category: 'GRAMMAR' },
  { term: 'Infinitive', arti: 'bentuk dasar (to + V1)', penjelasan: 'Verb bentuk dasar, sering dengan to.', contoh: 'I want to learn English.', category: 'GRAMMAR' },
  { term: 'Gerund', arti: 'verb-ing sebagai noun', penjelasan: 'Bentuk -ing yang berfungsi seperti kata benda.', contoh: 'Swimming is good exercise.', category: 'GRAMMAR' },
  { term: 'Present participle', arti: 'bentuk -ing', penjelasan: 'Verb + -ing untuk tense continuous atau sebagai kata sifat.', contoh: 'She is reading.', category: 'GRAMMAR' },
  { term: 'Past participle', arti: 'V3', penjelasan: 'Bentuk ketiga verb untuk perfect tense, passive voice, dan kata sifat.', contoh: 'I have finished. The door was closed.', category: 'GRAMMAR' },
  { term: 'Countable noun', arti: 'kata benda terhitung', penjelasan: 'Bisa dihitung dan punya bentuk jamak.', contoh: 'one book, two books', category: 'GRAMMAR' },
  { term: 'Uncountable noun', arti: 'kata benda tak terhitung', penjelasan: 'Tidak bisa dihitung satu per satu, tanpa bentuk jamak.', contoh: 'some information, a lot of water', category: 'GRAMMAR' },
  { term: 'Active voice', arti: 'kalimat aktif', penjelasan: 'Subjek melakukan tindakan.', contoh: 'The staff cleaned the room.', category: 'GRAMMAR' },
  { term: 'Passive voice', arti: 'kalimat pasif', penjelasan: 'Subjek menerima tindakan: to be + V3.', contoh: 'The room was cleaned.', category: 'GRAMMAR' },
  { term: 'Conditional', arti: 'kalimat pengandaian', penjelasan: 'Kalimat if untuk kondisi dan akibatnya.', contoh: 'If it rains, we will stay home.', category: 'GRAMMAR' },
  { term: 'Comparative', arti: 'tingkat perbandingan', penjelasan: 'Membandingkan dua hal: adjective + -er atau more + adjective.', contoh: 'This flat is cheaper than that one.', category: 'GRAMMAR' },
  { term: 'Superlative', arti: 'tingkat paling', penjelasan: 'Menyatakan yang paling: the + -est atau the most + adjective.', contoh: 'It is the cheapest option.', category: 'GRAMMAR' },
  { term: 'Collocation', arti: 'pasangan kata lazim', penjelasan: 'Kata yang biasa muncul bersama; pasangan yang salah terdengar tidak wajar.', contoh: 'make a decision (bukan do a decision)', category: 'KOSAKATA' },
  { term: 'Synonym', arti: 'sinonim', penjelasan: 'Kata dengan arti hampir sama.', contoh: 'big = large', category: 'KOSAKATA' },
  { term: 'Antonym', arti: 'antonim', penjelasan: 'Kata dengan arti berlawanan.', contoh: 'cheap >< expensive', category: 'KOSAKATA' },
  { term: 'Phrasal verb', arti: 'verb + partikel', penjelasan: 'Verb dengan in, out, up, off, dsb. yang artinya bisa berubah total.', contoh: 'give up = menyerah', category: 'KOSAKATA' },
  { term: 'Idiom', arti: 'ungkapan', penjelasan: 'Ungkapan yang artinya tidak bisa ditebak dari kata per kata.', contoh: 'It costs an arm and a leg = sangat mahal', category: 'KOSAKATA' },
  { term: 'Paraphrase', arti: 'menyatakan ulang', penjelasan: 'Menulis ulang ide dengan kata lain tanpa mengubah arti; kunci di Reading dan Writing.', contoh: 'cheap = low-cost', category: 'KOSAKATA' },
  { term: 'Register', arti: 'tingkat kesantunan', penjelasan: 'Formal, semi-formal, atau informal sesuai pembaca dan situasi.', contoh: 'I would like to enquire... (formal)', category: 'KOSAKATA' },
  { term: 'Band score', arti: 'skor band', penjelasan: 'Skala IELTS 0 sampai 9 (kelipatan 0,5) untuk tiap skill dan skor keseluruhan.', category: 'IELTS' },
  { term: 'General Training (GT)', arti: 'IELTS General Training', penjelasan: 'Versi IELTS untuk migrasi dan kerja; bacaan dan tulisan bertema kehidupan sehari-hari.', category: 'IELTS' },
  { term: 'Task 1 (GT)', arti: 'menulis surat', penjelasan: 'Writing Task 1 GT: surat formal, semi-formal, atau informal, minimal 150 kata.', category: 'IELTS' },
  { term: 'Task 2', arti: 'menulis esai', penjelasan: 'Writing Task 2: esai opini atau diskusi, minimal 250 kata.', category: 'IELTS' },
  { term: 'Skimming', arti: 'membaca sekilas', penjelasan: 'Membaca cepat untuk menangkap ide utama.', category: 'IELTS' },
  { term: 'Scanning', arti: 'memindai informasi', penjelasan: 'Mencari kata, angka, atau nama tertentu tanpa membaca semuanya.', category: 'IELTS' },
  { term: 'True / False / Not Given', arti: 'tipe soal benar-salah-tidak disebut', penjelasan: 'Cocokkan pernyataan dengan teks: sesuai (True), bertentangan (False), atau tidak ada informasinya (Not Given).', category: 'IELTS' },
  { term: 'Gap fill', arti: 'isian rumpang', penjelasan: 'Melengkapi kalimat atau ringkasan dengan kata dari teks atau rekaman, patuhi batas jumlah kata.', category: 'IELTS' },
  { term: 'Distractor', arti: 'pengecoh', penjelasan: 'Pilihan atau informasi yang tampak benar tetapi salah; sering muncul di Listening.', category: 'IELTS' },
  { term: 'Cue card', arti: 'kartu topik', penjelasan: 'Kartu Speaking Part 2 berisi topik dan poin yang harus dibahas selama 1 sampai 2 menit.', category: 'IELTS' },
  { term: 'Fluency', arti: 'kelancaran', penjelasan: 'Berbicara mengalir tanpa jeda berlebihan; salah satu kriteria Speaking.', category: 'IELTS' },
  { term: 'Coherence and cohesion', arti: 'keruntutan dan keterpaduan', penjelasan: 'Ide tersusun logis dan terhubung dengan kata sambung dan paragraf; kriteria Writing dan Speaking.', category: 'IELTS' },
  { term: 'Lexical resource', arti: 'ragam kosakata', penjelasan: 'Seberapa luas dan tepat kosakata yang dipakai; kriteria Writing dan Speaking.', category: 'IELTS' },
];
