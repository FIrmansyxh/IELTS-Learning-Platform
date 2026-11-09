const P = 'Q-RD231-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'READING', passage_no: 1, ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });
const tfng = (n, prompt, answer, explanation_id) =>
  g(n, { question_type: 'TFNG', prompt, correct_answers: [answer], explanation_id });

const passage = `## Cycling in Harbour City

[A] In the 1980s, only a small number of people in Harbour City travelled by bicycle. Roads were built for cars, and many residents believed that cycling was dangerous. By 1990, just 3% of journeys in the city were made by bike.

[B] The change began in 1996, when the city council opened its first cycle lane along the river. Within two years the number of cyclists on that route had tripled. Encouraged by this result, the council added 40 kilometres of lanes by 2005.

[C] Not everyone welcomed the change. Some shop owners complained that cycle lanes reduced parking space. A survey in 2003 showed that 62% of shop owners opposed new lanes, although later studies found that customers who arrived by bike spent more over a month than those who came by car.

[D] Today, 18% of journeys are made by bicycle. The city offers free bike repair stations at ten locations, and schools run weekly cycling lessons. Officials say that the next goal is to reach 25% by 2030, mainly by connecting the lanes in the northern suburbs.`;

const sub = {
  meta: {
    tier_number: 2,
    module_code: '2.3',
    module_category: 'READING',
    sub_module_title: 'Teknik Skimming (Ide Utama) vs. Scanning (Kata Kunci, Nama, Tahun)',
  },
  mini_task: {
    task_type: 'SELF_CHECK',
    prompt:
      'Latihan mandiri (tanpa penilaian AI), sekitar 25 menit. Ambil satu artikel berbahasa Inggris sepanjang 400 sampai 600 kata (berita, blog, atau buku).\n1. SKIMMING (2 menit, dengan timer): baca judul, kalimat pertama tiap paragraf, dan kalimat terakhir. Tulis peta teks (2 sampai 4 kata per paragraf).\n2. SCANNING (5 menit): tulis 6 pertanyaan (2 angka/tahun, 2 nama/tempat, 2 istilah/alasan), lalu cari jawabannya dengan timer 30 detik per soal.\n3. Parafrase: untuk 3 kata kunci pertanyaanmu, tulis sinonim yang mungkin dipakai teks.\n4. Evaluasi: soal mana yang lambat, dan teknik apa yang kurang tepat?',
    ai_rubric_criteria:
      'Daftar periksa mandiri: (a) peta teks menangkap ide tiap paragraf, bukan detail; (b) pertanyaan scanning menanyakan hal spesifik yang jelas ada di teks; (c) jawaban scanning ditemukan dalam waktu sekitar 30 detik dengan kata kunci/angka sebagai jangkar; (d) sinonim kata kunci relevan; (e) evaluasi menyebut teknik yang perlu diperbaiki.',
  },
  drill: {
    time_limit_seconds: 1200,
    passages: [passage],
    questions: [
      g(1, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Choose the correct heading for each paragraph (A-D) from the list. There are more headings than paragraphs.',
        matching: {
          left: ['Paragraph A', 'Paragraph B', 'Paragraph C', 'Paragraph D'],
          right: [
            'A time when few people cycled',
            'The first step towards change',
            'Opposition from local businesses',
            'The current situation and future aims',
            'The cost of building cycle lanes',
            'Safety rules for cyclists',
          ],
          allow_reuse: false,
        },
        points: 4,
        correct_answers: [0, 1, 2, 3],
        explanation_id: 'A: sedikit orang bersepeda (1980-an). B: jalur sepeda pertama (1996). C: keluhan pemilik toko. D: kondisi sekarang dan target. Dua judul lain adalah pengecoh.',
      }),
      mcq(2, 'What is paragraph B mainly about?', ['The opening of the first cycle lane and its effect', 'The dangers of cycling', 'The complaints of shop owners', 'The plans for 2030'], 'The opening of the first cycle lane and its effect', 'Kalimat pertama: "The change began in 1996 ... first cycle lane". Pilihan lain adalah ide paragraf lain.'),
      mcq(3, 'What is the writer\'s main purpose in the text?', ['To describe how cycling in the city has changed over time', 'To persuade readers to buy bicycles', 'To explain how to repair a bicycle', 'To criticise the council'], 'To describe how cycling in the city has changed over time', 'Teks menelusuri perubahan bersepeda dari 1980-an sampai sekarang dan target ke depan.'),
      fill(4, 'The council opened its first cycle lane in ___.', ['1996'], 'Scanning angka tahun: "The change began in 1996, when ... opened its first cycle lane".'),
      fill(5, 'In 1990, only ___% of journeys were made by bike.', ['3'], 'Paragraf A: "By 1990, just 3% of journeys".'),
      fill(6, 'By 2005 the council had added ___ kilometres of lanes.', ['40', 'forty'], 'Paragraf B: "added 40 kilometres of lanes by 2005".'),
      fill(7, 'Today, ___% of journeys are made by bicycle.', ['18', 'eighteen'], 'Paragraf D: "Today, 18% of journeys".'),
      fill(8, 'The city offers free bike repair stations at ___ locations.', ['ten', '10'], 'Paragraf D: "repair stations at ten locations".'),
      g(9, {
        question_type: 'SHORT_ANSWER',
        prompt: 'Who complained that cycle lanes reduced parking space? (Maximum THREE words)',
        correct_answers: ['shop owners', 'some shop owners'],
        max_words: 3,
        explanation_id: 'Paragraf C: "Some shop owners complained that cycle lanes reduced parking space".',
      }),
      tfng(10, 'The number of cyclists on the river route tripled within two years.', 'True', 'Paragraf B: "Within two years the number of cyclists on that route had tripled".'),
      tfng(11, 'The 2003 survey found that most shop owners supported new cycle lanes.', 'False', 'Paragraf C: 62% pemilik toko menentang jalur baru, jadi mayoritas tidak mendukung.'),
      tfng(12, 'The council plans to ban cars from the city centre.', 'Not Given', 'Teks tidak membahas larangan mobil di pusat kota.'),
      tfng(13, 'Schools in the city run cycling lessons every week.', 'True', 'Paragraf D: "schools run weekly cycling lessons".'),
      mcq(14, 'Which paragraph mentions a goal for the future?', ['Paragraph D', 'Paragraph A', 'Paragraph B', 'Paragraph C'], 'Paragraph D', 'Paragraf D menyebut target 25% pada 2030.'),
      g(15, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Which paragraph contains each piece of information? (Paragraphs A-D)',
        matching: {
          left: ['A statistic about shop owners\' opinions', 'A reason why people avoided cycling', 'A target for the year 2030'],
          right: ['A', 'B', 'C', 'D'],
          allow_reuse: false,
        },
        points: 3,
        correct_answers: [2, 0, 3],
        explanation_id: 'Statistik pendapat pemilik toko: C (62%). Alasan orang menghindari bersepeda (dianggap berbahaya): A. Target tahun 2030: D.',
      }),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi langkah skimming yang benar.',
        explanation_id: 'Skimming dimulai dari judul, lalu kalimat pertama paragraf, lalu kesimpulan.',
        segments: ['Read the title,', 'then the first sentence', 'of each paragraph,', 'and write a text map.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik detail yang salah menurut teks: "The first cycle lane was opened in 2005."',
        explanation_id: 'Jalur sepeda pertama dibuka pada 1996; 2005 adalah tahun ketika tambahan 40 km selesai.',
        tokens: ['The', 'first', 'cycle', 'lane', 'was', 'opened', 'in', '2005.'],
        correct_answers: [7],
      }),
      g(18, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA tipe soal yang paling cocok dijawab dengan skimming.',
        explanation_id: 'Judul paragraf dan ide pokok/tujuan teks bergantung pada ide umum (skimming). Soal angka atau nama membutuhkan scanning.',
        points: 2,
        options: ['Matching headings', 'Identifying the main idea of the text', 'Finding a year', 'Finding a percentage'],
        correct_answers: ['Matching headings', 'Identifying the main idea of the text'],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA hal yang paling mudah di-scan.',
        explanation_id: 'Angka/tahun dan nama berhuruf kapital menonjol secara visual. Kata umum seperti the dan ide abstrak sulit dicari.',
        points: 2,
        options: ['Years and percentages', 'Names with capital letters', 'The word "the"', 'Abstract ideas'],
        correct_answers: ['Years and percentages', 'Names with capital letters'],
      }),
      mcq(20, 'Why is searching for the exact words of a question risky?', ['Questions often use synonyms or paraphrase instead of the same words', 'Questions never contain names', 'Texts do not contain numbers', 'Scanning is not allowed in the test'], 'Questions often use synonyms or paraphrase instead of the same words', 'Soal sering memarafrase teks, sehingga carilah sinonim, angka, dan nama sebagai jangkar.'),
    ],
  },
};

export default sub;
