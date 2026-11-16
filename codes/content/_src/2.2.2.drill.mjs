const P = 'Q-WR222-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'WRITING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 2,
    module_code: '2.2',
    module_category: 'WRITING',
    sub_module_title: 'Teknik Paraphrasing (Sinonim, Word Form, Aktif-Pasif)',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Bagian A (parafrase kalimat): Parafrasekan tiga kalimat berikut dalam bahasa Inggris dengan makna yang SAMA. Untuk tiap kalimat gunakan minimal DUA teknik berbeda (sinonim, word form, aktif-pasif, perubahan struktur) dan tulis nama tekniknya dalam tanda kurung.\n1. Many people believe that technology makes life easier.\n2. The government built a new airport in 2018.\n3. Prices rose sharply after the new tax was introduced.\n\nBagian B (introduction): Parafrasekan soal berikut menjadi 1 sampai 2 kalimat introduction Task 2 (jangan menyalin): "More and more people are choosing to work from home. Is this a positive or negative development?" Akhiri dengan thesis singkat.\n\nAngka, tahun, dan istilah teknis tidak boleh diubah.',
    ai_rubric_criteria:
      'Lexical Resource: sinonim tepat makna dan kolokasi (bukan sekadar kata sulit); word form benar. Grammatical Range and Accuracy: struktur berubah dengan benar (aktif-pasif, klausa ke frasa), tidak ada kesalahan akibat struktur baru. Task Achievement: makna tetap sama, angka dan tahun tidak berubah, introduction tidak menyalin soal dan memuat thesis. Setiap kalimat memakai minimal dua teknik berbeda.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which of the following is NOT a paraphrasing technique?', ['Copying phrases from the question', 'Using synonyms', 'Changing the word form', 'Changing active to passive'], 'Copying phrases from the question', 'Menyalin frasa bukan parafrase. Teknik utama: sinonim, word form, aktif-pasif, dan perubahan struktur.'),
      mcq(2, 'Which collocation is correct?', ['a big rain', 'heavy rain', 'a high rain', 'a strong rain'], 'heavy rain', 'Kolokasi yang benar adalah heavy rain. Sinonim harus mempertimbangkan kolokasi.'),
      mcq(3, 'Which sentence is the best paraphrase of "The number of students increased."?', ['There was an increase in the number of students.', 'The number of students doubled.', 'The number of students fell.', 'The students were increased.'], 'There was an increase in the number of students.', 'Perubahan word form (verb increased menjadi noun increase) mempertahankan makna.'),
      mcq(4, 'Which paraphrase of "Prices rose sharply." CHANGES the meaning?', ['There was a sharp rise in prices.', 'Prices increased dramatically.', 'Prices doubled.', 'Prices went up considerably.'], 'Prices doubled.', '"Doubled" menyatakan kenaikan tepat dua kali lipat, yang lebih spesifik daripada "sharply". Parafrase tidak boleh mengubah makna.'),
      mcq(5, 'Which is the best paraphrase of "Some people think that children spend too much time on computers."?', ['It is widely thought that young people spend excessive time in front of computers.', 'Some people think that children spend too much time on computers.', 'All children are addicted to computers.', 'Computers are bad.'], 'It is widely thought that young people spend excessive time in front of computers.', 'Parafrase terbaik mengubah struktur dan kata tanpa mengubah makna. Pilihan lain menyalin atau mengubah makna.'),
      mcq(6, 'What is the noun form of "decide"?', ['decision', 'decisive', 'decisively', 'decided'], 'decision', 'Decide (verb), decision (noun), decisive (adjective), decisively (adverb).'),
      mcq(7, 'Which is the passive form of "The government built a new airport."?', ['A new airport was built by the government.', 'A new airport built the government.', 'A new airport is building by the government.', 'The government was built a new airport.'], 'A new airport was built by the government.', 'Pasif simple past: was + V3 (built).'),
      mcq(8, 'Which should NOT be paraphrased?', ['The figure 45% and the year 2020', 'The verb "show"', 'The word "important"', 'The phrase "a lot of"'], 'The figure 45% and the year 2020', 'Angka, tahun, nama, dan istilah teknis tidak diparafrase karena mengubah data.'),
      mcq(9, 'Which sentence is a correct word-form paraphrase of "Technology is developing rapidly."?', ['There is rapid development in technology.', 'Technology develop rapid.', 'Technology is a rapid developing.', 'The development of technology rapidly.'], 'There is rapid development in technology.', 'Verb developing berubah menjadi noun development dan adverb rapidly menjadi adjective rapid.'),
      mcq(10, 'Which is a correct paraphrase of "Because it was raining, we stayed home."?', ['Because of the rain, we stayed home.', 'Because of it was raining, we stayed home.', 'Despite the rain, we stayed home.', 'Although it was raining, we stayed home.'], 'Because of the rain, we stayed home.', 'Klausa because diubah menjadi frasa because of + noun. Despite dan although mengubah makna menjadi kontras.'),
      fill(11, 'Lengkapi: Prices rose sharply. = There was a sharp ___ in prices.', ['rise', 'increase'], 'Verb rose menjadi noun rise; adverb sharply menjadi adjective sharp.'),
      fill(12, 'Lengkapi: Students find it difficult to concentrate. = Students have ___ concentrating.', ['difficulty', 'trouble'], 'Find it difficult menjadi have difficulty (+ V-ing).'),
      fill(13, 'Lengkapi: The government decided to build a bridge. = The government made a ___ to build a bridge.', ['decision'], 'Verb decided menjadi make a decision.'),
      fill(14, 'Lengkapi: The test was easy. = The test was not ___.', ['difficult', 'hard'], 'Negasi + antonim: easy menjadi not difficult.'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi parafrase pasif yang benar.',
        explanation_id: 'Pola: It is widely believed that + klausa.',
        segments: ['It is widely believed', 'that young people', 'spend excessive time', 'in front of screens.'],
      }),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat pasif yang benar.',
        explanation_id: 'Pasif simple past: subjek baru + was + V3 + by + pelaku.',
        segments: ['A new airport', 'was built', 'by', 'the government.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata dengan kolokasi yang salah.',
        explanation_id: 'Kolokasi yang benar adalah "heavy rain", bukan "big rain".',
        tokens: ['There', 'was', 'a', 'big', 'rain', 'last', 'night.'],
        correct_answers: [3],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (kelas kata).',
        explanation_id: 'Setelah adjective "rapid" diperlukan noun: "development", bukan verb "develop".',
        tokens: ['There', 'was', 'a', 'rapid', 'develop', 'in', 'technology.'],
        correct_answers: [4],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kata dengan sinonim yang tepat.',
        explanation_id: 'Significant = considerable; assist = help; decline = decrease.',
        points: 3,
        matching: {
          left: ['significant', 'assist', 'decline'],
          right: ['considerable', 'help', 'decrease', 'expensive'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA kebiasaan parafrase yang baik.',
        explanation_id: 'Menggabungkan dua teknik dan mempertahankan angka/nama adalah kebiasaan baik. Memakai kata tersulit atau mengubah makna merugikan.',
        points: 2,
        options: ['Combine two techniques, such as synonym and structure change', 'Keep numbers and names unchanged', 'Replace every word with the hardest synonym', 'Change the meaning to sound more impressive'],
        correct_answers: ['Combine two techniques, such as synonym and structure change', 'Keep numbers and names unchanged'],
      }),
      mcq(21, 'Which word has the right register for a formal essay?', ['children', 'kids', 'kiddies', 'little guys'], 'children', 'Register harus sesuai: "kids" santai, sedangkan "children" formal dan cocok untuk esai.'),
      mcq(22, 'The text says: "About a fifth of pupils stopped." Which statement has the same meaning?', ['20% of pupils stopped.', '5% of pupils stopped.', 'Half of the pupils stopped.', 'Five pupils stopped.'], '20% of pupils stopped.', 'A fifth = seperlima = 20%. Soal Reading sering memarafrase angka dengan bentuk lain yang nilainya sama.'),
      mcq(23, 'The text says: "Participation rose." Which statement matches the text?', ['Participation did not fall.', 'Participation fell.', 'Participation doubled.', 'Participation stayed the same.'], 'Participation did not fall.', 'Parafrase dengan antonim + negasi: rose = did not fall. "Doubled" menambah informasi yang tidak ada di teks.'),
      mcq(24, 'Which is a correct paraphrase of "Although he was tired, he finished the work."?', ['Despite being tired, he finished the work.', 'Despite he was tired, he finished the work.', 'Because he was tired, he finished the work.', 'Although being tired, but he finished the work.'], 'Despite being tired, he finished the work.', 'Konjungsi diganti: although + klausa menjadi despite + V-ing, maknanya tetap kontras.'),
      mcq(25, 'Which is the best paraphrase of "The graph shows the percentage of households with internet access."?', ['The graph illustrates the proportion of homes with online access.', 'The graph shows the percentage of households with internet access.', 'The graph illustrates the number of people who own computers.', 'The graph proves that all homes have internet access.'], 'The graph illustrates the proportion of homes with online access.', 'Shows menjadi illustrates, percentage menjadi proportion, households menjadi homes: kata berubah, makna tetap. Pilihan lain menyalin atau mengubah makna.'),
      fill(26, 'Lengkapi: Many people use public transport. = Public transport is ___ by many people.', ['used'], 'Aktif menjadi pasif: is + V3 (used) + by + pelaku.'),
      fill(27, 'Lengkapi dengan bentuk noun dari "improve": There has been a clear ___ in air quality.', ['improvement'], 'Verb improve menjadi noun improvement (perubahan word form).'),
      fill(28, 'Lengkapi: The man who lives next door is a doctor. = The man ___ next door is a doctor.', ['living'], 'Relative clause aktif (who lives) dipendekkan menjadi V-ing: living.'),
      g(29, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata dengan kolokasi yang salah.',
        explanation_id: 'Kolokasi yang benar adalah "a high price", bukan "a big price".',
        tokens: ['The', 'shop', 'charged', 'a', 'big', 'price', 'for', 'the', 'repair.'],
        correct_answers: [4],
      }),
      g(30, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kata dengan bentuk noun-nya.',
        explanation_id: 'Succeed menjadi success; popular menjadi popularity; differ menjadi difference. "Successful" adalah adjective.',
        points: 3,
        matching: {
          left: ['succeed', 'popular', 'differ'],
          right: ['success', 'popularity', 'difference', 'successful'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
    ],
  },
};

export default sub;
