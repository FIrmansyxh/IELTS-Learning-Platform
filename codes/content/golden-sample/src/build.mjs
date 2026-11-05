// Membangun content.json (+ pending/boss-t1-listening.section.json) dengan 3 Paket Soal Variatif per Modul.
// Setiap modul dan exam memiliki 3 paket soal (P1, P2, P3) dengan jenis dan jumlah soal yang sama,
// sehingga saat learner memulai latihan atau ujian, sistem mengacak pemilihan varian dari ketiga sumber
// dan mengacak urutan soal secara total.
// Jalankan: node content/golden-sample/src/build.mjs   (dari folder codes/)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const md = (f) => readFileSync(path.join(here, f), 'utf8').replace(/\r\n/g, '\n').trim();

const ORIGIN = 'AI_GENERATED_REVIEWED';
const GRAMMAR = 'GRAMMAR';
const R = 'READING';
const L = 'LISTENING';

// ----------------------------------------------------------------- pembangun soal
const mcq = (id, skill, prompt, options, answer, explanation_id, extra = {}) => ({
  question_id: id, question_type: 'MCQ_SINGLE', skill, prompt, options, correct_answers: [answer], explanation_id, ...extra,
});
const mcqMulti = (id, skill, prompt, options, answers, explanation_id, points, extra = {}) => ({
  question_id: id, question_type: 'MCQ_MULTI', skill, prompt, options, correct_answers: answers, explanation_id, points, ...extra,
});
const fill = (id, skill, prompt, answers, explanation_id, max_words, extra = {}) => ({
  question_id: id, question_type: 'FILL_IN_BLANK', skill, prompt, correct_answers: answers, explanation_id, ...(max_words ? { max_words } : {}), ...extra,
});
const short = (id, skill, prompt, answers, max_words, explanation_id, extra = {}) => ({
  question_id: id, question_type: 'SHORT_ANSWER', skill, prompt, correct_answers: answers, max_words, explanation_id, ...extra,
});
const tfng = (id, skill, prompt, answer, explanation_id, extra = {}) => ({
  question_id: id, question_type: 'TFNG', skill, prompt, correct_answers: [answer], explanation_id, ...extra,
});
const match = (type, id, skill, prompt, left, right, correct, explanation_id, extra = {}) => ({
  question_id: id, question_type: type, skill, prompt, matching: { left, right, allow_reuse: false }, correct_answers: correct, points: left.length, explanation_id, ...extra,
});
const error = (id, skill, prompt, tokens, correct, explanation_id, extra = {}) => ({
  question_id: id, question_type: 'ERROR_RECOGNITION', skill, prompt, tokens, correct_answers: correct, explanation_id, ...extra,
});

// =================================================================
// GS-1: 2.1.3 Passive Voice (3 Paket x 10 Soal = 30 Soal)
// =================================================================
const gs1_P1 = [
  fill('Q-213-P1-01', GRAMMAR, "Lengkapi kalimat berikut dengan bentuk pasif dari kata di dalam kurung:\n'Once the grapes _______ (harvest), they are taken to the factory.'", ['have been harvested'],
    "Kalimat memakai 'Once ... , they are taken', yaitu rangkaian proses. Tindakan memanen sudah selesai sebelum pengangkutan, sehingga dipakai Present Perfect Passive: has/have been + V3. Subjek 'the grapes' jamak, jadi 'have been harvested'.", 3),
  fill('Q-213-P1-02', GRAMMAR, "Lengkapi dengan bentuk pasif Present Simple:\n'The final product _______ (sell) in supermarkets across the country.'", ['is sold'],
    "Ini fakta umum tentang proses, sehingga Present Simple. Subjek 'the final product' tunggal, jadi 'is'. V3 dari 'sell' adalah 'sold' (tidak beraturan), bukan 'selled'.", 3),
  fill('Q-213-P1-03', GRAMMAR, "Lengkapi dengan pasif modal (gunakan 'must'):\n'Waste water _______ (treat) before it is released into the river.'", ['must be treated'],
    "Pasif modal dibentuk modal + be + V3. Setelah 'must' kata kerja berbentuk dasar, jadi 'be' (bukan 'is'), lalu 'treated'.", 3),
  mcq('Q-213-P1-04', GRAMMAR, 'Manakah kalimat yang paling tepat untuk laporan akademik tentang proses pembuatan kopi?',
    ['People grind the coffee beans in a machine.', 'The coffee beans are ground in a mechanical grinder.', 'The coffee beans is ground in a machine.', 'The coffee beans are grind in a machine.'],
    'The coffee beans are ground in a mechanical grinder.',
    "Pilihan B memakai pasif yang benar: 'beans' jamak + 'are' + V3 'ground'. Pilihan A bersifat aktif dengan pelaku yang tidak penting. Pilihan C salah kesesuaian subjek-be ('beans ... is'). Pilihan D memakai bentuk dasar 'grind', bukan V3."),
  mcq('Q-213-P1-05', GRAMMAR, "Pilih bentuk pasif yang benar dari kalimat: 'Engineers have repaired the bridge.'",
    ['The bridge has been repaired by engineers.', 'The bridge was repaired by engineers.', 'The bridge has repaired by engineers.', 'The bridge have been repaired by engineers.'],
    'The bridge has been repaired by engineers.',
    "Kalimat aktif memakai Present Perfect, maka pasifnya has/have been + V3. Subjek baru 'the bridge' tunggal, jadi 'has been repaired'."),
  mcq('Q-213-P1-06', GRAMMAR, "Pada kalimat mana frasa 'by + pelaku' sebaiknya dihapus karena tidak memberi informasi baru?",
    ['The painting was created by Leonardo da Vinci.', 'The samples were tested by people.', "The report was written by a team from the national statistics office.", 'The theory was proposed by two Australian biologists.'],
    'The samples were tested by people.',
    "'By people' tidak memberi informasi karena pengujian tentu dilakukan oleh orang."),
  mcq('Q-213-P1-07', GRAMMAR, "Pilih jawaban yang benar: 'The recycled paper can _______ into new boxes.'",
    ['turn', 'be turned', 'been turned', 'being turn'], 'be turned',
    "Pasif modal: modal + be + V3. Setelah 'can' dipakai 'be', lalu 'turned'."),
  {
    question_id: 'Q-213-P1-08', question_type: 'SENTENCE_REORDER', skill: GRAMMAR,
    prompt: 'Susun segmen berikut menjadi kalimat pasif yang benar tentang proses pasteurisasi susu.',
    segments: ['The raw milk', 'is first', 'heated to 72 degrees', 'and then cooled quickly.'],
    explanation_id: "Urutan yang benar: subjek (The raw milk), be (is) dengan kata urutan 'first', kata kerja V3 beserta keterangan (heated to 72 degrees), lalu bagian akhir (and then cooled quickly).",
  },
  error('Q-213-P1-09', GRAMMAR, 'Pilih satu kata yang membuat kalimat pasif ini salah.',
    ['The', 'cement', 'is', 'mix', 'with', 'water', 'in', 'a', 'large', 'drum.'], [3],
    "Setelah 'is' dibutuhkan V3, yaitu 'mixed'. 'Mix' adalah bentuk dasar."),
  match('MATCHING_DROPDOWN', 'Q-213-P1-10', GRAMMAR, 'Pasangkan setiap kalimat aktif dengan kalimat pasif yang tepat.',
    ['Workers pick the tea leaves by hand.', 'Someone stole my wallet yesterday.', 'Scientists have developed a new vaccine.', 'The council will close the road next week.'],
    ['The road will be closed next week.', 'My wallet was stolen yesterday.', 'Tea leaves are picked by hand.', 'A new vaccine has been developed.', 'A new vaccine is developed.'],
    [2, 1, 3, 0],
    "Samakan tense: Present Simple -> 'are picked', Past Simple -> 'was stolen', Present Perfect -> 'has been developed', Future -> 'will be closed'."),
];

const gs1_P2 = [
  fill('Q-213-P2-01', GRAMMAR, "Lengkapi kalimat berikut dengan bentuk pasif dari kata di dalam kurung:\n'After the cocoa pods _______ (collect), the beans are extracted.'", ['have been collected'],
    "Urutan proses: pemanenan selesai sebelum ekstraksi biji, memakai Present Perfect Passive 'have been collected' karena subjek 'the cocoa pods' jamak.", 3),
  fill('Q-213-P2-02', GRAMMAR, "Lengkapi dengan bentuk pasif Present Simple:\n'The raw tea leaves _______ (dry) on large wooden trays in the sun.'", ['are dried'],
    "Fakta proses rutin memakai Present Simple Passive. Subjek jamak 'tea leaves' memakai 'are', dan V3 dari dry adalah 'dried'.", 3),
  fill('Q-213-P2-03', GRAMMAR, "Lengkapi dengan pasif modal (gunakan 'should'):\n'Hazardous chemicals _______ (store) in a dedicated temperature-controlled room.'", ['should be stored'],
    "Pasif modal: modal + be + V3 -> 'should be stored'.", 3),
  mcq('Q-213-P2-04', GRAMMAR, 'Manakah kalimat pasif yang paling sesuai untuk mendeskripsikan tahap pengemasan madu?',
    ['They put the liquid honey in sterilized glass jars.', 'The liquid honey is poured into sterilized glass jars.', 'Honey pour into sterilized glass jars.', 'The honey is pouring into jars by them.'],
    'The liquid honey is poured into sterilized glass jars.',
    "Pilihan B menggunakan kalimat pasif ilmiah objektif yang baku ('is poured'). Pilihan A menggunakan aktif informal ('they'), C salah tata bahasa, D present continuous pasif yang janggal."),
  mcq('Q-213-P2-05', GRAMMAR, "Pilih bentuk pasif yang benar dari kalimat: 'Researchers have discovered a new marine species.'",
    ['A new marine species has been discovered by researchers.', 'A new marine species was discovered by researchers.', 'A new marine species has discovered by researchers.', 'A new marine species had been discovered by researchers.'],
    'A new marine species has been discovered by researchers.',
    "Present perfect aktif ('have discovered') menjadi present perfect pasif ('has been discovered') menyesuaikan subjek tunggal 'a new marine species'."),
  mcq('Q-213-P2-06', GRAMMAR, "Pada kalimat mana frasa 'by + pelaku' sebaiknya dihapus dalam penulisan ilmiah?",
    ['The theory of relativity was formulated by Albert Einstein.', 'The laboratory equipment was cleaned by workers.', 'The novel was illustrated by a local artist.', 'The historical document was signed by King John.'],
    'The laboratory equipment was cleaned by workers.',
    "'By workers' tidak memberikan informasi baru karena pembersihan lab lumrah dilakukan oleh staf/pekerja."),
  mcq('Q-213-P2-07', GRAMMAR, "Pilih jawaban yang benar: 'All submitted essays must _______ by the end of this semester.'",
    ['complete', 'be completed', 'been completed', 'being complete'], 'be completed',
    "Pasif modal: must + be + V3 -> 'be completed'."),
  {
    question_id: 'Q-213-P2-08', question_type: 'SENTENCE_REORDER', skill: GRAMMAR,
    prompt: 'Susun segmen berikut menjadi kalimat pasif yang tepat tentang pengolahan air limbah.',
    segments: ['The contaminated water', 'is thoroughly', 'filtered through carbon beds', 'before chemical disinfection.'],
    explanation_id: "Urutan yang benar: Subjek (The contaminated water) + be (is) + adverb (thoroughly) + V3 (filtered through carbon beds) + adverbial clause (before chemical disinfection).",
  },
  error('Q-213-P2-09', GRAMMAR, 'Pilih satu kata yang membuat kalimat pasif ini salah.',
    ['The', 'olive', 'oil', 'is', 'extract', 'from', 'crushed', 'fruits', 'under', 'pressure.'], [4],
    "Kata 'extract' setelah 'is' harus berupa bentuk V3 yaitu 'extracted'."),
  match('MATCHING_DROPDOWN', 'Q-213-P2-10', GRAMMAR, 'Pasangkan setiap kalimat aktif berikut dengan padanan pasifnya yang tepat.',
    ['Technicians calibrate the sensors every morning.', 'A local contractor built the greenhouse in 2020.', 'The committee has approved the revised budget.', 'The university will host the international symposium next month.'],
    ['The international symposium will be hosted by the university next month.', 'The greenhouse was built by a local contractor in 2020.', 'The sensors are calibrated every morning.', 'The revised budget has been approved by the committee.', 'The sensors were calibrated every morning.'],
    [2, 1, 3, 0],
    "Samakan tenses dengan presisi: Present Simple -> are calibrated, Past Simple -> was built, Present Perfect -> has been approved, Future -> will be hosted."),
];

