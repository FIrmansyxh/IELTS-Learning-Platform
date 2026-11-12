const P = 'Q-GR212-';
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
    sub_module_title: 'Relative Clauses (who, which, that, whose, where)',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Gabungkan dan kembangkan ide-ide berikut menjadi satu paragraf (sekitar 100 sampai 120 kata) dalam bahasa Inggris tentang kota atau tempat tinggalmu.\n\nParagrafmu wajib memuat:\n- satu defining relative clause dengan who (mis. "people who...")\n- satu non-defining relative clause dengan koma (mis. "My city, which is...,")\n- satu relative clause dengan whose, dan satu dengan where atau when\n- satu klausa yang dipendekkan (participle: "the park located near...", "buildings built in...")\n- tidak ada pengulangan pronoun (mis. "who he") dan tidak ada "that" setelah koma',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: pilihan who/which/that/whose/where tepat; defining tanpa koma dan non-defining dengan koma (tanpa that); pronoun tidak diulang; participle phrase benar (V-ing untuk aktif, V3 untuk pasif). Task Achievement: semua unsur yang diminta muncul. Coherence: kalimat gabungan terbaca wajar dan tidak terlalu panjang. Lexical Resource: kosakata tentang tempat tinggal sesuai.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'The girl ___ sits next to me is my best friend.', ['who', 'which', 'whose', 'where'], 'who', 'Noun orang yang berperan sebagai subjek memakai who.'),
      mcq(2, 'This is the laptop ___ I bought yesterday.', ['who', 'which', 'whose', 'where'], 'which', 'Noun benda memakai which (atau that).'),
      mcq(3, 'The man ___ car was stolen called the police.', ['who', 'which', 'whose', 'whom'], 'whose', 'Whose menyatakan kepemilikan (his car -> whose car).'),
      mcq(4, 'This is the café ___ we first met.', ['which', 'that', 'where', 'whose'], 'where', 'Where dipakai untuk tempat (= in which).'),
      mcq(5, 'I remember the day ___ we graduated.', ['when', 'where', 'who', 'whose'], 'when', 'When dipakai untuk waktu.'),
      mcq(6, 'My brother, ___ lives in Bali, is a chef.', ['that', 'who', 'which', 'whom'], 'who', 'Non-defining (dengan koma) tidak memakai that. Untuk orang: who.'),
      mcq(7, 'Which sentence is CORRECT?', ['The man who he lives here is a doctor.', 'The man who lives here is a doctor.', 'The man which lives here is a doctor.', 'The man whose lives here is a doctor.'], 'The man who lives here is a doctor.', 'Pronoun relative sudah menjadi subjek, jadi tidak perlu mengulang he. Orang = who, bukan which.'),
      mcq(8, 'In which sentence can the relative pronoun be OMITTED?', ['The man who lives next door is a doctor.', 'The book that I read was long.', 'The film that won the award is long.', 'The student who passed is happy.'], 'The book that I read was long.', 'Pronoun objek (diikuti subjek I) boleh dihilangkan. Pronoun subjek (diikuti kata kerja) tidak.'),
      mcq(9, 'Prices rose sharply, ___ surprised many economists.', ['that', 'which', 'what', 'who'], 'which', 'Which (dengan koma) dapat merujuk pada seluruh klausa sebelumnya.'),
      mcq(10, 'Choose the correct reduced form: "The book which was written by Orwell is famous."', ['The book writing by Orwell is famous.', 'The book written by Orwell is famous.', 'The book wrote by Orwell is famous.', 'The book which written by Orwell is famous.'], 'The book written by Orwell is famous.', 'Klausa pasif dipendekkan menjadi V3 (written).'),
      fill(11, 'Lengkapi dengan who atau which: The company ___ employs 500 people is expanding.', ['which', 'that'], 'Noun benda (company) memakai which atau that.'),
      fill(12, 'Lengkapi: The person to ___ I spoke was very helpful. (whom / who)', ['whom'], 'Setelah preposisi (to) memakai whom, bukan who.'),
      fill(13, 'Lengkapi: That is the reason ___ I left early. (why / which)', ['why'], 'Setelah reason dipakai why.'),
      fill(14, 'Lengkapi dengan bentuk V-ing: The students ___ (live) in the dormitory are noisy.', ['living'], 'Klausa aktif dipendekkan menjadi V-ing: students living in the dormitory.'),
      fill(15, 'Lengkapi: The woman ___ daughter is a pilot works at the bank. (who / whose)', ['whose'], 'Whose menyatakan kepemilikan (her daughter).'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar.',
        explanation_id: 'Pola: noun + who + kata kerja + pelengkap + klausa utama.',
        segments: ['The teacher', 'who helped me', 'is very', 'kind.'],
      }),
      g(17, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat dengan non-defining clause.',
        explanation_id: 'Non-defining clause diapit koma dan memakai who untuk orang.',
        segments: ['My mother,', 'who is a nurse,', 'works', 'at night.'],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Pronoun diulang. Relative pronoun "which" sudah menjadi objek, jadi "it" dihapus.',
        tokens: ['The', 'book', 'which', 'I', 'read', 'it', 'was', 'good.'],
        correct_answers: [5],
      }),
      g(19, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Untuk orang gunakan who, bukan which.',
        tokens: ['The', 'girl', 'which', 'is', 'tall', 'is', 'my', 'sister.'],
        correct_answers: [2],
      }),
      g(20, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan relative word dengan pemakaiannya.',
        explanation_id: 'Whose = kepemilikan; where = tempat; why = alasan.',
        points: 3,
        matching: {
          left: ['whose', 'where', 'why'],
          right: ['kepemilikan', 'tempat', 'alasan', 'waktu'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(21, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'Non-defining memakai who dengan koma, bukan that. Subjek pronoun tidak diulang. Objek pronoun boleh dihilangkan.',
        points: 2,
        options: ['My mother, that is a nurse, works at night.', 'My mother, who is a nurse, works at night.', 'The film we watched was long.', 'The man who he lives here is kind.'],
        correct_answers: ['My mother, who is a nurse, works at night.', 'The film we watched was long.'],
      }),
      mcq(22, 'Choose the correct reduced form: "The man who is standing by the door is my uncle."', ['The man standing by the door is my uncle.', 'The man stood by the door is my uncle.', 'The man who standing by the door is my uncle.', 'The man is standing by the door is my uncle.'], 'The man standing by the door is my uncle.', 'Klausa aktif dipendekkan dengan membuang "who is" dan menyisakan V-ing (standing).'),
      mcq(23, '"The students, who studied hard, passed." What does this sentence mean?', ['All the students studied hard, and all of them passed.', 'Only the students who studied hard passed.', 'Some of the students did not pass.', 'The students passed without studying.'], 'All the students studied hard, and all of them passed.', 'Dengan koma (non-defining), keterangannya hanya tambahan: semua siswa rajin dan semuanya lulus.'),
      mcq(24, 'Which sentence is CORRECT?', ['This is the house where I live in.', 'This is the house where I live.', 'This is the house which I live.', 'This is the house who I live in.'], 'This is the house where I live.', 'Where sudah mengandung makna "in which", jadi tidak perlu "in" lagi.'),
      mcq(25, 'The company for ___ she works is very large.', ['which', 'that', 'who', 'where'], 'which', 'Setelah preposisi (for) tidak boleh that atau who. Untuk benda pakai which.'),
      fill(26, 'Lengkapi dengan bentuk V3: The city ___ (locate) in the north is very cold.', ['located'], 'Klausa pasif (which is located) dipendekkan menjadi V3: the city located in the north.'),
      fill(27, 'Lengkapi: ___ do you think is right? (Who / Whom)', ['Who', 'who'], 'Kata tanya ini adalah subjek dari "is right", jadi pakai who, bukan whom.'),
      fill(28, 'Lengkapi: Jakarta, ___ is the capital of Indonesia, is very crowded. (which / that)', ['which'], 'Jakarta sudah unik, jadi klausanya non-defining (diapit koma) dan tidak boleh memakai that.'),
      g(29, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar (relative pronoun objek dihilangkan).',
        explanation_id: 'Pronoun objek boleh dihilangkan: The café (that) I go to every weekend serves great coffee.',
        segments: ['The café', 'I go to', 'every weekend', 'serves', 'great coffee.'],
      }),
      g(30, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Whose sudah menggantikan "his", jadi "his" harus dihapus.',
        tokens: ['A', 'person', 'whose', 'his', 'job', 'is', 'dangerous', 'needs', 'insurance.'],
        correct_answers: [3],
      }),
    ],
  },
};

export default sub;
