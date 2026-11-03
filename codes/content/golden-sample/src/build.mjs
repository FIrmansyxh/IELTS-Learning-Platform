// Membangun content.json (+ pending/boss-t1-listening.section.json) dari berkas sumber di src/.
// Jalankan: node content/golden-sample/src/build.mjs   (dari folder codes/)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const md = (f) => readFileSync(path.join(here, f), 'utf8').replace(/\r\n/g, '\n').trim();

const ORIGIN = 'AI_GENERATED_REVIEWED'; // ditulis AI; peninjauan pemilik MASIH DITUNGGU (status impor = DRAFT)
const GRAMMAR = 'GRAMMAR';

// ----------------------------------------------------------------- pembangun soal
const mcq = (id, skill, prompt, options, answer, explanation_id, extra = {}) => ({
  question_id: id, question_type: 'MCQ_SINGLE', skill, prompt, options, correct_answers: [answer], explanation_id, ...extra,
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

// ----------------------------------------------------------------- GS-1: 2.1.3 Passive Voice
const gs1Questions = [
  fill('Q-213-01', GRAMMAR, "Lengkapi kalimat berikut dengan bentuk pasif dari kata di dalam kurung:\n'Once the grapes _______ (harvest), they are taken to the factory.'", ['have been harvested'],
    "Kalimat memakai 'Once ... , they are taken', yaitu rangkaian proses. Tindakan memanen sudah selesai sebelum pengangkutan, sehingga dipakai Present Perfect Passive: has/have been + V3. Subjek 'the grapes' jamak, jadi 'have been harvested'.", 3),
  fill('Q-213-02', GRAMMAR, "Lengkapi dengan bentuk pasif Present Simple:\n'The final product _______ (sell) in supermarkets across the country.'", ['is sold'],
    "Ini fakta umum tentang proses, sehingga Present Simple. Subjek 'the final product' tunggal, jadi 'is'. V3 dari 'sell' adalah 'sold' (tidak beraturan), bukan 'selled'.", 3),
  fill('Q-213-03', GRAMMAR, "Lengkapi dengan pasif modal (gunakan 'must'):\n'Waste water _______ (treat) before it is released into the river.'", ['must be treated'],
    "Pasif modal dibentuk modal + be + V3. Setelah 'must' kata kerja berbentuk dasar, jadi 'be' (bukan 'is'), lalu 'treated'.", 3),
  mcq('Q-213-04', GRAMMAR, 'Manakah kalimat yang paling tepat untuk laporan akademik tentang proses pembuatan kopi?',
    ['People grind the coffee beans in a machine.', 'The coffee beans are ground in a mechanical grinder.', 'The coffee beans is ground in a machine.', 'The coffee beans are grind in a machine.'],
    'The coffee beans are ground in a mechanical grinder.',
    "Pilihan B memakai pasif yang benar: 'beans' jamak + 'are' + V3 'ground'. Pilihan A bersifat aktif dengan pelaku yang tidak penting. Pilihan C salah kesesuaian subjek-be ('beans ... is'). Pilihan D memakai bentuk dasar 'grind', bukan V3."),
  mcq('Q-213-05', GRAMMAR, "Pilih bentuk pasif yang benar dari kalimat: 'Engineers have repaired the bridge.'",
    ['The bridge has been repaired by engineers.', 'The bridge was repaired by engineers.', 'The bridge has repaired by engineers.', 'The bridge have been repaired by engineers.'],
    'The bridge has been repaired by engineers.',
    "Kalimat aktif memakai Present Perfect, maka pasifnya has/have been + V3. Subjek baru 'the bridge' tunggal, jadi 'has been repaired'. Pilihan B mengubah tense menjadi Past Simple, C kehilangan 'been', D salah kesesuaian."),
  mcq('Q-213-06', GRAMMAR, "Pada kalimat mana frasa 'by + pelaku' sebaiknya dihapus karena tidak memberi informasi baru?",
    ['The painting was created by Leonardo da Vinci.', 'The samples were tested by people.', "The report was written by a team from the national statistics office.", 'The theory was proposed by two Australian biologists.'],
    'The samples were tested by people.',
    "'By people' tidak memberi informasi karena pengujian tentu dilakukan oleh orang. Pada pilihan lain, pelaku menambah informasi penting (pembuat lukisan, penulis laporan, pengusul teori)."),
  mcq('Q-213-07', GRAMMAR, "Pilih jawaban yang benar: 'The recycled paper can _______ into new boxes.'",
    ['turn', 'be turned', 'been turned', 'being turn'], 'be turned',
    "Pasif modal: modal + be + V3. Setelah 'can' dipakai 'be', lalu 'turned'. 'Been' hanya dipakai setelah have/has/had, dan 'being turn' bukan bentuk yang valid."),
  {
    question_id: 'Q-213-08', question_type: 'SENTENCE_REORDER', skill: GRAMMAR,
    prompt: 'Susun segmen berikut menjadi kalimat pasif yang benar tentang proses pasteurisasi susu.',
    segments: ['The raw milk', 'is first', 'heated to 72 degrees', 'and then cooled quickly.'],
    explanation_id: "Urutan yang benar: subjek (The raw milk), be (is) dengan kata urutan 'first', kata kerja V3 beserta keterangan (heated to 72 degrees), lalu bagian akhir (and then cooled quickly). Kata 'first' diletakkan setelah be, seperti pada banyak kalimat proses.",
  },
  error('Q-213-09', GRAMMAR, 'Pilih satu kata yang membuat kalimat pasif ini salah.',
    ['The', 'cement', 'is', 'mix', 'with', 'water', 'in', 'a', 'large', 'drum.'], [3],
    "Setelah 'is' dibutuhkan V3, yaitu 'mixed'. 'Mix' adalah bentuk dasar, sehingga kalimat seharusnya 'The cement is mixed with water in a large drum.'"),
  match('MATCHING_DROPDOWN', 'Q-213-10', GRAMMAR, 'Pasangkan setiap kalimat aktif dengan kalimat pasif yang tepat.',
    ['Workers pick the tea leaves by hand.', 'Someone stole my wallet yesterday.', 'Scientists have developed a new vaccine.', 'The council will close the road next week.'],
    ['The road will be closed next week.', 'My wallet was stolen yesterday.', 'Tea leaves are picked by hand.', 'A new vaccine has been developed.', 'A new vaccine is developed.'],
    [2, 1, 3, 0],
    "Samakan tense: Present Simple menjadi 'are picked', Past Simple menjadi 'was stolen', Present Perfect menjadi 'has been developed', dan Future menjadi 'will be closed'. Pilihan terakhir ('is developed') adalah pengecoh karena mengubah Present Perfect menjadi Present Simple."),
];

const gs1 = {
  tier_number: 2, module_code: '2.1', module_category: 'GRAMMAR', sub_module_code: '2.1.3',
  sub_module_title: 'Passive Voice untuk Deskripsi Proses & Laporan Ilmiah',
  passing_score_percent: 75, origin: ORIGIN, source_code: 'OWN',
  materials: {
    article_markdown: md('gs1-passive-voice.md'),
    // videos: SENGAJA KOSONG. ID YouTube nyata harus dipilih pemilik (backlog C-08); jangan dikarang.
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

// ----------------------------------------------------------------- GS-2: 3.2.1 Reading TFNG
const R = 'READING';
const gs2Passage = md('gs2-passage.md');
const gs2Questions = [
  tfng('Q-321-01', R, 'On the hottest afternoons, the surface of the bare roofs was hotter than the surface of the planted roofs.', 'True',
    "Paragraf B: bare roofs mencapai hingga 62 derajat, sedangkan planted roofs sekitar 34 derajat. Pernyataan sesuai dengan teks.", { passage_no: 1 }),
  tfng('Q-321-02', R, 'The researchers measured roof temperatures over a period of five years.', 'False',
    "Paragraf B menyebut 'over three summers'. Lima tahun muncul di paragraf G untuk usia farm tertua, bukan lama pengukuran. Teks bertentangan dengan pernyataan.", { passage_no: 1 }),
  tfng('Q-321-03', R, 'The researchers believe that rooftop farms could supply most of the vegetables a city needs.', 'False',
    "Paragraf C: 'nobody involved in the study suggested that roofs could feed a city'. Teks menyatakan hal yang berlawanan.", { passage_no: 1 }),
  tfng('Q-321-04', R, 'Planted roofs held back more than half of the rain that fell in an average storm.', 'True',
    "Paragraf D: planted roofs menahan sekitar 60 persen hujan pada badai rata-rata. 60 persen lebih dari setengah, sehingga pernyataan benar.", { passage_no: 1 }),
  tfng('Q-321-05', R, 'Owners who received tax reductions were happier with their roof gardens than other owners.', 'Not Given',
    "Paragraf E membahas keringanan pajak, tetapi hanya dari sisi pengaruhnya pada keputusan memasang atap tanam. Tingkat kepuasan pemilik tidak dibahas.", { passage_no: 1 }),
  tfng('Q-321-06', R, 'Most of the volunteers at the roof farms were retired people.', 'Not Given',
    "Paragraf F menyebut relawan dan pertemanan, tetapi tidak menyebut usia atau status pensiun mereka.", { passage_no: 1 }),
  {
    question_id: 'Q-321-07', question_type: 'MCQ_MULTI', skill: R, passage_no: 1,
    prompt: 'Pilih DUA manfaat rooftop farming yang menurut peneliti paling kuat didukung oleh bukti mereka.',
    options: ['Cooling the buildings beneath them', 'Helping to manage rainwater', "Feeding most of the city's population", 'Lowering the tax paid by building owners', 'Increasing the value of buildings built before the 1970s'],
    correct_answers: ['Cooling the buildings beneath them', 'Helping to manage rainwater'],
    explanation_id: "Paragraf G: rooftop farming 'most convincing as a way of cooling buildings and managing rainwater'. Pilihan lain bertentangan dengan paragraf C (tidak bisa memberi makan kota) atau tidak dibahas sebagai manfaat.",
    points: 2,
  },
  match('MATCHING_DROPDOWN', 'Q-321-08', R, 'Pada paragraf mana (A-G) informasi berikut ditemukan?',
    ['A comparison of the cost of strengthening a roof with the cost of the garden itself', 'A reason to be careful about the opinions of volunteers', 'A suggestion about how long future research should last', 'Figures showing the temperature difference between two kinds of roof'],
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'], [4, 5, 6, 1],
    "Biaya perkuatan atap ada di paragraf E; kehati-hatian terhadap pendapat relawan di F (mereka memilih ikut serta); saran lama penelitian (sepuluh tahun) di G; angka suhu atap kosong versus atap tanam di B.",
    { passage_no: 1 }),
  short('Q-321-09', R, 'Apa yang dikumpulkan oleh farm yang lebih baru pada musim dingin untuk dipakai pada musim panas? (Maksimal TIGA kata)', ['rainwater', 'rain water'], 3,
    "Paragraf D: 'tanks that collect rainwater in winter and release it slowly in summer'. Jawaban: rainwater.", { passage_no: 1 }),
  short('Q-321-10', R, 'Siswa sekolah dasar mengunjungi salah satu atap setiap bulan untuk belajar tentang apa? (Maksimal TIGA kata)', ['how vegetables grow', 'vegetables growing'], 3,
    "Paragraf F: 'to learn how vegetables grow'. Jawaban terdiri dari tiga kata dan masih dalam batas yang diizinkan.", { passage_no: 1 }),
];

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

// ----------------------------------------------------------------- GS-3: 3.1.1 Listening (audio PENDING)
const L = 'LISTENING';
const gs3Questions = [
  fill('Q-311-01', L, 'Lengkapi formulir pendaftaran.\nSurname: _______', ['Brannigan'], "Penelepon mengeja nama keluarganya: B-R-A-N-N-I-G-A-N. Ejaan harus tepat.", 2, { section_no: 1 }),
  fill('Q-311-02', L, 'Course: _______ painting for beginners', ['watercolour', 'watercolor'], "Penelepon memilih 'watercolour painting'. Ejaan Inggris Britania dan Amerika sama-sama diterima.", 2, { section_no: 1 }),
  fill('Q-311-03', L, 'Start date: Tuesday, 14th _______', ['October'], "Staf menyebut 'Tuesday the fourteenth of October'. Penelepon mengulangnya: 'October the fourteenth'.", 2, { section_no: 1 }),
  fill('Q-311-04', L, 'Fee for the whole term: £ _______', ['85', '£85', '85 pounds', 'eighty-five', 'eighty five'], "Staf menyebut 'eighty-five pounds for the whole term'. Bayar sebesar 85.", 2, { section_no: 1 }),
  fill('Q-311-05', L, 'Students should bring their own _______', ['apron', 'aprons', 'an apron'], "Staf berkata 'Just an apron'. Penelepon menegaskan 'I'll bring my own'.", 2, { section_no: 1 }),
  mcq('Q-311-06', L, 'Why does Daniel want to join the course?',
    ['He wants to meet other people.', 'He wants to learn proper techniques after practising alone.', 'He needs a qualification for his job.', 'He wants to find a teacher for his children.'],
    'He wants to learn proper techniques after practising alone.',
    "Daniel berkata sudah melukis di rumah selama setahun hanya dengan meniru video, dan ingin 'learn the proper techniques from a real teacher'.", { section_no: 1 }),
  mcq('Q-311-07', L, 'What time does the class start now?', ['6:00 pm', '6:30 pm', '7:00 pm', '7:30 pm'], '7:00 pm',
    "Poster menyebut 6:30, tetapi staf mengoreksi bahwa jadwal dipindah menjadi pukul tujuh (7:00) agar peserta yang pulang kerja tidak terlambat. Ini contoh jebakan koreksi.", { section_no: 1 }),
  mcq('Q-311-08', L, 'Where will the class be held this term?', ['Room Four', 'The main hall', 'The Garden Studio', 'The cafe'], 'The Garden Studio',
    "Biasanya di Room Four, tetapi ruangan itu sedang dicat ulang sehingga kelas dipindah ke Garden Studio.", { section_no: 1 }),
  match('MATCHING_DRAG', 'Q-311-09', L, 'Sesuai penjelasan staf, di mana letak setiap fasilitas? Seret jawaban ke tempat yang benar.',
    ['The cafe', 'The cloakroom', 'The car park', 'The Garden Studio'],
    ['Next to the main entrance, on the left', 'Behind the reception desk', 'At the end of the side path', 'In a glass building in the garden', 'Opposite the stairs on the first floor'],
    [0, 1, 2, 3],
    "Kafe di sebelah pintu masuk utama (kiri); ruang penitipan mantel di belakang meja resepsionis; tempat parkir di ujung jalan setapak samping bangunan; Garden Studio adalah bangunan kaca kecil di taman. Lift berada di seberang tangga lantai satu, sehingga itu pengecoh.", { section_no: 1 }),
  short('Q-311-10', L, 'Apa yang harus ditunjukkan Daniel di meja resepsionis pada hari pertama? (Maksimal TIGA kata)', ['confirmation email', 'the confirmation email', 'email confirmation'], 3,
    "Staf berkata untuk menunjukkan 'that email' (confirmation email) kepada petugas resepsionis; boleh ditunjukkan lewat ponsel.", { section_no: 1 }),
];
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
  // listening_asset_code: ditambahkan setelah pemilik merekam audio (lihat pending/PENDING.md).
  active_drill: { time_limit_seconds: 600, pass_percent: 75, questions: gs3Questions },
};

// ----------------------------------------------------------------- GS-4: Placement 30 soal (6 per difficulty)
const P = (n, d, q) => ({ ...q, question_id: `Q-PL-${String(n).padStart(2, '0')}`, difficulty: d });
const V = 'VOCAB';
const placement = [
  // difficulty 1
  P(1, 1, mcq('', GRAMMAR, "My sister _______ a teacher.", ['is', 'are', 'am', 'be'], 'is', "Subjek 'my sister' tunggal orang ketiga, maka be yang tepat adalah 'is'.")),
  P(2, 1, mcq('', GRAMMAR, 'There are three _______ in the garden.', ['child', 'childs', 'children', 'childrens'], 'children', "'Child' memiliki bentuk jamak tidak beraturan 'children'.")),
  P(3, 1, mcq('', GRAMMAR, '_______ you like coffee?', ['Do', 'Does', 'Is', 'Are'], 'Do', "Pertanyaan Present Simple dengan subjek 'you' memakai 'do'.")),
  P(4, 1, fill('', GRAMMAR, 'She _______ (go) to school every day.', ['goes'], "Subjek orang ketiga tunggal pada Present Simple: kata kerja ditambah -es, 'goes'.", 1)),
  P(5, 1, fill('', GRAMMAR, 'I have _______ umbrella. (a / an)', ['an'], "'Umbrella' diawali bunyi vokal, sehingga memakai 'an'.", 1)),
  P(6, 1, error('', GRAMMAR, 'Pilih kata yang salah.', ['He', "don't", 'like', 'fish', 'very', 'much'], [1], "Subjek 'he' membutuhkan 'doesn't', bukan 'don't'.")),
  // difficulty 2
  P(7, 2, mcq('', GRAMMAR, 'Yesterday we _______ to the beach.', ['went', 'go', 'gone', 'goes'], 'went', "'Yesterday' menandakan Past Simple. V2 dari 'go' adalah 'went'.")),
  P(8, 2, mcq('', GRAMMAR, 'I am _______ a book at the moment.', ['reading', 'read', 'reads', 'to read'], 'reading', "'At the moment' menandakan Present Continuous: am + V-ing.")),
  P(9, 2, mcq('', GRAMMAR, 'This bag is _______ than that one.', ['heavier', 'heavy', 'more heavy', 'most heavy'], 'heavier', "Kata sifat pendek berakhir -y membentuk komparatif dengan -ier: 'heavier'.")),
  P(10, 2, fill('', GRAMMAR, "We _______ (not / have) any milk."  , ["don't have", 'do not have'], "Bentuk negatif Present Simple untuk 'we': do not / don't + kata kerja dasar.", 2)),
  P(11, 2, fill('', GRAMMAR, 'There _______ some eggs in the fridge.', ['are'], "'Some eggs' jamak, sehingga 'there are'.", 1)),
  P(12, 2, error('', GRAMMAR, 'Pilih kata yang salah.', ['Last', 'week', 'I', 'buy', 'a', 'new', 'phone'], [3], "'Last week' menandakan Past Simple; 'buy' harus menjadi 'bought'.")),
  // difficulty 3
  P(13, 3, mcq('', GRAMMAR, 'If it rains tomorrow, we _______ at home.', ['will stay', 'would stay', 'stay', 'stayed'], 'will stay', "First Conditional: if + Present Simple, will + kata kerja dasar.")),
  P(14, 3, mcq('', GRAMMAR, 'I have lived here _______ 2015.', ['for', 'since', 'during', 'from'], 'since', "'Since' dipakai dengan titik waktu awal (2015); 'for' dengan durasi.")),
  P(15, 3, mcq('', GRAMMAR, 'The man _______ lives next door is a doctor.', ['who', 'which', 'whose', 'where'], 'who', "Antecedent adalah orang dan relative pronoun berfungsi sebagai subjek: 'who'.")),
  P(16, 3, fill('', GRAMMAR, 'She asked me where I _______ (live).', ['lived'], "Reported speech: kata kerja mundur satu tense, 'live' menjadi 'lived'.", 1)),
  P(17, 3, fill('', GRAMMAR, 'The window _______ (break) by the storm last night.', ['was broken'], "Past Simple Passive: was + V3. V3 dari 'break' adalah 'broken'.", 2)),
  P(18, 3, error('', GRAMMAR, 'Pilih kata yang salah.', ['He', 'has', 'been', 'working', 'here', 'since', 'three', 'years'], [5], "Durasi ('three years') memakai 'for', bukan 'since'.")),
  // difficulty 4
  P(19, 4, mcq('', GRAMMAR, 'If I _______ more time, I would learn another language.', ['had', 'have', 'will have', 'would have'], 'had', "Second Conditional: if + Past Simple, would + kata kerja dasar.")),
  P(20, 4, mcq('', GRAMMAR, 'By the time we arrived, the film _______.', ['had already started', 'already started', 'has already started', 'was already starting'], 'had already started', "'By the time' + Past Simple memerlukan Past Perfect untuk kejadian yang lebih dulu.")),
  P(21, 4, mcq('', GRAMMAR, 'He suggested _______ a taxi because it was late.', ['taking', 'to take', 'take', 'that taking'], 'taking', "'Suggest' diikuti V-ing (atau klausa that + should).")),
  P(22, 4, fill('', GRAMMAR, 'She denied _______ (steal) the money.', ['stealing', 'having stolen'], "'Deny' diikuti gerund: 'stealing' atau 'having stolen'.", 2)),
  P(23, 4, fill('', GRAMMAR, 'The report, _______ was published last year, has been widely quoted.', ['which'], "Non-defining relative clause untuk benda memakai 'which' (tidak boleh 'that' setelah koma).", 1)),
  P(24, 4, error('', GRAMMAR, 'Pilih kata yang salah.', ['Despite', 'of', 'the', 'heavy', 'rain', 'the', 'match', 'continued'], [1], "'Despite' tidak diikuti 'of'. Yang benar 'Despite the heavy rain' atau 'In spite of the heavy rain'.")),
  // difficulty 5
  P(25, 5, mcq('', GRAMMAR, 'Had I known about the delay, I _______ earlier.', ['would have left', 'would leave', 'had left', 'will have left'], 'would have left', "Inversion Third Conditional: 'Had I known' = 'If I had known', hasilnya would have + V3.")),
  P(26, 5, mcq('', GRAMMAR, 'Not only _______ the exam, but she also won a prize.', ['did she pass', 'she passed', 'she did pass', 'passed she'], 'did she pass', "Setelah 'not only' di awal kalimat terjadi inversi subjek-auxiliary: 'did she pass'.")),
  P(27, 5, mcq('', GRAMMAR, 'The proposal, _______ by several experts, was eventually withdrawn.', ['criticised', 'criticising', 'having criticised', 'to criticise'], 'criticised', "Participle clause pasif (past participle) menggantikan 'which was criticised'.")),
  P(28, 5, fill('', GRAMMAR, 'It is essential that every student _______ (submit) the form by Friday.', ['submit', 'should submit'], "Setelah 'essential that', dipakai subjunctive (kata kerja dasar) atau 'should + kata kerja dasar'.", 2)),
  P(29, 5, fill('', GRAMMAR, 'Rarely _______ (we / see) such a dramatic improvement.', ['do we see'], "Adverbia negatif di awal kalimat memicu inversi: 'do we see'.", 3)),
  P(30, 5, error('', GRAMMAR, 'Pilih kata yang salah.', ['The', 'number', 'of', 'applicants', 'have', 'risen', 'sharply', 'this', 'year'], [4], "'The number of ...' bersubjek tunggal 'number', sehingga 'has risen'.")),
];

// ----------------------------------------------------------------- GS-5: Skip Test Modul 2.1 (12 soal)
const S = (n, q) => ({ ...q, question_id: `Q-SK21-${String(n).padStart(2, '0')}` });
const skip = [
  S(1, mcq('', GRAMMAR, '_______ the weather was terrible, the match went ahead.', ['Although', 'Because', 'So', 'Despite'], 'Although', "'Although' diikuti klausa lengkap dan menyatakan kontras. 'Despite' membutuhkan kata benda/V-ing.")),
  S(2, mcq('', GRAMMAR, 'She studied very hard; _______, she failed the exam.', ['therefore', 'however', 'moreover', 'for example'], 'however', "Hasilnya berlawanan dengan harapan, sehingga dibutuhkan penanda kontras 'however'.")),
  S(3, mcq('', GRAMMAR, '_______ his injury, he completed the race.', ['Although', 'Despite', 'However', 'Whereas'], 'Despite', "'Despite' diikuti kata benda ('his injury'). 'Although' memerlukan subjek + kata kerja.")),
  S(4, fill('', GRAMMAR, 'The woman _______ car was stolen called the police.', ['whose'], "Relative pronoun kepemilikan: 'whose car' berarti 'her car'.", 1)),
  S(5, mcq('', GRAMMAR, 'This is the office _______ I work.', ['where', 'which', 'who', 'whose'], 'where', "Antecedent adalah tempat dan klausa lengkap mengikuti, sehingga dipakai 'where'.")),
  S(6, fill('', GRAMMAR, 'The bridge _______ (build) in 1998.', ['was built'], "Past Simple Passive: was + V3. V3 'build' adalah 'built'.", 2)),
  S(7, error('', GRAMMAR, 'Pilih kata yang membuat kalimat pasif ini salah.', ['The', 'results', 'will', 'announce', 'next', 'week'], [3], "Pasif future membutuhkan 'will be announced'; 'announce' seharusnya 'be announced'.")),
  S(8, mcq('', GRAMMAR, 'If I _______ you, I would accept the offer.', ['were', 'am', 'will be', 'have been'], 'were', "Second Conditional untuk situasi imajiner memakai 'were' setelah 'if I'.")),
  S(9, mcq('', GRAMMAR, 'If she had left earlier, she _______ the train.', ['would have caught', 'would catch', 'will catch', 'had caught'], 'would have caught', "Third Conditional: if + Past Perfect, would have + V3.")),
  S(10, { question_id: '', question_type: 'SENTENCE_REORDER', skill: GRAMMAR, prompt: 'Susun segmen menjadi kalimat yang benar.', segments: ['Although it was raining,', 'we decided', 'to go for a walk.'], explanation_id: "Klausa dengan 'although' diletakkan lebih dulu dan dipisah koma, lalu klausa utama.", }),
  S(11, match('MATCHING_DROPDOWN', '', GRAMMAR, 'Pasangkan penanda wacana dengan fungsinya.',
    ['however', 'therefore', 'moreover', 'for instance'],
    ['shows a result', 'adds a similar point', 'introduces a contrast', 'gives an example', 'gives a reason'], [2, 0, 1, 3],
    "However menyatakan kontras; therefore menyatakan hasil; moreover menambah poin; for instance memberi contoh. 'Gives a reason' adalah pengecoh.")),
  S(12, fill('', GRAMMAR, 'If the temperature _______ (drop) below zero, the water will freeze.', ['drops'], "First Conditional: if + Present Simple. Subjek 'the temperature' tunggal, maka 'drops'.", 1)),
];

// ----------------------------------------------------------------- GS-6: Boss Tier 1
const bossReadingQ = [
  mcq('Q-BR-01', R, 'What time does the market close?', ['12:00', '1:00 pm', '2:00 pm', '3:00 pm'], '2:00 pm', "Paragraf 1: 'closes at two in the afternoon'.", { passage_no: 1 }),
  mcq('Q-BR-02', R, 'What do Maya and her husband do on Friday evening?', ['They drive to the market.', 'They pick the vegetables.', 'They sell vegetables to customers.', 'They visit the town council.'], 'They pick the vegetables.', "Paragraf 2: 'On Friday evening they pick the vegetables'.", { passage_no: 1 }),
  mcq('Q-BR-03', R, 'Why does Maya like working at the market?', ['She earns a lot of money.', 'She enjoys talking to the customers.', 'She likes driving the old van.', 'She wants to learn about cooking.'], 'She enjoys talking to the customers.', "Maya berkata 'I like to talk to the customers' dan itu membuat pekerjaannya lebih menarik.", { passage_no: 1 }),
  tfng('Q-BR-04', R, 'The market stays open when it rains heavily.', 'True', "Paragraf 3: 'If it rains heavily, the market stays open'.", { passage_no: 1 }),
  tfng('Q-BR-05', R, 'Visitors must pay an entrance fee.', 'False', "Paragraf 3: 'There is no entrance fee'. Yang membayar adalah penjual.", { passage_no: 1 }),
  tfng('Q-BR-06', R, 'The new cafe will open this year.', 'False', "Paragraf 4: kafe 'will not open until next year'.", { passage_no: 1 }),
  tfng('Q-BR-07', R, 'Mr Chen has lived in the town all his life.', 'Not Given', "Teks hanya menyebut Mr Chen adalah guru pensiunan yang datang setiap minggu; lamanya ia tinggal di kota tidak dibahas.", { passage_no: 1 }),
  fill('Q-BR-08', R, 'Sellers pay the town council £ _______ each week.', ['8', 'eight', '£8'], "Paragraf 3: 'the sellers pay the town council eight pounds each week'.", 2, { passage_no: 1 }),
  short('Q-BR-09', R, 'Apa yang dibeli Mr Chen setiap minggu? (Maksimal DUA kata)', ['flowers'], 2, "Paragraf 5: 'comes every week to buy flowers for his kitchen table'.", { passage_no: 1 }),
  short('Q-BR-10', R, 'Di mana seorang pria muda memainkan gitar? (Maksimal TIGA kata)', ['near the entrance', 'by the entrance', 'at the entrance'], 3, "Paragraf 3: 'a young man plays the guitar near the entrance'.", { passage_no: 1 }),
];

const bossListeningQ = [
  fill('Q-BL-01', L, 'Monthly rent: £ _______', ['450', '£450', 'four hundred and fifty'], "Agen menyebut 'four hundred and fifty pounds a month'.", 2, { section_no: 1 }),
  fill('Q-BL-02', L, 'The room is on the _______ floor.', ['second', '2nd'], "Agen berkata 'It's on the second floor'.", 1, { section_no: 1 }),
  mcq('Q-BL-03', L, 'What is included in the rent?', ['Electricity', 'Water', 'The internet', 'Cleaning'], 'The internet', "'The rent includes the internet'. Listrik dan air dibayar terpisah.", { section_no: 1 }),
  short('Q-BL-04', L, 'Apa yang harus dibawa penelepon saat melihat kamar? (Maksimal SATU kata)', ['passport'], 1, "Agen meminta 'Please bring your passport'.", { section_no: 1 }),
  mcq('Q-BL-05', L, 'What time will the bus leave on Friday?', ['8:00 am', '8:15 am', '8:30 am', '3:30 pm'], '8:15 am', "'A quarter past eight' sama dengan 8:15. Pukul 3:30 adalah waktu kembali ke sekolah.", { section_no: 2 }),
  fill('Q-BL-06', L, 'Everybody must bring a _______ and a bottle of water.', ['packed lunch'], "Guru berkata 'bring a packed lunch and a bottle of water'.", 2, { section_no: 2 }),
  mcq('Q-BL-07', L, 'What will the students do first at the museum?', ['Complete the worksheet', 'Visit the exhibition rooms', 'Watch a short film', 'Have lunch'], 'Watch a short film', "'First, we will watch a short film'. Lembar kerja dikerjakan setelah itu.", { section_no: 2 }),
  mcq('Q-BL-08', L, 'What topic do Anna and Tom choose?', ['Travel', 'Recycling', 'Music', 'Sport'], 'Recycling', "Tom menolak travel karena terlalu banyak; Anna mengusulkan recycling dan disetujui.", { section_no: 3 }),
  short('Q-BL-09', L, 'Siapa yang akan mencari gambar? (Maksimal SATU kata)', ['Anna'], 1, "Anna berkata 'I'll find the pictures'. Tom menulis teks slide.", { section_no: 3 }),
  fill('Q-BL-10', L, 'They will meet in the _______ on Thursday.', ['library', 'the library'], "Kafe terlalu berisik, jadi mereka sepakat bertemu di library.", 2, { section_no: 3 }),
];

const writingExplain = [
  'Cara menilai tulisanmu sendiri (parafrase orisinal; bukan teks resmi band descriptors).',
  '1. Menjawab soal: apakah kamu membahas KEDUA pandangan dan menyatakan pendapatmu sendiri dengan jelas? Apakah panjang tulisan minimal 150 kata?',
  '2. Alur dan koherensi: apakah ada pembuka, dua paragraf isi, dan penutup; apakah setiap paragraf punya satu ide utama dan kata penghubung sederhana (First, However, In conclusion)?',
  '3. Kosakata: apakah kata yang dipakai sesuai topik (household jobs, responsibility, homework) dan ejaannya benar? Hindari mengulang kata yang sama terus-menerus.',
  '4. Tata bahasa: apakah kamu memakai kalimat sederhana dan sebagian kalimat majemuk dengan because/but/so; apakah Present Simple dan modal (should, can) digunakan dengan benar?',
  'Contoh kerangka: pembuka (parafrase soal + pendapat), isi 1 (alasan anak perlu membantu), isi 2 (alasan anak perlu fokus belajar), penutup (pendapatmu).',
].join('\n');
const speakingExplain = [
  'Cara menilai rekamanmu sendiri (parafrase orisinal; bukan teks resmi band descriptors).',
  '1. Kelancaran: apakah kamu terus berbicara hampir 2 menit tanpa jeda panjang, dan memakai penghubung seperti and, but, because, so?',
  '2. Isi: apakah ketiga poin kartu (lokasi dan tampilan, kegiatan, alasan) tercakup, ditambah perasaanmu?',
  '3. Kosakata dan tata bahasa: apakah kata benda dan kata sifat cukup beragam, dan tense (Present untuk kebiasaan, Past untuk pengalaman) konsisten?',
  '4. Pengucapan: apakah kata kunci terdengar jelas dan intonasi tidak datar?',
].join('\n');

const boss = [
  { set_type: 'TIER_BOSS_EXAM', title: 'Boss Stage Tier 1: Foundation', tier_number: 1, origin: ORIGIN, source_code: 'OWN', questions: [] },
  {
    set_type: 'BOSS_SECTION', title: 'Boss Tier 1 - Reading', tier_number: 1, skill_category: 'READING', time_limit_seconds: 1200, pass_percent: 80,
    reading_passage_markdown: md('boss-reading.md'), origin: ORIGIN, source_code: 'OWN', questions: bossReadingQ,
  },
  {
    set_type: 'BOSS_SECTION', title: 'Boss Tier 1 - Writing', tier_number: 1, skill_category: 'WRITING', time_limit_seconds: 1800, origin: ORIGIN, source_code: 'OWN',
    questions: [{
      question_id: 'Q-BW-01', question_type: 'WRITING_TASK', skill: 'WRITING', task_kind: 'TASK2', min_words: 150, time_limit_minutes: 30,
      prompt: 'Some people think that children should help with household jobs such as cleaning and cooking. Other people think that children should spend their time only on study and play.\n\nDiscuss both views and give your own opinion.\n\nWrite at least 150 words.',
      explanation_id: writingExplain,
    }],
  },
  {
    set_type: 'BOSS_SECTION', title: 'Boss Tier 1 - Speaking', tier_number: 1, skill_category: 'SPEAKING', time_limit_seconds: 300, origin: ORIGIN, source_code: 'OWN',
    questions: [{
      question_id: 'Q-BS-01', question_type: 'SPEAKING_TASK', skill: 'SPEAKING', part: 2, prep_seconds: 60, record_seconds: 120,
      prompt: 'Describe a place in your town or village where you like to spend your free time.\nYou should say:\nwhere the place is and what it looks like\nwhat you usually do there\nwhy you like to go there\nand explain how you feel about this place.',
      cue_points: ['where the place is and what it looks like', 'what you usually do there', 'why you like to go there'],
      explanation_id: speakingExplain,
    }],
  },
];

const bossListening = {
  set_type: 'BOSS_SECTION', title: 'Boss Tier 1 - Listening', tier_number: 1, skill_category: 'LISTENING', time_limit_seconds: 1200, pass_percent: 80,
  listening_asset_code: 'gs/listening/boss-t1', origin: ORIGIN, source_code: 'OWN', questions: bossListeningQ,
};

// ----------------------------------------------------------------- rakit
const pkg = {
  contract_version: '1.1',
  sub_modules: [gs1, gs3, gs2].sort((a, b) => a.sub_module_code.localeCompare(b.sub_module_code)),
  assessment_sets: [
    { set_type: 'PLACEMENT_TEST', title: 'Placement Test IELTS (Golden Sample, 30 soal)', time_limit_seconds: 1500, origin: ORIGIN, source_code: 'OWN', questions: placement },
    { set_type: 'SKIP_MODULE_TEST', title: 'Skip Test Modul 2.1: Complex Grammar & Sentence Combining', module_code: '2.1', time_limit_seconds: 900, pass_percent: 85, origin: ORIGIN, source_code: 'OWN', questions: skip },
    ...boss,
  ],
};
writeFileSync(path.join(root, 'content.json'), JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(path.join(root, 'pending', 'boss-t1-listening.section.json'), JSON.stringify(bossListening, null, 2) + '\n');

// ringkasan
const count = (qs) => qs.reduce((m, q) => ((m[q.question_type] = (m[q.question_type] ?? 0) + 1), m), {});
const words = (t) => t.replace(/^\[[A-Z]\]\s/gm, '').replace(/^#+\s.*$/gm, '').split(/\s+/).filter(Boolean).length;
console.log('GS-1', count(gs1Questions), 'artikel kata:', words(gs1.materials.article_markdown));
console.log('GS-2', count(gs2Questions), 'bacaan kata:', words(gs2Passage));
console.log('GS-3', count(gs3Questions), 'artikel kata:', words(gs3.materials.article_markdown));
console.log('Placement', placement.length, count(placement), [1, 2, 3, 4, 5].map((d) => placement.filter((q) => q.difficulty === d).length));
console.log('Skip', skip.length, count(skip));
console.log('Boss R', count(bossReadingQ), 'kata', words(md('boss-reading.md')), '| L', count(bossListeningQ));