const gs1_P3 = [
  fill('Q-213-P3-01', GRAMMAR, "Lengkapi kalimat berikut dengan bentuk pasif dari kata di dalam kurung:\n'When the metal sheets _______ (cut) to the specified dimensions, they are welded together.'", ['have been cut'],
    "Urutan proses: pemotongan lembaran logam selesai terlebih dahulu memakai Present Perfect Passive 'have been cut' (V3 dari cut adalah cut).", 3),
  fill('Q-213-P3-02', GRAMMAR, "Lengkapi dengan bentuk pasif Present Simple:\n'Purified water _______ (distribute) through underground pipelines to residential areas.'", ['is distributed'],
    "Fakta proses distribusi air memakai Present Simple Passive. Subjek 'purified water' tidak dapat dihitung (tunggal) sehingga memakai 'is distributed'.", 3),
  fill('Q-213-P3-03', GRAMMAR, "Lengkapi dengan pasif modal (gunakan 'may'):\n'Excess heat _______ (use) to generate electricity for the local community.'", ['may be used'],
    "Pasif modal: may + be + V3 -> 'may be used'.", 3),
  mcq('Q-213-P3-04', GRAMMAR, 'Manakah kalimat pasif yang paling tepat untuk laporan siklus daur ulang botol kaca?',
    ['People sort the glass bottles by color manually.', 'The glass bottles are separated by color before melting.', 'Bottles separate by color in a factory.', 'They are separating glass bottles by color.'],
    'The glass bottles are separated by color before melting.',
    "Pilihan B adalah kalimat pasif formal yang tepat untuk laporan diagram alir IELTS Task 1."),
  mcq('Q-213-P3-05', GRAMMAR, "Pilih bentuk pasif yang benar dari kalimat: 'The municipality has installed solar panels on all public schools.'",
    ['Solar panels have been installed on all public schools by the municipality.', 'Solar panels were installed on all public schools.', 'Solar panels has been installed on all public schools.', 'Solar panels had been installed on all public schools.'],
    'Solar panels have been installed on all public schools by the municipality.',
    "Present perfect aktif ('has installed') menjadi present perfect pasif jamak ('have been installed') menyesuaikan subjek baru 'solar panels'."),
  mcq('Q-213-P3-06', GRAMMAR, "Pada kalimat mana frasa 'by + pelaku' sebaiknya dihapus agar kalimat lebih padat dan formal?",
    ['The symphony was composed by Ludwig van Beethoven.', 'The patient data was recorded by individuals.', 'The survey was conducted by the national statistics bureau.', 'The architecture was designed by Zaha Hadid.'],
    'The patient data was recorded by individuals.',
    "'By individuals' adalah frasa umum yang tidak memberi kontribusi informasi bermakna."),
  mcq('Q-213-P3-07', GRAMMAR, "Pilih jawaban yang benar: 'Important scientific findings will _______ at the upcoming conference.'",
    ['present', 'be presented', 'been presented', 'being present'], 'be presented',
    "Pasif future modal: will + be + V3 -> 'be presented'."),
  {
    question_id: 'Q-213-P3-08', question_type: 'SENTENCE_REORDER', skill: GRAMMAR,
    prompt: 'Susun segmen berikut menjadi kalimat pasif yang runtut mengenai proses pembuatan kertas daur ulang.',
    segments: ['The waste paper', 'is shredded', 'and mixed with warm water', 'to create pulp.'],
    explanation_id: "Urutan yang benar: Subjek (The waste paper) + be + V3 (is shredded) + klausa gabungan (and mixed with warm water) + keterangan tujuan (to create pulp).",
  },
  error('Q-213-P3-09', GRAMMAR, 'Pilih satu kata yang membuat kalimat pasif ini salah.',
    ['The', 'harvested', 'wheat', 'is', 'transport', 'to', 'the', 'silo', 'by', 'truck.'], [4],
    "Kata 'transport' setelah auxiliary 'is' harus berupa V3 yaitu 'transported'."),
  match('MATCHING_DROPDOWN', 'Q-213-P3-10', GRAMMAR, 'Pasangkan kalimat aktif berikut dengan transformasi pasif yang tepat.',
    ['Farmers harvest the olives in late autumn.', 'The laboratory synthesized the compound last year.', 'The government has declared a state of emergency.', 'Volunteers will clean the coastal area tomorrow.'],
    ['The coastal area will be cleaned by volunteers tomorrow.', 'The compound was synthesized by the laboratory last year.', 'The olives are harvested in late autumn.', 'A state of emergency has been declared by the government.', 'The olives were harvested in late autumn.'],
    [2, 1, 3, 0],
    "Present Simple -> are harvested, Past Simple -> was synthesized, Present Perfect -> has been declared, Future -> will be cleaned."),
];

const gs1Questions = [...gs1_P1, ...gs1_P2, ...gs1_P3];

const gs1 = {
  tier_number: 2, module_code: '2.1', module_category: 'GRAMMAR', sub_module_code: '2.1.3',
  sub_module_title: 'Passive Voice untuk Deskripsi Proses & Laporan Ilmiah',
  passing_score_percent: 75, origin: ORIGIN, source_code: 'OWN',
  materials: {
    article_markdown: md('gs1-passive-voice.md'),
    slides: [
      { order: 1, asset_code: 'gs/passive-voice/slide-formula', caption: 'Rumus inti passive voice: subjek + be + verb bentuk ketiga, dengan contoh per tense', alt: 'Tabel rumus passive voice untuk Present Simple, Past Simple, Present Perfect, Future, dan modal beserta satu contoh kalimat' },
      { order: 2, asset_code: 'gs/passive-voice/slide-transform', caption: 'Dari aktif ke pasif: objek naik menjadi subjek, pelaku turun atau dibuang', alt: 'Diagram dua kalimat dengan panah yang menunjukkan objek aktif menjadi subjek pasif' },
      { order: 3, asset_code: 'gs/passive-voice/slide-process', caption: 'Alur proses dari biji kakao menjadi cokelat, dijelaskan dengan kalimat pasif', alt: 'Diagram alur lima tahap pembuatan cokelat dengan kalimat pasif pada setiap tahap' },
    ],
    attachments: [{ title: 'Cheatsheet Passive Voice: rumus, V3 tidak beraturan, dan frasa proses', file_type: 'PDF', asset_code: 'gs/passive-voice/cheatsheet' }],
    mini_task: {
      task_type: 'AI_SHORT_WRITING',
      prompt: 'Ubah empat tahapan aktif berikut menjadi satu paragraf pasif (sekitar 50-70 kata) memakai kata penghubung First, Next, After that, dan Finally:\n1. Farmers pick the cocoa pods.\n2. Workers remove the beans and dry them in the sun.\n3. A machine roasts and grinds the beans.\n4. The factory mixes the paste with sugar and pours it into moulds.',
      ai_rubric_criteria: "Paragraf harus memuat empat kalimat pasif Present Simple yang akurat (misalnya 'are picked', 'are removed/dried', 'are roasted/ground', 'is mixed/poured'), memakai keempat kata penghubung urutan dengan tepat, tidak memakai pelaku aktif berulang, dan V3 tidak beraturan ditulis benar (ground).",
    },
  },
  active_drill: { time_limit_seconds: 600, pass_percent: 75, questions: gs1Questions },
};

// =================================================================
// GS-2: 3.2.1 Reading TFNG (3 Paket x 10 Soal = 30 Soal)
// =================================================================
const gs2Passage = md('gs2-passage.md');

