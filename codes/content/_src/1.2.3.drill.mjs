const P = 'Q-GR118-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'GRAMMAR', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });
const reorder = (n, segments, explanation_id) =>
  g(n, { question_type: 'SENTENCE_REORDER', prompt: 'Susun menjadi kalimat yang benar.', explanation_id, segments });
const err = (n, tokens, index, explanation_id) =>
  g(n, { question_type: 'ERROR_RECOGNITION', prompt: 'Klik kata yang salah.', explanation_id, tokens, correct_answers: [index] });

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.2',
    module_category: 'GRAMMAR',
    sub_module_title: 'Phrases: Noun Phrase, Adjective Phrase, Adverbial Phrase, & Prepositional Phrase',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis paragraf singkat (sekitar 80 sampai 100 kata) dalam bahasa Inggris yang mendeskripsikan lingkungan tempat tinggalmu (jalan, toko, taman, atau bangunan di sekitarnya).\n\nDalam paragrafmu:\n- pakai setidaknya 3 noun phrase dengan pola jumlah/determiner + adjective + noun penjelas + head (mis. two small coffee shops)\n- pakai setidaknya 2 prepositional phrase sesudah noun untuk menjelaskan noun itu (mis. the park near my house)\n- pakai setidaknya 1 adjective phrase dan 1 adverbial phrase dengan penguat (very, so, too, really), dan pakai enough satu kali di posisi yang benar\n- tulis setidaknya 1 kalimat yang subjeknya noun phrase panjang, lalu pastikan kata kerjanya cocok dengan head',
    ai_rubric_criteria:
      'Grammatical Accuracy: urutan noun phrase benar (determiner/jumlah + adjective + noun penjelas + head), noun penjelas berbentuk tunggal (shoe shops), adjective dipakai untuk noun dan adverb untuk verb, enough berada sesudah adjective/adverb, kata kerja cocok dengan head pada subjek yang memuat prepositional phrase. Task Achievement: semua unsur yang diminta muncul. Lexical Resource dan Coherence: pasangan noun + noun wajar, deskripsi teratur dan mudah diikuti.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which group of words is a PHRASE (not a clause)?', ['a very tall building', 'the building is tall', 'because it is tall', 'it stands there'], 'a very tall building', 'Phrase tidak punya pasangan subjek + kata kerja. "A very tall building" hanya berisi penjelas dan inti (building). Tiga pilihan lain punya subjek dan kata kerja (is, stands), jadi termasuk clause.'),
      mcq(2, 'What is the HEAD of the noun phrase "a fully funded scholarship"?', ['a', 'fully', 'funded', 'scholarship'], 'scholarship', 'Head adalah kata benda inti yang dijelaskan, dan dalam bahasa Inggris letaknya paling belakang. "A", "fully", dan "funded" semuanya penjelas untuk "scholarship".'),
      mcq(3, 'The room is not ___ for twenty students.', ['enough big', 'big enough', 'enough bigly', 'bigly enough'], 'big enough', '"Enough" diletakkan sesudah adjective: big enough. Kata "bigly" bukan bentuk yang dipakai, dan setelah "is" yang dibutuhkan memang adjective.'),
      mcq(4, 'The teacher explained the rule ___.', ['very clear', 'very clearly', 'clear very', 'clearly very'], 'very clearly', 'Yang dijelaskan adalah kata kerja "explained", jadi perlu adverb (clearly), bukan adjective (clear). Penguat "very" berada di depan head.'),
      mcq(5, 'Terjemahan yang benar untuk "tiga produk kecantikan mahal" adalah...', ['three beauty expensive products', 'three expensive beauty products', 'expensive three beauty products', 'three products beauty expensive'], 'three expensive beauty products', 'Urutan noun phrase: jumlah (three) + adjective (expensive) + noun penjelas (beauty) + head (products). Inti "produk" pindah ke posisi paling belakang.'),
      mcq(6, 'There are two ___ near my office.', ['shoes shops', 'shoe shops', 'shoes shop', 'shop shoes'], 'shoe shops', 'Noun penjelas tetap tunggal (shoe), sedangkan head dijamakkan karena jumlahnya dua (shops). "Shop shoes" membalik inti dan penjelas.'),
      mcq(7, 'The quality of the products ___ very good.', ['is', 'are', 'be', 'have'], 'is', 'Head subjek adalah "quality" (tunggal), bukan "products". "Of the products" hanya prepositional phrase penjelas, jadi kata kerjanya "is".'),
      mcq(8, 'Dalam kalimat "The cat on the chair is very cute", frasa "on the chair" berfungsi sebagai...', ['adjective, karena menjelaskan noun "the cat"', 'adverb, karena menjelaskan kata kerja "is"', 'subjek kalimat', 'kata kerja kalimat'], 'adjective, karena menjelaskan noun "the cat"', 'Prepositional phrase yang terletak tepat sesudah noun dan menjawab pertanyaan "kucing yang mana?" berfungsi sebagai adjective. Subjek lengkapnya "the cat on the chair" dan kata kerjanya "is".'),
      mcq(9, '___ students in my class come from Sumatra.', ['A number of', 'The number of', 'Another', 'Much'], 'A number of', '"A number of" berarti sejumlah, diikuti noun jamak dan kata kerja jamak (come). "The number of" menuntut kata kerja tunggal, "another" hanya untuk noun tunggal, dan "much" untuk uncountable.'),
      mcq(10, 'I am interested ___ abroad.', ['in study', 'in studying', 'in to study', 'to studying'], 'in studying', 'Adjective "interested" berpasangan dengan preposition "in", dan kata kerja setelah preposition selalu berbentuk -ing (gerund): in studying.'),
      mcq(11, 'This idea did not work, so we need ___ plan.', ['another', 'other', 'others', 'these'], 'another', '"Plan" adalah noun tunggal, jadi pasangannya "another". "Other" dan "these" diikuti noun jamak, sedangkan "others" berdiri sendiri tanpa noun.'),
      mcq(12, 'The government announced a ___ plan to build more schools.', ['five-years', 'five-year', 'fives-year', 'five-year\'s'], 'five-year', 'Angka + noun yang bertugas sebagai penjelas ditulis dengan tanda hubung dan noun-nya tetap tunggal: a five-year plan.'),
      fill(13, 'Lengkapi: The soup is ___ hot to eat, so wait a few minutes. (too / enough)', ['too'], '"Too" berarti berlebihan sehingga ada akibat buruk (belum bisa dimakan) dan berada di depan adjective. "Enough" tidak bisa di depan adjective.'),
      fill(14, 'Lengkapi: He did not run fast ___ to win the race. (too / enough / very)', ['enough'], 'Celah berada sesudah adverb "fast", dan satu-satunya penguat yang diletakkan sesudah head adalah "enough": fast enough.'),
      fill(15, 'Lengkapi dengan bentuk yang tepat dari kata beautiful: You dance very ___.', ['beautifully'], 'Yang dijelaskan adalah kata kerja "dance", jadi perlu adverb: beautiful + -ly menjadi beautifully. "Very beautiful" hanya benar untuk menjelaskan noun atau setelah be.'),
      fill(16, 'Terjemahkan "empat ekor ayam" ke bahasa Inggris dengan kata chicken (dua kata): The farmer has ___.', ['four chickens', '4 chickens'], 'Kata bantu bilangan "ekor" tidak diterjemahkan. Polanya jumlah + head, dan karena jumlahnya lebih dari satu, head wajib jamak: four chickens.', 2),
      fill(17, 'Susun noun phrase dari kata important, six, rule (jamakkan bila perlu) dengan arti "enam aturan penting": Every member must follow ___.', ['six important rules'], 'Urutan: jumlah (six) + adjective (important) + head (rules). Head dijamakkan karena jumlahnya enam.', 3),
      fill(18, 'Lengkapi dengan is atau are: The price of the tickets ___ too high for most students.', ['is'], 'Head subjek adalah "price" (tunggal). "Of the tickets" hanya penjelas di belakang head, jadi kata kerjanya "is".'),
      fill(19, 'Susun noun phrase dari kata main, problem, education, seven (jamakkan bila perlu) dengan arti "tujuh masalah pendidikan utama": The report discusses ___.', ['seven main education problems'], 'Urutan: jumlah (seven) + adjective (main) + noun penjelas (education, tetap tunggal) + head (problems). Inti "masalah" pindah ke posisi paling belakang.', 4),
      reorder(20, ['The university', 'built', 'two', 'big', 'biology', 'laboratories.'], 'Objeknya noun phrase "two big biology laboratories": jumlah (two) + adjective (big) + noun penjelas (biology) + head (laboratories).'),
      reorder(21, ['My brother', 'wants', 'an', 'expensive', 'sports', 'car.'], 'Urutan noun phrase: article (an) + adjective (expensive) + noun penjelas (sports) + head (car). "An" dipakai karena kata sesudahnya, expensive, berawal bunyi vokal.'),
      reorder(22, ['The cat', 'on the chair', 'is', 'very', 'cute.'], 'Prepositional phrase "on the chair" menjelaskan "the cat", jadi letaknya tepat sesudah noun itu. Sesudah "is" ada adjective phrase: penguat (very) + adjective (cute).'),
      reorder(23, ['The city', 'opened', 'fifty', 'new', 'police', 'stations', 'last year.'], 'Objeknya "fifty new police stations": jumlah + adjective + noun penjelas (police) + head (stations). Keterangan waktu "last year" berada di akhir kalimat.'),
      err(24, ['I', 'visited', 'three', 'shoes', 'shops', 'yesterday.'], 3, 'Noun yang bertugas sebagai penjelas tetap tunggal: three shoe shops. Yang dijamakkan hanya head (shops).'),
      err(25, ['The', 'students', 'in', 'my', 'class', 'is', 'very', 'friendly.'], 5, 'Head subjek adalah "students" (jamak), bukan "class". Kata kerjanya harus "are": The students in my class are very friendly.'),
      err(26, ['He', 'drives', 'very', 'careful', 'on', 'wet', 'roads.'], 3, 'Yang dijelaskan adalah kata kerja "drives", jadi perlu adverb: very carefully. "Careful" adalah adjective dan hanya menjelaskan noun.'),
      g(27, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap frasa dengan jenisnya.',
        explanation_id: 'Jenis phrase mengikuti head: "patiently" adverb (adverbial phrase), "wrong" adjective (adjective phrase), "laptop" noun (noun phrase). "In the library" diawali preposition, jadi prepositional phrase. Tidak ada yang berupa clause karena tidak ada subjek + kata kerja.',
        points: 4,
        matching: {
          left: ['so patiently', 'totally wrong', 'in the library', 'my new laptop'],
          right: ['adverbial phrase', 'adjective phrase', 'prepositional phrase', 'noun phrase', 'clause'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2, 3],
      }),
      g(28, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap frasa dengan HEAD (kata inti)-nya.',
        explanation_id: 'Pada noun phrase, head adalah noun yang dijelaskan: "scholarship" (dijelaskan a fully funded) dan "price" (dijelaskan the dan of the tickets di belakangnya). Pada adverbial phrase "very carefully", head-nya adverb "carefully" dan "very" hanya penguat.',
        points: 3,
        matching: {
          left: ['a fully funded scholarship', 'the price of the tickets', 'very carefully'],
          right: ['scholarship', 'price', 'carefully', 'tickets', 'funded'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(29, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA noun phrase yang urutan katanya benar.',
        explanation_id: 'Yang benar mengikuti urutan determiner/jumlah + adjective + head: many famous buildings, our lovely tutor, the first journal. Dua lainnya memakai urutan bahasa Indonesia; yang benar "a fully funded scholarship" dan "two biology laboratories".',
        points: 3,
        options: ['many famous buildings', 'a scholarship fully funded', 'our lovely tutor', 'laboratories biology two', 'the first journal'],
        correct_answers: ['many famous buildings', 'our lovely tutor', 'the first journal'],
      }),
      g(30, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang kata kerjanya sudah cocok dengan head subjeknya.',
        explanation_id: 'Kata kerja mengikuti head: quality (tunggal) + is, "a number of visitors" (sejumlah pengunjung, jamak) + were, children (jamak) + are. Yang salah: head "books" jamak sehingga harus are, dan "the number" tunggal sehingga harus is.',
        points: 3,
        options: [
          'The quality of these phones is excellent.',
          'The books on the shelf is dusty.',
          'A number of visitors were late.',
          'The number of cars are increasing.',
          'The children in the park are happy.',
        ],
        correct_answers: ['The quality of these phones is excellent.', 'A number of visitors were late.', 'The children in the park are happy.'],
      }),
    ],
  },
};

export default sub;
