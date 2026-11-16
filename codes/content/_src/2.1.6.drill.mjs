const P = 'Q-GR216-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'GRAMMAR', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 2,
    module_code: '2.1',
    module_category: 'GRAMMAR',
    sub_module_title: 'Meringkas Adjective Clause: Reducing, Omitting, & Appositive',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis satu paragraf (sekitar 100 sampai 120 kata) dalam bahasa Inggris tentang sebuah tempat umum di kotamu (pasar, taman, stasiun, atau perpustakaan) dan orang-orang yang ada di sana.\n\nParagrafmu wajib memuat:\n- dua reduced clause aktif dengan V-ing (mis. "people selling vegetables")\n- dua reduced clause pasif dengan V3 (mis. "a building designed in the 1970s")\n- satu appositive yang diapit dua koma (mis. "Pak Darto, the oldest seller in the market, ...")\n- satu klausa dengan kata penghubung objek yang dihilangkan (mis. "the snack I always buy")\n- satu adjective clause lengkap yang sengaja tidak diringkas karena memuat modal atau tense perfect\n- tidak ada bentuk campuran seperti "who standing" atau "which having"',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: V-ing dipakai untuk makna aktif dan V3 untuk makna pasif; tidak ada kata penghubung yang tersisa di depan participle; kata penghubung subjek tidak dibuang tanpa mengubah kata kerja; appositive diapit dua koma; klausa bermodal atau perfect dibiarkan lengkap. Task Achievement: semua unsur yang diminta muncul dan jumlah kata sesuai. Coherence: kalimat padat tetapi tetap mudah diikuti. Lexical Resource: kosakata tentang tempat umum dan kegiatan orang sesuai.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which part of this sentence is the adjective clause? "The engineer who designed this bridge lives in Bandung."', ['who designed this bridge', 'The engineer who', 'lives in Bandung', 'designed this bridge lives'], 'who designed this bridge', 'Adjective clause dimulai dari kata penghubung who dan berakhir sebelum kata kerja utama (lives). Klausa itu menerangkan noun "the engineer".'),
      mcq(2, '"The laptop that my sister bought is very light." Di dalam klausanya, kata penghubung "that" berperan sebagai apa?', ['subjek klausa (RPS)', 'objek klausa (RPO)', 'kepemilikan (RPP)', 'keterangan tempat (RA)'], 'objek klausa (RPO)', 'Sesudah that ada subjek baru (my sister) lalu kata kerja (bought), jadi that adalah objek dari bought. Karena objek, that boleh dibuang.'),
      mcq(3, 'Choose the correct reduced form: "The students who study in the library are quiet."', ['The students studying in the library are quiet.', 'The students studied in the library are quiet.', 'The students who studying in the library are quiet.', 'The students study in the library are quiet.'], 'The students studying in the library are quiet.', 'Who adalah subjek dan kata kerjanya aktif (para siswa yang belajar), jadi who dibuang dan study menjadi V-ing. Kata penghubung tidak boleh tersisa di depan V-ing, dan tidak boleh ada dua kata kerja finite (study ... are).'),
      mcq(4, 'The bridge ___ in 1998 connects the two islands.', ['built', 'was built', 'building', 'which built'], 'built', 'Kata kerja utama kalimat ini sudah ada (connects), jadi bagian kosong harus bentuk ringkas. Jembatan dibangun (pasif), maka V3: built = which was built. "was built" akan membuat dua kata kerja finite dalam satu klausa.'),
      mcq(5, 'The company ___ this ferry service also owns two hotels.', ['operating', 'operates', 'is operating', 'which operating'], 'operating', 'Kata kerja utama adalah owns. Perusahaan itu mengoperasikan (aktif), jadi who/which operates diringkas menjadi operating. Bentuk finite (operates, is operating) tidak bisa dipakai tanpa kata penghubung.'),
      mcq(6, 'The road ___ at the moment will open in May.', ['being repaired', 'repairing', 'is being repaired', 'which being repaired'], 'being repaired', 'Jalan itu sedang diperbaiki: pasif yang sedang berlangsung. Which is being repaired diringkas menjadi being repaired. "repairing" bermakna aktif (jalan memperbaiki), jadi salah.'),
      mcq(7, 'She was the first woman ___ the national chess title.', ['to win', 'win', 'to winning', 'was won'], 'to win', 'Sesudah the first, the last, the only, dan superlative, klausa who + V diringkas menjadi to + V1: the first woman to win.'),
      mcq(8, 'Which adjective clause CANNOT be reduced to a participle?', ['The guests who are waiting outside are tired.', 'The letter which was sent yesterday has arrived.', 'The students who must retake the test are nervous.', 'The people who live upstairs are friendly.'], 'The students who must retake the test are nervous.', 'Klausa yang memuat modal (must) tidak bisa diringkas karena modal tidak punya bentuk V-ing dan maknanya akan hilang. Tiga kalimat lain bisa: waiting, sent, living.'),
      mcq(9, 'In which sentence can the connector simply be left out, with no other change?', ['The film that we watched last night was long.', 'The film that won the award was long.', 'My uncle, whom you met yesterday, is a pilot.', 'The man to whom I spoke was polite.'], 'The film that we watched last night was long.', 'That di sini objek (diikuti subjek we) pada klausa tanpa koma, jadi boleh dibuang. Kata penghubung subjek (that won), kata penghubung pada klausa berkoma, dan kata penghubung sesudah preposisi (to whom) tidak boleh dibuang begitu saja.'),
      mcq(10, 'Choose the best shortened form: "Mr Hadi, who is our new manager, will speak first."', ['Mr Hadi, our new manager, will speak first.', 'Mr Hadi our new manager, will speak first.', 'Mr Hadi, being our new manager will speak first.', 'Mr Hadi, is our new manager, will speak first.'], 'Mr Hadi, our new manager, will speak first.', 'Who + be + noun menjadi appositive: who dan is dibuang, frasa noun tetap diapit dua koma. Koma tidak boleh hilang satu, dan be tidak boleh tersisa.'),
      mcq(11, 'What is the MAIN verb of this sentence? "The results published last year show a clear trend."', ['published', 'show', 'results', 'trend'], 'show', '"published last year" adalah bentuk ringkas dari "which were published last year" dan hanya menerangkan results. Kata kerja utama yang cocok dengan subjek jamak results adalah show.'),
      mcq(12, 'Pilih terjemahan yang benar: "Buku yang saya pinjam dari perpustakaan sangat berguna."', ['The book I borrowed from the library is very useful.', 'The book borrowing from the library is very useful.', 'The book which borrowed from the library is very useful.', 'The book I borrowed it from the library is very useful.'], 'The book I borrowed from the library is very useful.', '"yang saya pinjam" = that I borrowed. Karena that adalah objek, ia boleh dibuang dan S + V tetap: the book I borrowed. V-ing tidak dipakai karena kata penghubungnya bukan subjek, dan "it" tidak boleh ditambahkan.'),
      mcq(13, 'Rice, ___ in most Asian countries, needs a lot of water to grow.', ['a staple food', 'is a staple food', 'which a staple food', 'it is a staple food'], 'a staple food', 'Kata kerja utama adalah needs, jadi di antara dua koma hanya boleh ada appositive (frasa noun): a staple food = which is a staple food. Pilihan lain menambah kata kerja finite kedua atau menyisakan which tanpa be.'),
      fill(14, 'Lengkapi dengan bentuk ringkas kata kerja dalam kurung (satu kata): The woman ___ (stand) near the gate is my aunt.', ['standing'], 'Perempuan itu berdiri (aktif), jadi who stands / who is standing diringkas menjadi V-ing: standing.'),
      fill(15, 'Lengkapi dengan bentuk ringkas kata kerja dalam kurung (satu kata): The cake ___ (bake) by my grandmother won first prize.', ['baked'], 'Kue itu dipanggang (pasif, ada by), jadi which was baked diringkas menjadi V3: baked.'),
      fill(16, 'Lengkapi dengan bentuk ringkas kata kerja dalam kurung (dua kata): The school ___ (renovate) right now will reopen next month.', ['being renovated'], 'Sekolah itu sedang direnovasi: pasif yang sedang berlangsung. Which is being renovated diringkas menjadi being + V3: being renovated.', 2),
      fill(17, 'Ringkas klausa "who survived" menjadi bentuk to infinitive (dua kata): He was the only passenger ___ the accident.', ['to survive'], 'Sesudah the only, klausa who + V diringkas menjadi to + V1: the only passenger to survive the accident.', 2),
      fill(18, 'Lengkapi: The man ___ lives next door is a dentist. (who / whom / whose)', ['who'], 'Kata penghubung langsung diikuti kata kerja (lives), jadi ia subjek klausa: who. Whom untuk objek dan whose untuk kepemilikan. Karena subjek, who tidak boleh dibuang begitu saja.'),
      fill(19, 'Ringkas klausa "who was chosen" menjadi bentuk to infinitive pasif (tiga kata): The first student ___ for the exchange programme was Dewi.', ['to be chosen'], 'Sesudah the first, bentuk ringkas pasif adalah to be + V3: the first student to be chosen.', 3),
      g(20, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar (adjective clause sudah diringkas).',
        explanation_id: 'Bentuk ringkas V-ing diletakkan tepat sesudah noun yang diterangkan: The woman (who is) standing near the gate is my aunt.',
        segments: ['The woman', 'standing near the gate', 'is', 'my aunt.'],
      }),
      g(21, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat dengan appositive.',
        explanation_id: 'Appositive (frasa noun) diletakkan tepat sesudah noun yang dinamai ulang dan diapit dua koma: Mount Bromo, (which is) an active volcano in East Java, attracts...',
        segments: ['Mount Bromo,', 'an active volcano in East Java,', 'attracts', 'thousands of visitors.'],
      }),
      g(22, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar (kata penghubung objek sudah dihilangkan).',
        explanation_id: 'Kata penghubung objek boleh dibuang, lalu S + V langsung mengikuti noun: The report (that) I wrote last week has been approved.',
        segments: ['The report', 'I wrote last week', 'has been', 'approved.'],
      }),
      g(23, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Buku itu ditulis (pasif, ada by), jadi bentuk ringkasnya V3: The book written by my teacher. V-ing hanya untuk makna aktif.',
        tokens: ['The', 'book', 'writing', 'by', 'my', 'teacher', 'sells', 'very', 'well.'],
        correct_answers: [2],
      }),
      g(24, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Kalimat ini punya dua kata kerja finite (lives, is) tanpa kata penghubung. Who sebagai subjek tidak bisa sekadar dibuang; kata kerjanya harus menjadi V-ing: The man living next door is a doctor.',
        tokens: ['The', 'man', 'lives', 'next', 'door', 'is', 'a', 'doctor.'],
        correct_answers: [2],
      }),
      g(25, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Kata penghubung objek (that/which) sudah dibuang dan ia mewakili objek dari bought, jadi "it" berlebih: The phone I bought last month is already broken.',
        tokens: ['The', 'phone', 'I', 'bought', 'it', 'last', 'month', 'is', 'already', 'broken.'],
        correct_answers: [4],
      }),
      g(26, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Sesudah the first dipakai to infinitive, dan sesudah to selalu V1: the first person to arrive, bukan to arrived.',
        tokens: ['The', 'first', 'person', 'to', 'arrived', 'at', 'the', 'office', 'was', 'Rina.'],
        correct_answers: [4],
      }),
      g(27, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan pola klausa lengkap dengan bentuk ringkasnya.',
        explanation_id: 'Aktif (who works) menjadi V-ing; pasif (which was made) menjadi V3; pasif sedang berlangsung (which is being built) menjadi being + V3; who + be + noun menjadi appositive, yaitu frasa noun saja.',
        points: 4,
        matching: {
          left: ['who works (aktif)', 'which was made (pasif)', 'which is being built (pasif berlangsung)', ', who is a nurse, (be + noun)'],
          right: ['V3', 'appositive (frasa noun saja)', 'V-ing', 'to + V1', 'being + V3'],
          allow_reuse: false,
        },
        correct_answers: [2, 0, 4, 1],
      }),
      g(28, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan tiap kalimat dengan peran kata penghubungnya.',
        explanation_id: 'who + V (helped) = subjek; whom + S + V (I thanked) = objek; whose + noun = kepemilikan; where + S + V = keterangan tempat. Hanya tipe subjek yang diringkas dengan mengubah kata kerja.',
        points: 4,
        matching: {
          left: ['The nurse who helped me was kind.', 'The nurse whom I thanked was kind.', 'The nurse whose son is a pilot was kind.', 'The clinic where she works is small.'],
          right: ['RPO (objek)', 'RA (keterangan)', 'RPS (subjek)', 'RPP (kepemilikan)'],
          allow_reuse: false,
        },
        correct_answers: [2, 0, 3, 1],
      }),
      g(29, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'living (aktif) dan stolen (pasif) adalah bentuk ringkas yang benar. "The man lives next door is" memuat dua kata kerja finite tanpa kata penghubung. "which having" salah karena kata penghubung tidak dipakai bersama participle; yang benar which has been written.',
        points: 2,
        options: ['The people living in this area are friendly.', 'The man lives next door is a doctor.', 'The car stolen last night has been found.', 'The novel which having been written is long.'],
        correct_answers: ['The people living in this area are friendly.', 'The car stolen last night has been found.'],
      }),
      g(30, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang kata penghubungnya BOLEH dibuang tanpa mengubah kata lain.',
        explanation_id: 'that (objek, diikuti subjek she) dan when sesudah the day boleh dibuang: The song she sang, The day we met. Who yang menjadi subjek (who won) tidak boleh dibuang begitu saja, dan kata penghubung pada klausa berkoma (, whom we invited,) wajib ada.',
        points: 2,
        options: ['The song that she sang was beautiful.', 'The day when we met was rainy.', 'The singer who won the contest is from Medan.', 'Mr Lim, whom we invited, could not come.'],
        correct_answers: ['The song that she sang was beautiful.', 'The day when we met was rainy.'],
      }),
    ],
  },
};

export default sub;