const gs2_P1 = [
  tfng('Q-321-P1-01', R, 'On the hottest afternoons, the surface of the bare roofs was hotter than the surface of the planted roofs.', 'True',
    "Paragraf B: bare roofs mencapai hingga 62 derajat, sedangkan planted roofs sekitar 34 derajat. Pernyataan sesuai dengan teks.", { passage_no: 1 }),
  tfng('Q-321-P1-02', R, 'The researchers measured roof temperatures over a period of five years.', 'False',
    "Paragraf B menyebut 'over three summers'. Lima tahun muncul di paragraf G untuk usia farm tertua, bukan lama pengukuran.", { passage_no: 1 }),
  tfng('Q-321-P1-03', R, 'The researchers believe that rooftop farms could supply most of the vegetables a city needs.', 'False',
    "Paragraf C: 'nobody involved in the study suggested that roofs could feed a city'. Teks bertentangan langsung.", { passage_no: 1 }),
  tfng('Q-321-P1-04', R, 'Planted roofs held back more than half of the rain that fell in an average storm.', 'True',
    "Paragraf D: planted roofs menahan sekitar 60 persen hujan pada badai rata-rata. 60% > 50%.", { passage_no: 1 }),
  tfng('Q-321-P1-05', R, 'Owners who received tax reductions were happier with their roof gardens than other owners.', 'Not Given',
    "Paragraf E membahas keringanan pajak, tetapi kepuasan komparatif pemilik tidak dibahas.", { passage_no: 1 }),
  tfng('Q-321-P1-06', R, 'Most of the volunteers at the roof farms were retired people.', 'Not Given',
    "Paragraf F menyebut relawan, tetapi tidak merinci proporsi usia atau status pensiun.", { passage_no: 1 }),
  mcqMulti('Q-321-P1-07', R, 'Pilih DUA manfaat rooftop farming yang menurut peneliti paling kuat didukung oleh bukti mereka.',
    ['Cooling the buildings beneath them', 'Helping to manage rainwater', "Feeding most of the city's population", 'Lowering the tax paid by building owners', 'Increasing the value of buildings built before the 1970s'],
    ['Cooling the buildings beneath them', 'Helping to manage rainwater'],
    "Paragraf G: rooftop farming 'most convincing as a way of cooling buildings and managing rainwater'.", 2, { passage_no: 1 }),
  match('MATCHING_DROPDOWN', 'Q-321-P1-08', R, 'Pada paragraf mana (A-G) informasi berikut ditemukan?',
    ['A comparison of the cost of strengthening a roof with the cost of the garden itself', 'A reason to be careful about the opinions of volunteers', 'A suggestion about how long future research should last', 'Figures showing the temperature difference between two kinds of roof'],
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'], [4, 5, 6, 1],
    "Biaya perkuatan di E; opini relawan di F; saran lama penelitian di G; angka suhu di B.",
    { passage_no: 1 }),
  short('Q-321-P1-09', R, 'Apa yang dikumpulkan oleh farm yang lebih baru pada musim dingin untuk dipakai pada musim panas? (Maksimal TIGA kata)', ['rainwater', 'rain water'], 3,
    "Paragraf D: 'tanks that collect rainwater in winter and release it slowly in summer'.", { passage_no: 1 }),
  short('Q-321-P1-10', R, 'Siswa sekolah dasar mengunjungi salah satu atap setiap bulan untuk belajar tentang apa? (Maksimal TIGA kata)', ['how vegetables grow', 'vegetables growing'], 3,
    "Paragraf F: 'to learn how vegetables grow'.", { passage_no: 1 }),
];

const gs2_P2 = [
  tfng('Q-321-P2-01', R, 'The maximum temperature recorded on bare concrete roofs exceeded 60 degrees Celsius.', 'True',
    "Paragraf B menyatakan 'bare roofs reached as high as 62 degrees', yang berarti melebihi 60 derajat Celcius.", { passage_no: 1 }),
  tfng('Q-321-P2-02', R, 'The research project observed the rooftop gardens continuously for a decade.', 'False',
    "Paragraf B menyebut penelitian berlangsung 'over three summers', sedangkan 10 tahun di Paragraf G merupakan rekomendasi penelitian lanjutan di masa depan.", { passage_no: 1 }),
  tfng('Q-321-P2-03', R, 'Urban rooftop agriculture has the capacity to replace traditional rural farming entirely.', 'False',
    "Paragraf C menegaskan rooftop farming tidak dimaksudkan menggantikan pertanian pedesaan dan tidak dapat memberi makan seluruh kota.", { passage_no: 1 }),
  tfng('Q-321-P2-04', R, 'During typical rainfall events, vegetated roofs absorb the majority of the precipitation.', 'True',
    "Paragraf D: 'absorbed approximately 60 percent of rainfall'. 60 persen merupakan mayoritas.", { passage_no: 1 }),
  tfng('Q-321-P2-05', R, 'Building owners in the municipal tax incentive program experienced fewer leaks than non-participants.', 'Not Given',
    "Paragraf E membahas insentif pajak dan kebocoran secara terpisah, namun perbandingan frekuensi kebocoran antar kelompok tidak disebutkan.", { passage_no: 1 }),
  tfng('Q-321-P2-06', R, 'Volunteers were paid an hourly stipend for participating in community garden maintenance.', 'Not Given',
    "Paragraf F membahas keterlibatan relawan tanpa menyebutkan adanya pembayaran uang saku.", { passage_no: 1 }),
  mcqMulti('Q-321-P2-07', R, 'Pilih DUA dampak positif lingkungan dari vegetasi atap yang divalidasi oleh data penelitian.',
    ['Reduction of building cooling loads', 'Mitigation of stormwater runoff', 'Complete self-sufficiency in urban grain supply', 'Elimination of structural maintenance costs', 'Tripling the property resale value'],
    ['Reduction of building cooling loads', 'Mitigation of stormwater runoff'],
    "Bukti empiris paling kuat dalam teks adalah pendinginan gedung dan retensi air hujan.", 2, { passage_no: 1 }),
  match('MATCHING_DROPDOWN', 'Q-321-P2-08', R, 'Di paragraf manakah (A-G) poin-poin berikut disebutkan?',
    ['Structural engineering challenges for older rooftops', 'Social and educational benefits for community members', 'Recommended timeline for long-term ecological evaluation', 'Specific heat absorption differences across roof surfaces'],
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'], [4, 5, 6, 1],
    "Tantangan struktur di E; manfaat sosial di F; rekomendasi timeline di G; data penyerapan panas di B.",
    { passage_no: 1 }),
  short('Q-321-P2-09', R, 'Material apa yang ditampung dalam tangki penyimpanan khusus saat musim dingin? (Maksimal DUA kata)', ['rainwater', 'rain water'], 2,
    "Paragraf D menyebut penampungan 'rainwater' dalam tangki.", { passage_no: 1 }),
  short('Q-321-P2-10', R, 'Berapa tahun usia kebun atap tertua yang dianalisis dalam studi tersebut? (Maksimal DUA kata)', ['five years', '5 years', 'five'], 2,
    "Paragraf G mencatat bahwa farm tertua baru berusia 'five years'.", { passage_no: 1 }),
];

const gs2_P3 = [
  tfng('Q-321-P3-01', R, 'Roofs covered with vegetation maintained significantly lower temperatures during peak heat periods.', 'True',
    "Paragraf B: planted roofs sekitar 34 derajat dibandingkan 62 derajat pada bare roofs.", { passage_no: 1 }),
  tfng('Q-321-P3-02', R, 'Data collection for surface temperatures was conducted over five consecutive calendar years.', 'False',
    "Paragraf B: pengukuran dilakukan 'over three summers', bukan 5 tahun penuh.", { passage_no: 1 }),
  tfng('Q-321-P3-03', R, 'The authors argue that commercial rooftop farms will meet total urban dietary requirements.', 'False',
    "Paragraf C menyatakan tidak ada peneliti yang beranggapan atap bisa memberi makan seluruh kota.", { passage_no: 1 }),
  tfng('Q-321-P3-04', R, 'Approximately sixty percent of stormwater was successfully retained by the green roofs.', 'True',
    "Paragraf D menyebutkan angka retensi air 'approximately 60 percent'.", { passage_no: 1 }),
  tfng('Q-321-P3-05', R, 'Commercial property tenants preferred working under green roofs compared to conventional asphalt roofs.', 'Not Given',
    "Teks tidak membahas preferensi psikologis atau kenyamanan para penyewa gedung komersial.", { passage_no: 1 }),
  tfng('Q-321-P3-06', R, 'All volunteer participants surveyed had previous formal training in horticulture.', 'Not Given',
    "Paragraf F tidak memberikan informasi mengenai latar belakang pelatihan berkebun para relawan.", { passage_no: 1 }),
  mcqMulti('Q-321-P3-07', R, 'Select TWO main advantages of rooftop farms emphasized in the conclusion of the research team.',
    ['Thermal regulation of interior spaces', 'Stormwater volume retention', 'Total replacement of traditional agriculture', 'Guaranteed municipal tax exemptions', 'Immediate doubling of structural roof life'],
    ['Thermal regulation of interior spaces', 'Stormwater volume retention'],
    "Dua manfaat inti yang divalidasi oleh tim peneliti adalah regulasi termal gedung dan retensi volume air badai.", 2, { passage_no: 1 }),
  match('MATCHING_DROPDOWN', 'Q-321-P3-08', R, 'Match each statement to the correct paragraph (A-G):',
    ['Financial calculations regarding weight reinforcement', 'Observations about volunteer enthusiasm and sampling bias', 'Advice for extending observation duration to ten years', 'Temperature measurements comparing bare and green surfaces'],
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'], [4, 5, 6, 1],
    "Perhitungan bobot/biaya di E; bias antusiasme relawan di F; durasi 10 tahun di G; perbandingan suhu di B.",
    { passage_no: 1 }),
  short('Q-321-P3-09', R, 'What resource do the insulated storage tanks retain during winter months? (Maximum TWO words)', ['rainwater', 'rain water'], 2,
    "Paragraf D mengonfirmasi bahwa tangki menampung 'rainwater'.", { passage_no: 1 }),
  short('Q-321-P3-10', R, 'Who visits the rooftop garden monthly as part of an environmental curriculum? (Maximum TWO words)', ['schoolchildren', 'primary students', 'students'], 2,
    "Paragraf F menyebutkan 'primary school children' / 'schoolchildren' yang berkunjung setiap bulan.", { passage_no: 1 }),
];

const gs2Questions = [...gs2_P1, ...gs2_P2, ...gs2_P3];

const gs2 = {
  tier_number: 3, module_code: '3.2', module_category: 'READING', sub_module_code: '3.2.1',
  sub_module_title: 'Taktik True / False / Not Given & Yes / No / Not Given',
  passing_score_percent: 75, origin: ORIGIN, source_code: 'OWN',
  materials: {
    article_markdown: md('gs2-tfng-article.md'),
    mini_task: {
      task_type: 'SELF_CHECK',
      prompt: 'Ambil tiga pernyataan dari latihan ini yang kamu jawab Not Given atau False. Untuk masing-masing, tulis (1) kalimat teks yang kamu jadikan dasar, dan (2) satu kalimat alasan kenapa itu bukan True.',
      ai_rubric_criteria: 'Centang mandiri: (a) kamu menunjuk kalimat teks, bukan pengetahuan umum; (b) kamu dapat membedakan teks yang bertentangan (False) dari teks yang diam (Not Given); (c) kamu memeriksa kata pembatas seperti all, most, only.',
    },
  },
  active_drill: { time_limit_seconds: 900, pass_percent: 75, reading_passage_markdown: gs2Passage, questions: gs2Questions },
};

