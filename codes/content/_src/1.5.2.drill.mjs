const P = 'Q-RD132-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'READING', passage_no: 1, ...rest });
const mcq = (n, passage_no, prompt, options, answer, explanation_id) =>
  g(n, { passage_no, question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, passage_no, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { passage_no, question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });
const tfng = (n, passage_no, prompt, answer, explanation_id) =>
  g(n, { passage_no, question_type: 'TFNG', prompt, correct_answers: [answer], explanation_id });

const text1 = `## Riverside Community Library: Changes from 1 December

From Monday 1 December, the library will open at 9.30 a.m. instead of 9.00 a.m. on weekdays. It will close at 7.00 p.m. on Mondays and Thursdays, and at 5.00 p.m. on Tuesdays, Wednesdays and Fridays. On Saturdays the library opens from 10.00 a.m. to 2.00 p.m., and it is closed on Sundays.

Members may borrow up to eight books for three weeks. Fines for late books are 20 pence a day, but children under twelve pay no fines. The computer room is free for members for one hour a day; guests pay £1 per hour. A new study room can be booked at the front desk for a maximum of two hours.

The library will be closed on 25 and 26 December and on 1 January.`;

const text2 = `## From: Ms Hart (Year 9 Teacher)

Hi Mia,

Thank you for your message about the school trip to the science museum. The trip is on Friday 14 March. We leave school at 8.15 a.m. by coach and return at about 4.30 p.m.

Please bring a packed lunch and a water bottle. There is a café at the museum, but it is expensive, so students do not have to buy lunch there. Students should wear their school uniform and comfortable shoes.

The cost is £12, which includes the coach and the entry ticket. If you cannot pay by Friday 7 March, please talk to Mr Collins in the school office. Please also tell me about any allergies.

Best wishes,
Ms Hart`;

const text3 = `## Greenfield Sports Centre: Adult Swimming Lessons

Our new beginners' course for adults starts on Tuesday 6 May and runs for eight weeks. Lessons take place every Tuesday evening from 6.30 p.m. to 7.15 p.m. in the small pool. Each class has a maximum of ten learners, so please book early.

The full course costs £48 for members and £60 for non-members. You must pay when you book; we cannot accept payment on the day. Please bring your own towel and swimming costume. Goggles can be borrowed free of charge at reception.

To book a place, call 01632 960 147 or speak to Daniel at the front desk before Friday 2 May. If you miss a lesson, we are sorry that we cannot give your money back.`;

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.5',
    module_category: 'READING',
    sub_module_title: 'Menangkap Ide Pokok & Informasi Spesifik pada Teks Pendek',
  },
  mini_task: {
    task_type: 'SELF_CHECK',
    prompt:
      'Latihan mandiri (tanpa penilaian AI), sekitar 20 menit. Ambil tiga teks pendek berbahasa Inggris dari kehidupan nyata (pengumuman, iklan, email, atau jadwal). Untuk setiap teks:\n1. Dalam 15 detik, baca judul dan kalimat pertama, lalu tulis satu kalimat ide pokok.\n2. Garis bawahi 4 detail (angka, nama, hari, aturan) dan tulis satu pertanyaan scanning untuk tiap detail.\n3. Tulis 2 pernyataan True/False/Not Given tentang teks itu, satu False dan satu Not Given.\n4. Periksa: apakah ide pokokmu mencakup seluruh teks, bukan hanya satu detail?',
    ai_rubric_criteria:
      'Daftar periksa mandiri: (a) ide pokok satu kalimat dan mencakup seluruh teks; (b) pertanyaan scanning menanyakan detail spesifik yang benar-benar ada; (c) pernyataan False benar-benar bertentangan, pernyataan Not Given benar-benar tidak disebut; (d) angka, hari, dan ejaan disalin persis.',
  },
  drill: {
    time_limit_seconds: 900,
    passages: [text1, text2, text3],
    questions: [
      mcq(1, 1, 'What is the main purpose of the library notice?', ['To announce changes to the opening hours and rules', 'To advertise a new computer course', 'To sell second-hand books', 'To ask members to pay fines'], 'To announce changes to the opening hours and rules', 'Judul dan kalimat pertama menyebut perubahan jam buka mulai 1 Desember, dilengkapi aturan. Pilihan lain hanya detail atau tidak disebut.'),
      fill(2, 1, 'From 1 December, the library will open at ___ a.m. on weekdays.', ['9.30', '9:30'], 'Teks: "will open at 9.30 a.m. instead of 9.00 a.m. on weekdays".'),
      fill(3, 1, 'Members may borrow up to ___ books.', ['eight', '8'], 'Teks: "Members may borrow up to eight books for three weeks".'),
      g(4, {
        passage_no: 1,
        question_type: 'SHORT_ANSWER',
        prompt: 'How much do guests pay per hour for the computer room? (Maximum TWO words)',
        correct_answers: ['£1', '1 pound', 'one pound'],
        max_words: 2,
        explanation_id: 'Teks: "guests pay £1 per hour".',
      }),
      tfng(5, 1, 'The library will open earlier than before on weekdays.', 'False', 'Teks: "9.30 instead of 9.00", artinya buka lebih lambat, bukan lebih awal.'),
      tfng(6, 1, 'Children under twelve have to pay fines for late books.', 'False', 'Teks: "children under twelve pay no fines".'),
      tfng(7, 1, 'The library closes at 7.00 p.m. on Mondays and Thursdays.', 'True', 'Teks: "It will close at 7.00 p.m. on Mondays and Thursdays".'),
      tfng(8, 1, 'The library will sell old books next month.', 'Not Given', 'Teks tidak membahas penjualan buku bekas.'),
      mcq(9, 1, 'On which days does the library close at 5.00 p.m.?', ['Tuesdays, Wednesdays and Fridays', 'Mondays and Thursdays', 'Saturdays and Sundays', 'Every weekday'], 'Tuesdays, Wednesdays and Fridays', 'Teks: "at 5.00 p.m. on Tuesdays, Wednesdays and Fridays".'),
      mcq(10, 2, 'Why is Ms Hart writing this email?', ['To give details about a school trip', 'To ask for money for a new uniform', 'To invite Mia to a party', 'To report an accident'], 'To give details about a school trip', 'Kalimat pertama merespons pertanyaan tentang school trip dan seluruh email berisi detail perjalanan itu.'),
      fill(11, 2, 'The coach leaves school at ___ a.m.', ['8.15', '8:15'], 'Teks: "We leave school at 8.15 a.m. by coach".'),
      fill(12, 2, 'The trip costs £___.', ['12'], 'Teks: "The cost is £12".'),
      g(13, {
        passage_no: 2,
        question_type: 'SHORT_ANSWER',
        prompt: 'Who should parents talk to if they cannot pay by 7 March? (Maximum TWO words)',
        correct_answers: ['Mr Collins', 'Collins'],
        max_words: 2,
        explanation_id: 'Teks: "please talk to Mr Collins in the school office".',
      }),
      tfng(14, 2, 'Students must buy lunch at the museum café.', 'False', 'Teks: "students do not have to buy lunch there" dan diminta membawa bekal.'),
      tfng(15, 2, 'Parents are allowed to join the trip.', 'Not Given', 'Teks tidak menyebut apakah orang tua boleh ikut.'),
      g(16, {
        passage_no: 2,
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik detail yang salah menurut email: "The trip is on Friday 7 March."',
        explanation_id: 'Tanggal perjalanan adalah 14 Maret; 7 Maret adalah batas pembayaran.',
        tokens: ['The', 'trip', 'is', 'on', 'Friday', '7', 'March.'],
        correct_answers: [5],
      }),
      g(17, {
        passage_no: 1,
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap teks dengan tujuan utamanya.',
        explanation_id: 'Pengumuman perpustakaan menyampaikan perubahan jam dan aturan; email guru menyampaikan detail dan syarat perjalanan sekolah.',
        points: 2,
        matching: {
          left: ['Library notice', 'Email from Ms Hart'],
          right: ['to announce changes and rules', 'to give trip details and requirements', 'to advertise a product'],
          allow_reuse: false,
        },
        correct_answers: [0, 1],
      }),
      g(18, {
        passage_no: 1,
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi langkah scanning yang benar.',
        explanation_id: 'Baca soal dan tandai kata kunci, lalu telusuri teks untuk kata itu.',
        segments: ['Read the question', 'and underline key words,', 'then scan the text', 'for those words.'],
      }),
      g(19, {
        passage_no: 1,
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA jenis kata yang paling mudah dicari saat scanning.',
        explanation_id: 'Angka/tanggal dan nama berhuruf kapital menonjol di teks. Kata umum (the) dan ide abstrak sulit dicari.',
        points: 2,
        options: ['Numbers and dates', 'Names with capital letters', 'Very common words such as "the"', 'Long abstract ideas'],
        correct_answers: ['Numbers and dates', 'Names with capital letters'],
      }),
      mcq(20, 1, 'Which sentence describes the MAIN IDEA, not a detail?', ['The library has new opening hours from 1 December.', 'Fines are 20 pence a day.', 'Guests pay £1 per hour for computers.', 'The library is closed on 1 January.'], 'The library has new opening hours from 1 December.', 'Ide pokok mencakup seluruh teks; tiga pilihan lain hanya detail.'),
      mcq(21, 3, 'What is the main purpose of the sports centre notice?', ['To announce that the small pool is closing', 'To give information about a swimming course for adults', 'To advertise a job at the front desk', 'To explain the rules of a swimming competition'], 'To give information about a swimming course for adults', 'Judul dan kalimat pertama menyebut kursus renang pemula untuk dewasa; sisanya adalah detail jadwal, biaya, dan cara mendaftar.'),
      fill(22, 3, 'The course runs for ___ weeks.', ['eight', '8'], 'Teks: "starts on Tuesday 6 May and runs for eight weeks".'),
      fill(23, 3, 'Non-members pay £___ for the full course.', ['60'], 'Teks: "£48 for members and £60 for non-members". Hati-hati, £48 adalah harga untuk anggota.'),
      g(24, {
        passage_no: 3,
        question_type: 'SHORT_ANSWER',
        prompt: 'What can learners borrow at reception? (Maximum ONE word)',
        correct_answers: ['goggles', 'Goggles'],
        max_words: 1,
        explanation_id: 'Teks: "Goggles can be borrowed free of charge at reception". Handuk dan baju renang harus dibawa sendiri.',
      }),
      tfng(25, 3, 'Learners can pay for the course on the day of the first lesson.', 'False', 'Teks: "You must pay when you book; we cannot accept payment on the day".'),
      tfng(26, 3, 'There are never more than ten learners in a class.', 'True', 'Teks: "Each class has a maximum of ten learners".'),
      tfng(27, 3, 'Daniel is the swimming teacher.', 'Not Given', 'Teks hanya menyebut Daniel di front desk untuk pendaftaran; siapa pengajarnya tidak disebut.'),
      mcq(28, 3, 'When do the lessons take place?', ['Every Tuesday morning', 'Every Friday evening', 'Every Tuesday evening', 'Every evening in May'], 'Every Tuesday evening', 'Teks: "every Tuesday evening from 6.30 p.m. to 7.15 p.m.". Friday 2 May hanyalah batas pendaftaran.'),
      fill(29, 1, 'The new study room can be booked for a maximum of ___ hours.', ['two', '2'], 'Teks: "can be booked at the front desk for a maximum of two hours".'),
      tfng(30, 2, 'Students can wear their own clothes on the trip.', 'False', 'Teks: "Students should wear their school uniform and comfortable shoes".'),
    ],
  },
};

export default sub;
