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

const passage2 = `## Westfield Community Library: Information for New Members

[A] Joining the library is free for anyone who lives, works or studies in Westfield. To register, bring one document showing your address, such as a bank letter, to the front desk. Your membership card is ready in about ten minutes, and children under 12 need a parent to sign the form.

[B] Members may borrow up to eight books at a time for three weeks. Films on DVD can be kept for one week only. If nobody else is waiting for an item, you may renew it twice, either online or by phone. Late books cost 20 pence per day, but there are no late charges for members over 65.

[C] The library is more than a place for books. The Study Room on the first floor has 24 desks and free wireless internet, and it can be booked for up to two hours a day. Every Thursday evening, a volunteer called Mrs Okafor runs a free computer class for beginners. Places are limited to twelve people, so early booking is advised.

[D] From 1 March, the building will open on Sundays for the first time, from 10 a.m. to 2 p.m. The council has also agreed to pay for a new children's corner, which should be finished by September. During the building work, the main entrance will be closed and visitors should use the side door on Mill Lane.`;

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
    passages: [passage, passage2],
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
      g(21, {
        passage_no: 2,
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Choose the correct heading for each paragraph (A-D) of the library text. There are more headings than paragraphs.',
        matching: {
          left: ['Paragraph A', 'Paragraph B', 'Paragraph C', 'Paragraph D'],
          right: [
            'How to become a member',
            'Rules for borrowing',
            'Other services in the building',
            'Changes that are coming',
            'The history of the library',
            'Jobs available at the library',
          ],
          allow_reuse: false,
        },
        points: 4,
        correct_answers: [0, 1, 2, 3],
        explanation_id: 'Kalimat pertama tiap paragraf memberi ide pokok: A cara mendaftar, B aturan meminjam, C layanan selain buku, D perubahan mulai 1 Maret. Dua judul lain adalah pengecoh.',
      }),
      { ...fill(22, 'Members may borrow up to ___ books at a time.', ['eight', '8'], 'Scanning kata kunci "borrow up to": paragraf B, "up to eight books at a time".'), passage_no: 2 },
      { ...fill(23, 'Late books cost ___ pence per day.', ['20', 'twenty'], 'Scanning kata kunci "pence": paragraf B, "Late books cost 20 pence per day".'), passage_no: 2 },
      g(24, {
        passage_no: 2,
        question_type: 'SHORT_ANSWER',
        prompt: 'Who runs the free computer class for beginners? (Maximum TWO words)',
        correct_answers: ['Mrs Okafor', 'Mrs. Okafor', 'Okafor'],
        max_words: 2,
        explanation_id: 'Nama berhuruf kapital mudah di-scan. Paragraf C: "a volunteer called Mrs Okafor runs a free computer class".',
      }),
      { ...tfng(25, 'Members can renew an item twice if no one else is waiting for it.', 'True', 'Paragraf B: "If nobody else is waiting for an item, you may renew it twice". Nobody else = no one else.'), passage_no: 2 },
      { ...tfng(26, 'Members over 65 must pay 20 pence per day for late books.', 'False', 'Paragraf B: "there are no late charges for members over 65", jadi mereka tidak membayar denda.'), passage_no: 2 },
      { ...tfng(27, 'The computer class for beginners takes place in the Study Room.', 'Not Given', 'Teks menyebut hari dan pengajarnya, tetapi tidak menyebut di ruang mana kelas komputer diadakan.'), passage_no: 2 },
      { ...mcq(28, 'Which entrance should visitors use during the building work?', ['The side door on Mill Lane', 'The main entrance', 'The door on the first floor', 'The front desk'], 'The side door on Mill Lane', 'Paragraf D: pintu utama ditutup dan pengunjung memakai "the side door on Mill Lane".'), passage_no: 2 },
      { ...mcq(29, 'When should the new children\'s corner be finished?', ['By September', 'On 1 March', 'On Thursday evening', 'Within three weeks'], 'By September', 'Paragraf D: "a new children\'s corner, which should be finished by September". 1 March adalah awal buka hari Minggu.'), passage_no: 2 },
      g(30, {
        passage_no: 2,
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik detail yang salah menurut teks perpustakaan: "The Study Room can be booked for up to three hours a day."',
        explanation_id: 'Paragraf C: Study Room dapat dipesan "for up to two hours a day", bukan three.',
        tokens: ['The', 'Study', 'Room', 'can', 'be', 'booked', 'for', 'up', 'to', 'three', 'hours', 'a', 'day.'],
        correct_answers: [9],
      }),
    ],
  },
};

export default sub;