// =================================================================
// GS-3: 3.1.1 Listening (3 Paket x 10 Soal = 30 Soal)
// =================================================================
const gs3_P1 = [
  fill('Q-311-P1-01', L, 'Lengkapi formulir pendaftaran.\nSurname: _______', ['Brannigan'], "Penelepon mengeja nama keluarganya: B-R-A-N-N-I-G-A-N. Ejaan harus tepat.", 2, { section_no: 1 }),
  fill('Q-311-P1-02', L, 'Course: _______ painting for beginners', ['watercolour', 'watercolor'], "Penelepon memilih 'watercolour painting'. Ejaan UK dan US diterima.", 2, { section_no: 1 }),
  fill('Q-311-P1-03', L, 'Start date: Tuesday, 14th _______', ['October'], "Staf menyebut 'Tuesday the fourteenth of October'.", 2, { section_no: 1 }),
  fill('Q-311-P1-04', L, 'Fee for the whole term: £ _______', ['85', '£85', '85 pounds', 'eighty-five', 'eighty five'], "Staf menyebut 'eighty-five pounds for the whole term'.", 2, { section_no: 1 }),
  fill('Q-311-P1-05', L, 'Students should bring their own _______', ['apron', 'aprons', 'an apron'], "Staf berkata 'Just an apron'. Penelepon menegaskan 'I'll bring my own'.", 2, { section_no: 1 }),
  mcq('Q-311-P1-06', L, 'Why does Daniel want to join the course?',
    ['He wants to meet other people.', 'He wants to learn proper techniques after practising alone.', 'He needs a qualification for his job.', 'He wants to find a teacher for his children.'],
    'He wants to learn proper techniques after practising alone.',
    "Daniel sudah melukis sendiri di rumah dan ingin 'learn the proper techniques from a real teacher'.", { section_no: 1 }),
  mcq('Q-311-P1-07', L, 'What time does the class start now?', ['6:00 pm', '6:30 pm', '7:00 pm', '7:30 pm'], '7:00 pm',
    "Poster menyebut 6:30, tetapi staf mengoreksi bahwa jadwal dipindah menjadi pukul 7:00.", { section_no: 1 }),
  mcq('Q-311-P1-08', L, 'Where will the class be held this term?', ['Room Four', 'The main hall', 'The Garden Studio', 'The cafe'], 'The Garden Studio',
    "Room Four sedang dicat ulang sehingga kelas dipindah ke Garden Studio.", { section_no: 1 }),
  match('MATCHING_DRAG', 'Q-311-P1-09', L, 'Sesuai penjelasan staf, di mana letak setiap fasilitas? Seret jawaban ke tempat yang benar.',
    ['The cafe', 'The cloakroom', 'The car park', 'The Garden Studio'],
    ['Next to the main entrance, on the left', 'Behind the reception desk', 'At the end of the side path', 'In a glass building in the garden', 'Opposite the stairs on the first floor'],
    [0, 1, 2, 3],
    "Kafe di sebelah pintu masuk utama (kiri); cloakroom di belakang meja resepsionis; car park di ujung side path; Garden Studio di taman.", { section_no: 1 }),
  short('Q-311-P1-10', L, 'Apa yang harus ditunjukkan Daniel di meja resepsionis pada hari pertama? (Maksimal TIGA kata)', ['confirmation email', 'the confirmation email', 'email confirmation'], 3,
    "Staf meminta menunjukkan confirmation email kepada petugas resepsionis.", { section_no: 1 }),
];

const gs3_P2 = [
  fill('Q-311-P2-01', L, 'Complete the registration form.\nApplicant surname: _______', ['Harrington', 'HARRINGTON'], "Penelepon mengeja marganya: H-A-R-R-I-N-G-T-O-N.", 2, { section_no: 1 }),
  fill('Q-311-P2-02', L, 'Selected workshop: _______ pottery for novices', ['ceramic', 'ceramics'], "Peserta mendaftar kursus 'ceramic pottery'.", 2, { section_no: 1 }),
  fill('Q-311-P2-03', L, 'Orientation session: Thursday, 18th _______', ['November'], "Petugas mengonfirmasi sesi orientasi pada 'November the eighteenth'.", 2, { section_no: 1 }),
  fill('Q-311-P2-04', L, 'Total discounted tuition: £ _______', ['95', '£95', '95 pounds', 'ninety-five'], "Biaya term setelah potongan adalah sembilan puluh lima pound (£95).", 2, { section_no: 1 }),
  fill('Q-311-P2-05', L, 'Required personal equipment: clean _______', ['towel', 'towels'], "Instruktur mewajibkan setiap siswa membawa 'clean towel' sendiri.", 2, { section_no: 1 }),
  mcq('Q-311-P2-06', L, 'What is Sarah primary motivation for enrolling in the evening class?',
    ['She wants to socialize after relocating.', 'She hopes to master foundational throwing techniques.', 'She needs certification for studio licensing.', 'She is preparing gifts for colleagues.'],
    'She hopes to master foundational throwing techniques.',
    "Sarah ingin mendalami teknik dasar pembuatan tembikar roda putar secara terstruktur.", { section_no: 1 }),
  mcq('Q-311-P2-07', L, 'According to the receptionist, when does the studio door unlock?', ['5:45 pm', '6:15 pm', '6:45 pm', '7:15 pm'], '6:45 pm',
    "Pintu studio dibuka 15 menit sebelum kelas pukul 7, yaitu 6:45 pm.", { section_no: 1 }),
  mcq('Q-311-P2-08', L, 'Which venue will host the introductory session?', ['Room Two', 'The courtyard gallery', 'The Ceramic Barn', 'The attic workshop'], 'The Ceramic Barn',
    "Sesi dipindahkan ke Ceramic Barn di halaman belakang karena renovasi ruang utama.", { section_no: 1 }),
  match('MATCHING_DRAG', 'Q-311-P2-09', L, 'Match each facility with its exact location described by the receptionist:',
    ['The coffee bar', 'The locker room', 'Bicycle storage', 'The Ceramic Barn'],
    ['Beside the front foyer on the left', 'Adjacent to the security desk', 'At the northern edge of the gravel path', 'In the converted brick outhouse', 'First floor elevator lobby'],
    [0, 1, 2, 3],
    "Coffee bar di samping foyer kiri; loker di dekat meja keamanan; rak sepeda di ujung jalan kerikil; Ceramic Barn di bangunan bata belakang.", { section_no: 1 }),
  short('Q-311-P2-10', L, 'What document must be displayed upon arrival on day one? (Maximum THREE words)', ['booking reference', 'the booking reference', 'digital receipt'], 3,
    "Peserta wajib menunjukkan 'booking reference' pada ponsel di meja registrasi.", { section_no: 1 }),
];

const gs3_P3 = [
  fill('Q-311-P3-01', L, 'Complete the enrollment details.\nCaller surname: _______', ['Montgomery', 'MONTGOMERY'], "Penelepon mengeja namanya: M-O-N-T-G-O-M-E-R-Y.", 2, { section_no: 1 }),
  fill('Q-311-P3-02', L, 'Subject title: Introduction to _______ photography', ['digital'], "Pilihan kursus: 'digital photography'.", 2, { section_no: 1 }),
  fill('Q-311-P3-03', L, 'Commencement date: Saturday, 22nd _______', ['September'], "Tanggal mulai diumumkan pada tanggal 'twenty-second of September'.", 2, { section_no: 1 }),
  fill('Q-311-P3-04', L, 'Full course subscription: £ _______', ['120', '£120', '120 pounds', 'one hundred and twenty'], "Total biaya kursus adalah £120.", 2, { section_no: 1 }),
  fill('Q-311-P3-05', L, 'Attendees must bring their own memory _______', ['card', 'cards'], "Peserta diwajibkan membawa memory card kamera sendiri.", 2, { section_no: 1 }),
  mcq('Q-311-P3-06', L, 'What prompted Liam to register for the weekend module?',
    ['He wants to advance beyond auto-mode settings.', 'He wishes to sell nature prints online.', 'His employer requested a portfolio.', 'He inherited vintage lens gear.'],
    'He wants to advance beyond auto-mode settings.',
    "Liam menyatakan bosan memakai mode otomatis dan ingin memahami kontrol manual.", { section_no: 1 }),
  mcq('Q-311-P3-07', L, 'What time should attendees arrive for the morning session?', ['9:00 am', '9:30 am', '10:00 am', '10:30 am'], '9:30 am',
    "Jadwal kelas dimulai pukul 10:00, namun registrasi dan briefing dimulai pukul 9:30 am.", { section_no: 1 }),
  mcq('Q-311-P3-08', L, 'Where will the lighting workshop occur this weekend?', ['The basement darkroom', 'The Media Loft', 'Hall B', 'The library annex'], 'The Media Loft',
    "Praktek pencahayaan diadakan di Media Loft lantai dua.", { section_no: 1 }),
  match('MATCHING_DRAG', 'Q-311-P3-09', L, 'Identify the campus location of each service:',
    ['Information kiosk', 'Equipment checkout', 'Student lockers', 'The Media Loft'],
    ['Directly opposite the revolving glass doors', 'Beside the main equipment counter', 'Underneath the central staircase', 'On the second floor mezzanine', 'Past the cafeteria courtyard'],
    [0, 1, 2, 3],
    "Kios info di depan pintu putar; checkout alat di samping counter; loker di bawah tangga; Media Loft di lantai mezzanine dua.", { section_no: 1 }),
  short('Q-311-P3-10', L, 'What item should be shown to obtain a student pass? (Maximum THREE words)', ['photo identification', 'photo ID', 'national identity card'], 3,
    "Petugas meminta peserta memperlihatkan 'photo identification' resmi.", { section_no: 1 }),
];

const gs3Questions = [...gs3_P1, ...gs3_P2, ...gs3_P3];

const gs3 = {
  tier_number: 3, module_code: '3.1', module_category: 'LISTENING', sub_module_code: '3.1.1',
  sub_module_title: 'Section 1 & 2: Form/Note Completion, Multiple Choice, & Map/Plan Labeling',
  passing_score_percent: 75, origin: ORIGIN, source_code: 'OWN',
  materials: {
    article_markdown: md('gs3-listening-article.md'),
    mini_task: {
      task_type: 'SELF_CHECK',
      prompt: 'Dengarkan ulang rekaman latihan (setelah selesai) dan catat dua kata penanda koreksi yang kamu dengar. Tuliskan pula satu soal yang kamu jawab salah karena terburu-buru menulis jawaban pertama.',
      ai_rubric_criteria: 'Centang mandiri: (a) kamu menemukan minimal dua penanda koreksi; (b) kamu menuliskan jawaban akhir, bukan jawaban sementara; (c) ejaan nama dan kata benda sudah diperiksa.',
    },
  },
  active_drill: { time_limit_seconds: 600, pass_percent: 75, questions: gs3Questions },
};

// =================================================================
// Placement Test (30 soal)
// =================================================================
const P = (n, d, q) => ({ ...q, question_id: `Q-PL-${String(n).padStart(2, '0')}`, difficulty: d });
const placement = [
  P(1, 1, mcq('', GRAMMAR, "My sister _______ a teacher.", ['is', 'are', 'am', 'be'], 'is', "Subjek 'my sister' tunggal orang ketiga, maka be yang tepat adalah 'is'.")),
  P(2, 1, mcq('', GRAMMAR, 'There are three _______ in the garden.', ['child', 'childs', 'children', 'childrens'], 'children', "'Child' memiliki bentuk jamak tidak beraturan 'children'.")),
  P(3, 1, mcq('', GRAMMAR, '_______ you like coffee?', ['Do', 'Does', 'Is', 'Are'], 'Do', "Pertanyaan Present Simple dengan subjek 'you' memakai 'do'.")),
  P(4, 1, fill('', GRAMMAR, 'She _______ (go) to school every day.', ['goes'], "Subjek orang ketiga tunggal pada Present Simple: kata kerja ditambah -es, 'goes'.", 1)),
  P(5, 1, fill('', GRAMMAR, 'I have _______ umbrella. (a / an)', ['an'], "'Umbrella' diawali bunyi vokal, sehingga memakai 'an'.", 1)),
  P(6, 1, error('', GRAMMAR, 'Pilih kata yang salah.', ['He', "don't", 'like', 'fish', 'very', 'much'], [1], "Subjek 'he' membutuhkan 'doesn't', bukan 'don't'.")),
  P(7, 2, mcq('', GRAMMAR, 'Yesterday we _______ to the beach.', ['went', 'go', 'gone', 'goes'], 'went', "'Yesterday' menandakan Past Simple. V2 dari 'go' adalah 'went'.")),
  P(8, 2, mcq('', GRAMMAR, 'I am _______ a book at the moment.', ['reading', 'read', 'reads', 'to read'], 'reading', "'At the moment' menandakan Present Continuous: am + V-ing.")),
  P(9, 2, mcq('', GRAMMAR, 'This bag is _______ than that one.', ['heavier', 'heavy', 'more heavy', 'most heavy'], 'heavier', "Kata sifat pendek berakhir -y membentuk komparatif dengan -ier: 'heavier'.")),
  P(10, 2, fill('', GRAMMAR, "We _______ (not / have) any milk.", ["don't have", 'do not have'], "Bentuk negatif Present Simple untuk 'we': do not / don't + kata kerja dasar.", 2)),
  P(11, 2, fill('', GRAMMAR, 'There _______ some eggs in the fridge.', ['are'], "'Some eggs' jamak, sehingga 'there are'.", 1)),
  P(12, 2, error('', GRAMMAR, 'Pilih kata yang salah.', ['Last', 'week', 'I', 'buy', 'a', 'new', 'phone'], [3], "'Last week' menandakan Past Simple; 'buy' harus menjadi 'bought'.")),
  P(13, 3, mcq('', GRAMMAR, 'If it rains tomorrow, we _______ at home.', ['will stay', 'would stay', 'stay', 'stayed'], 'will stay', "First Conditional: if + Present Simple, will + kata kerja dasar.")),
  P(14, 3, mcq('', GRAMMAR, 'I have lived here _______ 2015.', ['for', 'since', 'during', 'from'], 'since', "'Since' dipakai dengan titik waktu awal (2015); 'for' dengan durasi.")),
  P(15, 3, mcq('', GRAMMAR, 'The man _______ lives next door is a doctor.', ['who', 'which', 'whose', 'where'], 'who', "Antecedent adalah orang dan relative pronoun berfungsi sebagai subjek: 'who'.")),
  P(16, 3, fill('', GRAMMAR, 'She asked me where I _______ (live).', ['lived'], "Reported speech: kata kerja mundur satu tense, 'live' menjadi 'lived'.", 1)),
  P(17, 3, fill('', GRAMMAR, 'The window _______ (break) by the storm last night.', ['was broken'], "Past Simple Passive: was + V3. V3 dari 'break' adalah 'broken'.", 2)),
  P(18, 3, error('', GRAMMAR, 'Pilih kata yang salah.', ['He', 'has', 'been', 'working', 'here', 'since', 'three', 'years'], [5], "Durasi ('three years') memakai 'for', bukan 'since'.")),
  P(19, 4, mcq('', GRAMMAR, 'If I _______ more time, I would learn another language.', ['had', 'have', 'will have', 'would have'], 'had', "Second Conditional: if + Past Simple, would + kata kerja dasar.")),
  P(20, 4, mcq('', GRAMMAR, 'By the time we arrived, the film _______.', ['had already started', 'already started', 'has already started', 'was already starting'], 'had already started', "'By the time' + Past Simple memerlukan Past Perfect untuk kejadian yang lebih dulu.")),
  P(21, 4, mcq('', GRAMMAR, 'He suggested _______ a taxi because it was late.', ['taking', 'to take', 'take', 'that taking'], 'taking', "'Suggest' diikuti V-ing (atau klausa that + should).")),
  P(22, 4, fill('', GRAMMAR, 'She denied _______ (steal) the money.', ['stealing', 'having stolen'], "'Deny' diikuti gerund: 'stealing' atau 'having stolen'.", 2)),
  P(23, 4, fill('', GRAMMAR, 'The report, _______ was published last year, has been widely quoted.', ['which'], "Non-defining relative clause untuk benda memakai 'which' (tidak boleh 'that' setelah koma).", 1)),
  P(24, 4, error('', GRAMMAR, 'Pilih kata yang salah.', ['Despite', 'of', 'the', 'heavy', 'rain', 'the', 'match', 'continued'], [1], "'Despite' tidak diikuti 'of'. Yang benar 'Despite the heavy rain' atau 'In spite of the heavy rain'.")),
  P(25, 5, mcq('', GRAMMAR, 'Had I known about the delay, I _______ earlier.', ['would have left', 'would leave', 'had left', 'will have left'], 'would have left', "Inversion Third Conditional: 'Had I known' = 'If I had known', hasilnya would have + V3.")),
  P(26, 5, mcq('', GRAMMAR, 'Not only _______ the exam, but she also won a prize.', ['did she pass', 'she passed', 'she did pass', 'passed she'], 'did she pass', "Setelah 'not only' di awal kalimat terjadi inversi subjek-auxiliary: 'did she pass'.")),
  P(27, 5, mcq('', GRAMMAR, 'The proposal, _______ by several experts, was eventually withdrawn.', ['criticised', 'criticising', 'having criticised', 'to criticise'], 'criticised', "Participle clause pasif (past participle) menggantikan 'which was criticised'.")),
  P(28, 5, fill('', GRAMMAR, 'It is essential that every student _______ (submit) the form by Friday.', ['submit', 'should submit'], "Setelah 'essential that', dipakai subjunctive (kata kerja dasar) atau 'should + kata kerja dasar'.", 2)),
  P(29, 5, fill('', GRAMMAR, 'Rarely _______ (we / see) such a dramatic improvement.', ['do we see'], "Adverbia negatif di awal kalimat memicu inversi: 'do we see'.", 3)),
  P(30, 5, error('', GRAMMAR, 'Pilih kata yang salah.', ['The', 'number', 'of', 'applicants', 'have', 'risen', 'sharply', 'this', 'year'], [4], "'The number of ...' bersubjek tunggal 'number', sehingga 'has risen'.")),
];

// =================================================================
// Skip Test Modul 2.1 (3 Paket x 12 Soal = 36 Soal)
// =================================================================
const skip_P1 = [
  mcq('Q-SK21-P1-01', GRAMMAR, '_______ the weather was terrible, the match went ahead.', ['Although', 'Because', 'So', 'Despite'], 'Although', "'Although' diikuti klausa lengkap dan menyatakan kontras."),
  mcq('Q-SK21-P1-02', GRAMMAR, 'She studied very hard; _______, she failed the exam.', ['therefore', 'however', 'moreover', 'for example'], 'however', "Hasilnya berlawanan dengan harapan, sehingga dibutuhkan penanda kontras 'however'."),
  mcq('Q-SK21-P1-03', GRAMMAR, '_______ his injury, he completed the race.', ['Although', 'Despite', 'However', 'Whereas'], 'Despite', "'Despite' diikuti kata benda ('his injury')."),
  fill('Q-SK21-P1-04', GRAMMAR, 'The woman _______ car was stolen called the police.', ['whose'], "Relative pronoun kepemilikan: 'whose car'.", 1),
  mcq('Q-SK21-P1-05', GRAMMAR, 'This is the office _______ I work.', ['where', 'which', 'who', 'whose'], 'where', "Antecedent adalah tempat dan klausa lengkap mengikuti, sehingga dipakai 'where'."),
  fill('Q-SK21-P1-06', GRAMMAR, 'The bridge _______ (build) in 1998.', ['was built'], "Past Simple Passive: was + V3 -> 'was built'.", 2),
  error('Q-SK21-P1-07', GRAMMAR, 'Pilih kata yang membuat kalimat pasif ini salah.', ['The', 'results', 'will', 'announce', 'next', 'week'], [3], "Pasif future membutuhkan 'will be announced'."),
  mcq('Q-SK21-P1-08', GRAMMAR, 'If I _______ you, I would accept the offer.', ['were', 'am', 'will be', 'have been'], 'were', "Second Conditional untuk situasi imajiner memakai 'were' setelah 'if I'."),
  mcq('Q-SK21-P1-09', GRAMMAR, 'If she had left earlier, she _______ the train.', ['would have caught', 'would catch', 'will catch', 'had caught'], 'would have caught', "Third Conditional: if + Past Perfect, would have + V3."),
  { question_id: 'Q-SK21-P1-10', question_type: 'SENTENCE_REORDER', skill: GRAMMAR, prompt: 'Susun segmen menjadi kalimat yang benar.', segments: ['Although it was raining,', 'we decided', 'to go for a walk.'], explanation_id: "Klausa 'although' diletakkan di depan dipisah koma." },
  match('MATCHING_DROPDOWN', 'Q-SK21-P1-11', GRAMMAR, 'Pasangkan penanda wacana dengan fungsinya.',
    ['however', 'therefore', 'moreover', 'for instance'],
    ['shows a result', 'adds a similar point', 'introduces a contrast', 'gives an example', 'gives a reason'], [2, 0, 1, 3],
    "However = kontras; therefore = hasil; moreover = penambahan; for instance = contoh."),
  fill('Q-SK21-P1-12', GRAMMAR, 'If the temperature _______ (drop) below zero, the water will freeze.', ['drops'], "First Conditional: if + Present Simple tunggal 'drops'.", 1),
];

const skip_P2 = [
  mcq('Q-SK21-P2-01', GRAMMAR, '_______ the train was delayed, we arrived at the venue on schedule.', ['Although', 'Because', 'Since', 'Due to'], 'Although', "'Although' mengenalkan klausa kontras dengan subjek dan predikat lengkap."),
  mcq('Q-SK21-P2-02', GRAMMAR, 'The experimental data was inconclusive; _______, further funding was approved.', ['nevertheless', 'consequently', 'similarly', 'such as'], 'nevertheless', "'Nevertheless' menghubungkan kontras antara hasil yang meragukan dengan persetujuan dana."),
  mcq('Q-SK21-P2-03', GRAMMAR, '_______ the strict travel restrictions, the conference drew over 500 delegates.', ['In spite of', 'Even though', 'Whereas', 'While'], 'In spite of', "'In spite of' diikuti frasa kata benda ('the strict travel restrictions')."),
  fill('Q-SK21-P2-04', GRAMMAR, 'The author _______ latest monograph won the literary award gave a keynote speech.', ['whose'], "Kepemilikan buku karya pengarang: 'whose latest monograph'.", 1),
  mcq('Q-SK21-P2-05', GRAMMAR, 'The historical archive is an institution _______ researchers examine original manuscripts.', ['where', 'which', 'when', 'that'], 'where', "Menunjukkan tempat terjadinya aktivitas penelitian: 'where researchers examine...'."),
  fill('Q-SK21-P2-06', GRAMMAR, 'The international airport _______ (open) by the prime minister in 2012.', ['was opened'], "Past Simple Passive tunggal: 'was opened'.", 2),
  error('Q-SK21-P2-07', GRAMMAR, 'Pilih kata yang membuat kalimat ini salah secara tata bahasa.', ['The', 'confidential', 'files', 'have', 'transfer', 'to', 'the', 'secure', 'server.'], [4], "Bentuk present perfect pasif membutuhkan V3 'been transferred'."),
  mcq('Q-SK21-P2-08', GRAMMAR, 'If our department _______ a larger budget, we would recruit additional specialists.', ['had', 'has', 'will have', 'would have'], 'had', "Second conditional untuk kondisi hipotesis masa kini: if + Past Simple ('had')."),
  mcq('Q-SK21-P2-09', GRAMMAR, 'Had the security alarm sounded, the residents _______ the building immediately.', ['would have evacuated', 'would evacuate', 'will evacuate', 'evacuated'], 'would have evacuated', "Third conditional inversion: Had + S + V3 berpasangan dengan would have + V3."),
  { question_id: 'Q-SK21-P2-10', question_type: 'SENTENCE_REORDER', skill: GRAMMAR, prompt: 'Susun segmen menjadi kalimat kohesif akademik.', segments: ['Despite initial public skepticism,', 'the renewable energy initiative', 'gained broad support across the region.'], explanation_id: "Prepositional phrase 'Despite...' mengawali kalimat dan diikuti klausa inti." },
  match('MATCHING_DROPDOWN', 'Q-SK21-P2-11', GRAMMAR, 'Pasangkan konjungsi logis berikut dengan relasi maknanya.',
    ['on the contrary', 'as a consequence', 'furthermore', 'namely'],
    ['indicates causal outcome', 'provides specific identification', 'presents an emphatic opposite', 'supplements with reinforcing info', 'expresses temporal sequence'], [2, 0, 3, 1],
    "On the contrary = pertentangan; as a consequence = akibat; furthermore = penguatan; namely = spesifikasi nama."),
  fill('Q-SK21-P2-12', GRAMMAR, 'If global carbon emissions _______ (continue) to climb, sea levels will rise significantly.', ['continue'], "First conditional: if + Present Simple jamak ('continue').", 1),
];

const skip_P3 = [
  mcq('Q-SK21-P3-01', GRAMMAR, '_______ the economic downturn was severe, the technology sector continued to expand.', ['Even though', 'Because', 'Owing to', 'In light of'], 'Even though', "'Even though' mengenalkan klausa kontras konsesi dengan klausa lengkap."),
  mcq('Q-SK21-P3-02', GRAMMAR, 'The team lacked access to cutting-edge equipment; _______, their findings were remarkably accurate.', ['nonetheless', 'accordingly', 'in addition', 'for instance'], 'nonetheless', "Penanda kontras 'nonetheless' menghubungkan keterbatasan alat dengan akurasi tinggi."),
  mcq('Q-SK21-P3-03', GRAMMAR, '_______ intense competition in the domestic market, the startup achieved profitability.', ['Despite', 'Although', 'Even if', 'Whereas'], 'Despite', "'Despite' diikuti oleh noun phrase 'intense competition...''."),
  fill('Q-SK21-P3-04', GRAMMAR, 'The scientist _______ hypothesis revolutionized astrophysics was honored internationally.', ['whose'], "Kepemilikan hipotesis ilmiah: 'whose hypothesis'.", 1),
  mcq('Q-SK21-P3-05', GRAMMAR, 'The research laboratory is a sterile environment _______ sensitive genetic experiments are performed.', ['where', 'which', 'that', 'whom'], 'where', "Relative adverb tempat: 'where sensitive genetic experiments are performed'."),
  fill('Q-SK21-P3-06', GRAMMAR, 'The new environmental legislation _______ (enact) by parliament earlier this year.', ['was enacted'], "Past Simple Passive: 'was enacted'.", 2),
  error('Q-SK21-P3-07', GRAMMAR, 'Pilih kata yang membuat kalimat pasif modal ini salah.', ['The', 'hazardous', 'materials', 'must', 'dispose', 'of', 'in', 'designated', 'containers.'], [4], "Pasif modal: must + be + V3 -> 'be disposed'."),
  mcq('Q-SK21-P3-08', GRAMMAR, 'If the municipal council _______ more bus routes, fewer commuters would drive cars.', ['provided', 'provides', 'will provide', 'would provide'], 'provided', "Second conditional: if + Past Simple ('provided') berpasangan dengan would + bare verb."),
  mcq('Q-SK21-P3-09', GRAMMAR, 'If the emergency brakes had failed, the locomotive _______ off the tracks.', ['would have derailed', 'would derail', 'will derail', 'derailed'], 'would have derailed', "Third conditional: if + Past Perfect, would have + V3."),
  { question_id: 'Q-SK21-P3-10', question_type: 'SENTENCE_REORDER', skill: GRAMMAR, prompt: 'Susun segmen menjadi kalimat pasif proses yang efektif.', segments: ['Unless properly maintained,', 'the filtration machinery', 'can be damaged by sediment buildup.'], explanation_id: "Klausa kondisional 'Unless...' diletakkan di depan lalu diikuti subjek pasif." },
  match('MATCHING_DROPDOWN', 'Q-SK21-P3-11', GRAMMAR, 'Pasangkan kata transisi berikut dengan fungsi wacananya.',
    ['in contrast', 'hence', 'likewise', 'specifically'],
    ['introduces a logical consequence', 'points to a detailed instance', 'highlights a direct difference', 'indicates similarity between ideas', 'signals chronological progression'], [2, 0, 3, 1],
    "In contrast = perbedaan; hence = konsekuensi logis; likewise = kemiripan ide; specifically = contoh spesifik."),
  fill('Q-SK21-P3-12', GRAMMAR, 'If the atmospheric pressure _______ (fall) rapidly, a severe storm is likely to develop.', ['falls'], "First conditional: if + Present Simple tunggal 'falls'.", 1),
];

const skipQuestions = [...skip_P1, ...skip_P2, ...skip_P3];

// =================================================================
// GS-6: Boss Tier 1 (Reading, Writing, Speaking, Listening)
// =================================================================
const bossReading_P1 = [
  mcq('Q-BR-P1-01', R, 'What time does the market close?', ['12:00', '1:00 pm', '2:00 pm', '3:00 pm'], '2:00 pm', "Paragraf 1: 'closes at two in the afternoon'.", { passage_no: 1 }),
  mcq('Q-BR-P1-02', R, 'What do Maya and her husband do on Friday evening?', ['They drive to the market.', 'They pick the vegetables.', 'They sell vegetables to customers.', 'They visit the town council.'], 'They pick the vegetables.', "Paragraf 2: 'On Friday evening they pick the vegetables'.", { passage_no: 1 }),
  mcq('Q-BR-P1-03', R, 'Why does Maya like working at the market?', ['She earns a lot of money.', 'She enjoys talking to the customers.', 'She likes driving the old van.', 'She wants to learn about cooking.'], 'She enjoys talking to the customers.', "Maya berkata 'I like to talk to the customers'.", { passage_no: 1 }),
  tfng('Q-BR-P1-04', R, 'The market stays open when it rains heavily.', 'True', "Paragraf 3: 'If it rains heavily, the market stays open'.", { passage_no: 1 }),
  tfng('Q-BR-P1-05', R, 'Visitors must pay an entrance fee.', 'False', "Paragraf 3: 'There is no entrance fee'.", { passage_no: 1 }),
  tfng('Q-BR-P1-06', R, 'The new cafe will open this year.', 'False', "Paragraf 4: kafe 'will not open until next year'.", { passage_no: 1 }),
  tfng('Q-BR-P1-07', R, 'Mr Chen has lived in the town all his life.', 'Not Given', "Lama waktu Mr Chen tinggal di kota tidak dibahas.", { passage_no: 1 }),
  fill('Q-BR-P1-08', R, 'Sellers pay the town council £ _______ each week.', ['8', 'eight', '£8'], "Paragraf 3: 'the sellers pay the town council eight pounds each week'.", 2, { passage_no: 1 }),
  short('Q-BR-P1-09', R, 'Apa yang dibeli Mr Chen setiap minggu? (Maksimal DUA kata)', ['flowers'], 2, "Paragraf 5: 'buy flowers for his kitchen table'.", { passage_no: 1 }),
  short('Q-BR-P1-10', R, 'Di mana seorang pria muda memainkan gitar? (Maksimal TIGA kata)', ['near the entrance', 'by the entrance', 'at the entrance'], 3, "Paragraf 3: 'plays the guitar near the entrance'.", { passage_no: 1 }),
];

const bossReading_P2 = [
  mcq('Q-BR-P2-01', R, 'At what hour does trade officially conclude on market day?', ['Midday', '1:00 pm', '2:00 pm', '4:00 pm'], '2:00 pm', "Paragraf 1: pasar tutup pukul dua siang ('two in the afternoon').", { passage_no: 1 }),
  mcq('Q-BR-P2-02', R, 'Which task occupies Maya and her spouse on the eve of the market?', ['Sorting cardboard boxes', 'Harvesting garden produce', 'Delivering to restaurants', 'Cleaning market stalls'], 'Harvesting garden produce', "Paragraf 2: mereka memetik sayuran ('pick the vegetables') pada Jumat malam.", { passage_no: 1 }),
  mcq('Q-BR-P2-03', R, 'What is Maya principal reason for finding market work rewarding?', ['The financial profit', 'Engaging in conversations with patrons', 'Working outdoors in all seasons', 'Receiving tips from locals'], 'Engaging in conversations with patrons', "Maya menyukai interaksi langsung dengan para pembeli.", { passage_no: 1 }),
  tfng('Q-BR-P2-04', R, 'Severe downpours cause the outdoor market to cancel trading.', 'False', "Paragraf 3 menyatakan pasar tetap beroperasi walau hujan deras ('market stays open').", { passage_no: 1 }),
  tfng('Q-BR-P2-05', R, 'General admission tickets are required to enter the town square market.', 'False', "Paragraf 3 menyatakan masuk gratis tanpa tiket ('no entrance fee').", { passage_no: 1 }),
  tfng('Q-BR-P2-06', R, 'Construction of the proposed cafe will finish before winter this year.', 'False', "Paragraf 4 menyatakan kafe baru belum akan dibuka sampai tahun depan ('not open until next year').", { passage_no: 1 }),
  tfng('Q-BR-P2-07', R, 'Mr Chen was a secondary school mathematics educator before retiring.', 'Not Given', "Mr Chen disebut sebagai pensiunan guru ('retired teacher'), tetapi bidang pelajarannya tidak disebutkan.", { passage_no: 1 }),
  fill('Q-BR-P2-08', R, 'The stallholder permit fee paid to local authorities is £ _______ weekly.', ['8', 'eight', '£8'], "Biaya sewa lapak pedagang adalah delapan pound (£8).", 2, { passage_no: 1 }),
  short('Q-BR-P2-09', R, 'What regular purchase does Mr Chen make for his home? (Maximum TWO words)', ['flowers', 'fresh flowers'], 2, "Mr Chen rutin membeli 'flowers' untuk meja dapurnya.", { passage_no: 1 }),
  short('Q-BR-P2-10', R, 'Near which spot does the busker perform music? (Maximum THREE words)', ['the entrance', 'near the entrance', 'market entrance'], 3, "Pemain gitar akustik tampil di dekat pintu masuk ('near the entrance').", { passage_no: 1 }),
];

const bossReading_P3 = [
  mcq('Q-BR-P3-01', R, 'When does the community farmers market end its operations?', ['11:30 am', '1:00 pm', '2:00 pm', '5:00 pm'], '2:00 pm', "Penutupan pukul 2:00 pm.", { passage_no: 1 }),
  mcq('Q-BR-P3-02', R, 'What preparation takes place on Friday afternoon and night?', ['Baking bread loaves', 'Harvesting the vegetables', 'Painting display tables', 'Loading heavy machinery'], 'Harvesting the vegetables', "Memetik sayuran segar untuk persiapan besok pagi.", { passage_no: 1 }),
  mcq('Q-BR-P3-03', R, 'What aspect of the weekly market gives Maya the most satisfaction?', ['Negotiating bulk prices', 'Conversing with regular visitors', 'Setting up the canopy', 'Driving home early'], 'Conversing with regular visitors', "Interaksi ramah dengan para pelanggan lokal.", { passage_no: 1 }),
  tfng('Q-BR-P3-04', R, 'Inclement wet weather does not shut down the market activities.', 'True', "Pasar tetap buka meski hujan deras.", { passage_no: 1 }),
  tfng('Q-BR-P3-05', R, 'Customers have to pay an entry tariff to walk through the stalls.', 'False', "Pengunjung tidak dikenakan biaya masuk apa pun.", { passage_no: 1 }),
  tfng('Q-BR-P3-06', R, 'The town council plans to inaugurate the new market cafe in the current calendar year.', 'False', "Kafe baru dijadwalkan tahun depan.", { passage_no: 1 }),
  tfng('Q-BR-P3-07', R, 'Mr Chen travels from an adjacent rural village every Saturday morning.', 'Not Given', "Asal tempat tinggal Mr Chen tidak dirinci dalam teks.", { passage_no: 1 }),
  fill('Q-BR-P3-08', R, 'Merchants submit a weekly fee of £ _______ to municipal officials.', ['8', 'eight', '£8'], "Pedagang membayar delapan pound.", 2, { passage_no: 1 }),
  short('Q-BR-P3-09', R, 'Which decorative item does Mr Chen acquire each Saturday? (Maximum TWO words)', ['flowers'], 2, "Bunga ('flowers') untuk meja dapurnya.", { passage_no: 1 }),
  short('Q-BR-P3-10', R, 'Where does the musician station himself to play his acoustic instrument? (Maximum THREE words)', ['near the entrance', 'at the entrance', 'by the entrance'], 3, "Di dekat pintu gerbang masuk pasar.", { passage_no: 1 }),
];

const bossReadingQ = [...bossReading_P1, ...bossReading_P2, ...bossReading_P3];

const bossListening_P1 = [
  fill('Q-BL-P1-01', L, 'Monthly rent: £ _______', ['450', '£450', 'four hundred and fifty'], "Agen menyebut 'four hundred and fifty pounds a month'.", 2, { section_no: 1 }),
  fill('Q-BL-P1-02', L, 'The room is on the _______ floor.', ['second', '2nd'], "Agen berkata 'It's on the second floor'.", 1, { section_no: 1 }),
  mcq('Q-BL-P1-03', L, 'What is included in the rent?', ['Electricity', 'Water', 'The internet', 'Cleaning'], 'The internet', "'The rent includes the internet'.", { section_no: 1 }),
  short('Q-BL-P1-04', L, 'Apa yang harus dibawa penelepon saat melihat kamar? (Maksimal SATU kata)', ['passport'], 1, "Agen meminta 'Please bring your passport'.", { section_no: 1 }),
  mcq('Q-BL-P1-05', L, 'What time will the bus leave on Friday?', ['8:00 am', '8:15 am', '8:30 am', '3:30 pm'], '8:15 am', "'A quarter past eight' sama dengan 8:15.", { section_no: 2 }),
  fill('Q-BL-P1-06', L, 'Everybody must bring a _______ and a bottle of water.', ['packed lunch'], "Guru berkata 'bring a packed lunch and a bottle of water'.", 2, { section_no: 2 }),
  mcq('Q-BL-P1-07', L, 'What will the students do first at the museum?', ['Complete the worksheet', 'Visit the exhibition rooms', 'Watch a short film', 'Have lunch'], 'Watch a short film', "'First, we will watch a short film'.", { section_no: 2 }),
  mcq('Q-BL-P1-08', L, 'What topic do Anna and Tom choose?', ['Travel', 'Recycling', 'Music', 'Sport'], 'Recycling', "Anna mengusulkan recycling dan disetujui Tom.", { section_no: 3 }),
  short('Q-BL-P1-09', L, 'Siapa yang akan mencari gambar? (Maksimal SATU kata)', ['Anna'], 1, "Anna berkata 'I'll find the pictures'.", { section_no: 3 }),
  fill('Q-BL-P1-10', L, 'They will meet in the _______ on Thursday.', ['library', 'the library'], "Mereka sepakat bertemu di library.", 2, { section_no: 3 }),
];

const bossListening_P2 = [
  fill('Q-BL-P2-01', L, 'Agreed studio lease cost: £ _______ per month', ['520', '£520', 'five hundred and twenty'], "Agen properti mengutip £520 per bulan.", 2, { section_no: 1 }),
  fill('Q-BL-P2-02', L, 'The vacant apartment is situated on the _______ story.', ['third', '3rd'], "Unit berada di lantai tiga ('third floor').", 1, { section_no: 1 }),
  mcq('Q-BL-P2-03', L, 'Which utility expense is covered within the base rent?', ['Central heating', 'Council tax', 'Wi-Fi broadband', 'Water supply'], 'Wi-Fi broadband', "Sewa bulanan sudah mencakup akses internet nirkabel (broadband).", { section_no: 1 }),
  short('Q-BL-P2-04', L, 'What primary identity credential must the tenant present for tenancy check? (Maximum ONE word)', ['passport', 'ID'], 1, "Penyewa wajib membawa paspor asli.", { section_no: 1 }),
  mcq('Q-BL-P2-05', L, 'What is the precise coach departure time for the educational excursion?', ['8:15 am', '8:45 am', '9:00 am', '2:30 pm'], '8:45 am', "Bus pariwisata berangkat tepat pukul 'a quarter to nine' (8:45 am).", { section_no: 2 }),
  fill('Q-BL-P2-06', L, 'Participants must pack their own _______ and refillable beverage container.', ['packed lunch', 'lunch'], "Siswa diwajibkan membawa bekal makan siang ('packed lunch').", 2, { section_no: 2 }),
  mcq('Q-BL-P2-07', L, 'What activity precedes the gallery tour upon arrival at the science center?', ['Introductory video screening', 'Audio guide assignment', 'Cafeteria snack break', 'Museum gift shop visit'], 'Introductory video screening', "Rombongan terlebih dahulu menonton penayangan video pengantar.", { section_no: 2 }),
  mcq('Q-BL-P2-08', L, 'Which project theme do Liam and Sophie finalize for their presentation?', ['Urban biodiversity', 'Plastic waste management', 'Solar transport', 'Ancient trade'], 'Plastic waste management', "Mereka sepakat memilih topik pengelolaan limbah plastik.", { section_no: 3 }),
  short('Q-BL-P2-09', L, 'Who assumes responsibility for designing visual presentation slides? (Maximum ONE word)', ['Liam'], 1, "Liam bertugas mendesain dan menyiapkan visual slide.", { section_no: 3 }),
  fill('Q-BL-P2-10', L, 'The study partners scheduled their rehearsal in the campus _______ study hall.', ['library', 'main library'], "Tempat latihan presentasi diputuskan di ruang baca perpustakaan.", 2, { section_no: 3 }),
];

const bossListening_P3 = [
  fill('Q-BL-P3-01', L, 'Fixed accommodation tariff: £ _______ per calendar month', ['480', '£480', 'four hundred and eighty'], "Biaya sewa kamar adalah £480 per bulan.", 2, { section_no: 1 }),
  fill('Q-BL-P3-02', L, 'The bedroom is located on the _______ level of the annex.', ['first', '1st', 'ground'], "Kamar tidur terletak di lantai satu ('first floor').", 1, { section_no: 1 }),
  mcq('Q-BL-P3-03', L, 'Which service is bundled into the recurring rental fee without surcharge?', ['Gas heating', 'High-speed internet', 'Weekly linen laundering', 'Parking space'], 'High-speed internet', "Biaya sewa mencakup layanan internet berkecepatan tinggi.", { section_no: 1 }),
  short('Q-BL-P3-04', L, 'What official identification must prospective tenants furnish during inspection? (Maximum ONE word)', ['passport'], 1, "Petugas meminta penyewa membawa paspor.", { section_no: 1 }),
  mcq('Q-BL-P3-05', L, 'When will the departure shuttle commence boarding on the trip morning?', ['7:45 am', '8:15 am', '8:30 am', '9:15 am'], '8:15 am', "Keberangkatan shuttle ditetapkan pada pukul 8:15 am.", { section_no: 2 }),
  fill('Q-BL-P3-06', L, 'Every attendee is required to carry a _______ along with water.', ['packed lunch'], "Setiap siswa harus membawa bekal 'packed lunch'.", 2, { section_no: 2 }),
  mcq('Q-BL-P3-07', L, 'Which introductory event is scheduled first on the museum itinerary?', ['A documentary screening', 'A scavenger hunt', 'A curator lecture', 'Souvenir shopping'], 'A documentary screening', "Menonton penayangan film dokumenter pendek terlebih dahulu.", { section_no: 2 }),
  mcq('Q-BL-P3-08', L, 'What assignment topic is chosen by the academic research pair?', ['Ocean conservation', 'Household recycling habits', 'Renewable solar tech', 'Public parks'], 'Household recycling habits', "Pasangan peneliti memilih topik kebiasaan daur ulang rumah tangga.", { section_no: 3 }),
  short('Q-BL-P3-09', L, 'Which team member will curate photographic evidence and diagrams? (Maximum ONE word)', ['Anna', 'Sophie'], 1, "Rekan tim perempuan bertugas mengumpulkan materi foto dan diagram.", { section_no: 3 }),
  fill('Q-BL-P3-10', L, 'The collaborative review session will be conducted inside the university _______ lounge.', ['library'], "Sesi telaah bersama diselenggarakan di perpustakaan kampus.", 2, { section_no: 3 }),
];

const bossListeningQ = [...bossListening_P1, ...bossListening_P2, ...bossListening_P3];

const writingExplain = [
  'Panduan penilaian mandiri IELTS Academic Writing Task 2:',
  '1. Task Achievement: Apakah esai minimal 150 kata? Apakah kedua pandangan dibahas dengan bobot seimbang dan pendapat pribadi dinyatakan jelas di pembuka dan penutup?',
  '2. Coherence & Cohesion: Apakah struktur paragraf jelas (Intro, Body 1, Body 2, Conclusion) dengan transisi logis?',
  '3. Lexical Resource: Variasi kosakata akademik sesuai topik, kolokasi natural, dan akurasi ejaan.',
  '4. Grammatical Range & Accuracy: Penggunaan perpaduan kalimat sederhana, majemuk, dan bentuk pasif/kondisional secara presisi.',
].join('\n');

const speakingExplain = [
  'Panduan penilaian mandiri IELTS Speaking Part 2:',
  '1. Fluency & Coherence: Berbicara lancar selama 2 menit tanpa jeda panjang, alur runtut.',
  '2. Lexical Resource: Pilihan kata deskriptif, idiom kontekstual, dan parafrase.',
  '3. Grammatical Range: Konsistensi tenses (past simple untuk pengalaman lampau, present simple untuk fakta).',
  '4. Pronunciation: Artikulasi vokal/konsonan jelas, word stress tepat, dan intonasi bermakna.',
].join('\n');

const boss = [
  { set_type: 'TIER_BOSS_EXAM', title: 'Boss Stage Tier 1: Foundation', tier_number: 1, origin: ORIGIN, source_code: 'OWN', questions: [] },
  {
    set_type: 'BOSS_SECTION', title: 'Boss Tier 1 - Reading', tier_number: 1, skill_category: 'READING', time_limit_seconds: 1200, pass_percent: 80,
    reading_passage_markdown: md('boss-reading.md'), origin: ORIGIN, source_code: 'OWN', questions: bossReadingQ,
  },
  {
    set_type: 'BOSS_SECTION', title: 'Boss Tier 1 - Writing', tier_number: 1, skill_category: 'WRITING', time_limit_seconds: 1800, origin: ORIGIN, source_code: 'OWN',
    questions: [
      {
        question_id: 'Q-BW-P1-01', question_type: 'WRITING_TASK', skill: 'WRITING', task_kind: 'TASK2', min_words: 150, time_limit_minutes: 30,
        prompt: 'Some people think that children should help with household jobs such as cleaning and cooking. Other people think that children should spend their time only on study and play.\n\nDiscuss both views and give your own opinion.\n\nWrite at least 150 words.',
        explanation_id: writingExplain,
      },
      {
        question_id: 'Q-BW-P2-01', question_type: 'WRITING_TASK', skill: 'WRITING', task_kind: 'TASK2', min_words: 150, time_limit_minutes: 30,
        prompt: 'Some educators argue that traditional face-to-face classroom teaching is the most effective way to learn. Others believe that online distance learning offers superior benefits for students today.\n\nDiscuss both views and give your own opinion.\n\nWrite at least 150 words.',
        explanation_id: writingExplain,
      },
      {
        question_id: 'Q-BW-P3-01', question_type: 'WRITING_TASK', skill: 'WRITING', task_kind: 'TASK2', min_words: 150, time_limit_minutes: 30,
        prompt: 'Some people argue that public transportation should be completely free of charge for all citizens, funded by general taxation. Others believe that passengers should pay for the services they use.\n\nDiscuss both views and give your own opinion.\n\nWrite at least 150 words.',
        explanation_id: writingExplain,
      },
    ],
  },
  {
    set_type: 'BOSS_SECTION', title: 'Boss Tier 1 - Speaking', tier_number: 1, skill_category: 'SPEAKING', time_limit_seconds: 300, origin: ORIGIN, source_code: 'OWN',
    questions: [
      {
        question_id: 'Q-BS-P1-01', question_type: 'SPEAKING_TASK', skill: 'SPEAKING', part: 2, prep_seconds: 60, record_seconds: 120,
        prompt: 'Describe a place in your town or village where you like to spend your free time.\nYou should say:\nwhere the place is and what it looks like\nwhat you usually do there\nwhy you like to go there\nand explain how you feel about this place.',
        cue_points: ['where the place is and what it looks like', 'what you usually do there', 'why you like to go there'],
        explanation_id: speakingExplain,
      },
      {
        question_id: 'Q-BS-P2-01', question_type: 'SPEAKING_TASK', skill: 'SPEAKING', part: 2, prep_seconds: 60, record_seconds: 120,
        prompt: 'Describe an important practical skill that you learned outside school.\nYou should say:\nwhat the skill is and who taught it to you\nhow long it took to learn it\nhow you use this skill in daily life\nand explain why this skill is valuable to you.',
        cue_points: ['what the skill is and who taught it to you', 'how long it took to learn it', 'how you use this skill in daily life'],
        explanation_id: speakingExplain,
      },
      {
        question_id: 'Q-BS-P3-01', question_type: 'SPEAKING_TASK', skill: 'SPEAKING', part: 2, prep_seconds: 60, record_seconds: 120,
        prompt: 'Describe a public park or green area in your city that you enjoy visiting.\nYou should say:\nwhere it is located and how to reach it\nwhat facilities and vegetation it features\nwhat people do when they visit it\nand explain why this public space is important to your community.',
        cue_points: ['where it is located and how to reach it', 'what facilities and vegetation it features', 'what people do when they visit it'],
        explanation_id: speakingExplain,
      },
    ],
  },
];

const bossListening = {
  set_type: 'BOSS_SECTION', title: 'Boss Tier 1 - Listening', tier_number: 1, skill_category: 'LISTENING', time_limit_seconds: 1200, pass_percent: 80,
  listening_asset_code: 'gs/listening/boss-t1', origin: ORIGIN, source_code: 'OWN', questions: bossListeningQ,
};

// ----------------------------------------------------------------- rakit paket
const pkg = {
  contract_version: '1.1',
  sub_modules: [gs1, gs3, gs2].sort((a, b) => a.sub_module_code.localeCompare(b.sub_module_code)),
  assessment_sets: [
    { set_type: 'PLACEMENT_TEST', title: 'Placement Test IELTS (Golden Sample, 30 soal)', time_limit_seconds: 1500, origin: ORIGIN, source_code: 'OWN', questions: placement },
    { set_type: 'SKIP_MODULE_TEST', title: 'Skip Test Modul 2.1: Complex Grammar & Sentence Combining', module_code: '2.1', time_limit_seconds: 900, pass_percent: 85, origin: ORIGIN, source_code: 'OWN', questions: skipQuestions },
    ...boss,
  ],
};

writeFileSync(path.join(root, 'content.json'), JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(path.join(root, 'pending', 'boss-t1-listening.section.json'), JSON.stringify(bossListening, null, 2) + '\n');

// Ringkasan
console.log('=== PAKET KONTEN 3 VARIASI BERHASIL DIBANGUN ===');
console.log('GS-1 Passive Voice:', gs1Questions.length, 'soal (3 paket x 10 soal)');
console.log('GS-2 Reading TFNG:', gs2Questions.length, 'soal (3 paket x 10 soal)');
console.log('GS-3 Listening:', gs3Questions.length, 'soal (3 paket x 10 soal)');
console.log('Skip Modul 2.1:', skipQuestions.length, 'soal (3 paket x 12 soal)');
console.log('Boss Reading:', bossReadingQ.length, 'soal (3 paket x 10 soal)');
console.log('Boss Listening:', bossListeningQ.length, 'soal (3 paket x 10 soal)');
console.log('Boss Writing:', boss[2].questions.length, 'varian prompt (3 paket)');
console.log('Boss Speaking:', boss[3].questions.length, 'varian prompt (3 paket)');
