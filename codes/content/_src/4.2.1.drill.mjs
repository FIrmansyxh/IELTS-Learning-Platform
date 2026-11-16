const P = 'Q-GR421-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'GRAMMAR', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 4,
    module_code: '4.2',
    module_category: 'WRITING',
    sub_module_title: 'Penggunaan Inversion, Participle Clauses, & Nominalization secara Alami',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis satu paragraf Writing Task 2 (sekitar 120 sampai 150 kata) dalam bahasa Inggris tentang: "Many people believe that governments should spend more on public transport rather than building new roads. Discuss."\n\nWajib memakai, masing-masing dengan akurat:\n- SATU inversion (mis. Not only does..., but...; Rarely do...; Had governments...)\n- DUA participle clause dengan subjek yang sama dengan klausa utama (mis. Attracted by..., resulting in..., Having invested...)\n- DUA nominalization (mis. the rapid growth in car use, an improvement in air quality)\n\nJangan memaksakan: paragraf harus tetap natural, tanpa dangling participle.',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: inversion benar (auxiliary sebelum subjek, bentuk kata kerja tepat); participle clause dengan subjek sama (tanpa dangling participle); nominalization akurat (kelas kata benar). Task Response: argumen jelas dan seimbang. Coherence and Cohesion: struktur tidak dipaksakan, paragraf terbaca natural. Lexical Resource: frasa nomina akademik tepat. Kesalahan urutan kata inversion atau dangling participle membatasi skor.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which sentence uses inversion correctly?', ['Never have I seen such a beautiful place.', 'Never I have seen such a beautiful place.', 'Never I saw have such a beautiful place.', 'Never seen I have such a beautiful place.'], 'Never have I seen such a beautiful place.', 'Setelah Never, auxiliary mendahului subjek: Never have I seen.'),
      mcq(2, 'Which sentence is correct?', ['Not only did he win the race, but he also broke the record.', 'Not only he won the race, but he also broke the record.', 'Not only he did win the race, but he also broke the record.', 'Not only won he the race, but he also broke the record.'], 'Not only did he win the race, but he also broke the record.', 'Not only + did + subjek + V1; tambahkan did bila tidak ada auxiliary.'),
      mcq(3, 'Complete correctly: "No sooner had she arrived ___ the phone rang."', ['than', 'when', 'that', 'then'], 'than', 'Pasangan tetap: No sooner ... than. (Hardly ... when).'),
      mcq(4, 'Which is the formal inversion of "If I had known, I would have helped"?', ['Had I known, I would have helped.', 'If had I known, I would have helped.', 'Had I knew, I would have helped.', 'Did I know, I would have helped.'], 'Had I known, I would have helped.', 'Inversion conditional tipe 3: Had + subjek + V3, would have + V3.'),
      mcq(5, 'Which sentence has a DANGLING participle?', ['Walking home, the rain started.', 'Walking home, I was caught in the rain.', 'Having finished the report, she left.', 'Tired after the trip, he went to bed.'], 'Walking home, the rain started.', 'Subjek participle (orang yang berjalan) berbeda dari subjek kalimat utama (the rain).'),
      mcq(6, 'Choose the best participle clause: "After she had finished the report, she went home."', ['Having finished the report, she went home.', 'Finishing the report, she went home.', 'Finished the report, she went home.', 'To finish the report, she went home.'], 'Having finished the report, she went home.', 'Perfect participle (having + V3) menyatakan tindakan yang selesai lebih dulu.'),
      mcq(7, 'Which is a nominalization of "Prices rose quickly"?', ['the rapid rise in prices', 'prices rising quick', 'quickly rising of prices', 'the price quickly rose'], 'the rapid rise in prices', 'Verb rose menjadi noun rise; adverb quickly menjadi adjective rapid.'),
      mcq(8, 'Which noun is derived from "decide"?', ['decision', 'decisive', 'decisively', 'decided'], 'decision', 'Decide (verb), decision (noun), decisive (adjective).'),
      mcq(9, 'Which sentence is correct?', ['Under no circumstances should you share your password.', 'Under no circumstances you should share your password.', 'Under no circumstances should share you your password.', 'Under no circumstances do you should share your password.'], 'Under no circumstances should you share your password.', 'Setelah Under no circumstances, modal mendahului subjek: should you.'),
      mcq(10, 'What is the best way to use these advanced structures in an essay?', ['Use them sparingly and accurately where they support the argument', 'Use them in every sentence', 'Avoid them completely', 'Use them only in the conclusion'], 'Use them sparingly and accurately where they support the argument', 'Struktur lanjutan menaikkan skor bila akurat dan wajar; berlebihan terdengar dipaksakan.'),
      fill(11, 'Lengkapi dengan auxiliary: Rarely ___ I seen such a large crowd.', ['have'], 'Rarely + have + subjek + V3.'),
      fill(12, 'Lengkapi dengan auxiliary: Not only ___ technology save time, but it also reduces costs.', ['does'], 'Not only + does + subjek + V1 (technology tunggal).'),
      fill(13, 'Lengkapi: Hardly had we left ___ it began to rain.', ['when'], 'Pasangan tetap: Hardly ... when.'),
      fill(14, 'Lengkapi dengan participle: ___ in 1990, the bridge is still strong. (build)', ['Built'], 'Past participle (pasif): Built in 1990, ...'),
      fill(15, 'Lengkapi dengan noun yang tepat: There has been an ___ in car use. (kenaikan)', ['increase'], 'Noun increase setelah an: an increase in.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat dengan inversion yang benar.',
        explanation_id: 'Pola: Not only + do + subjek + V1, but + klausa kedua.',
        segments: ['Not only do cars', 'cause pollution,', 'but they also', 'increase noise.'],
      }),
      g(17, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat dengan participle clause yang benar.',
        explanation_id: 'Pola: Having + V3, + subjek yang sama + kata kerja.',
        segments: ['Having examined the data,', 'the researchers', 'concluded that the policy', 'was ineffective.'],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (inversion).',
        explanation_id: 'Setelah Never harus ada inversion: "have I seen", bukan "I have seen".',
        tokens: ['Never', 'I', 'have', 'seen', 'such', 'a', 'thing.'],
        correct_answers: [1],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan struktur dengan contohnya.',
        explanation_id: 'Rarely does he complain = inversion; Having finished = participle; The rapid rise in prices = nominalization.',
        points: 3,
        matching: {
          left: ['inversion', 'participle clause', 'nominalization'],
          right: ['Rarely does he complain.', 'Having finished the report, she left.', 'The rapid rise in prices worries people.', 'Prices rose quickly.'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA kalimat yang benar.',
        explanation_id: 'Had I known dan Having finished the report, she... benar. "Walking home, the rain started" dangling; "Never I have seen" tidak diinversi.',
        points: 2,
        options: ['Had I known, I would have helped.', 'Having finished the report, she left.', 'Walking home, the rain started.', 'Never I have seen such a thing.'],
        correct_answers: ['Had I known, I would have helped.', 'Having finished the report, she left.'],
      }),
      mcq(21, 'Which sentence is correct?', ['Little did he know about the plan.', 'Little he knew about the plan.', 'Little did he knew about the plan.', 'Little knew did he about the plan.'], 'Little did he know about the plan.', 'Setelah Little: did + subjek + V1 (know), bukan knew.'),
      mcq(22, 'Which is the formal inversion of "If you should need help, call us"?', ['Should you need help, call us.', 'If should you need help, call us.', 'Should need you help, call us.', 'Had you need help, call us.'], 'Should you need help, call us.', 'Inversion conditional formal: if dihilangkan dan should pindah ke depan subjek.'),
      mcq(23, 'Complete correctly: "Only when the exam was over ___ relax."', ['did she', 'she did', 'she', 'was she'], 'did she', 'Setelah Only when + klausa, klausa utama diinversi: did + subjek + V1.'),
      mcq(24, 'Which participle clause correctly replaces "If it is used correctly, the tool saves time"?', ['Used correctly, the tool saves time.', 'Using correctly, the tool saves time.', 'Having used correctly, the tool saves time.', 'To used correctly, the tool saves time.'], 'Used correctly, the tool saves time.', 'Maknanya pasif (alat itu dipakai), jadi dipakai past participle: Used correctly, ...'),
      mcq(25, 'Which sentence correctly fixes the dangling participle in "Being tired, the exam was difficult"?', ['Being tired, I found the exam difficult.', 'Being tired, the exam was found difficult.', 'Being tired, it was a difficult exam.', 'Being tired, the difficulty of the exam was clear.'], 'Being tired, I found the exam difficult.', 'Yang lelah adalah orangnya, jadi subjek klausa utama harus "I", bukan "the exam".'),
      fill(26, 'Lengkapi dengan noun dari kata sifat important: The ___ of protecting forests is widely recognised.', ['importance'], 'Nominalization adjective menjadi noun: important menjadi importance.'),
      fill(27, 'Lengkapi inversion conditional formal: ___ it not for the funding, the project would fail.', ['Were', 'were'], '"If it were not for..." menjadi "Were it not for..." dalam bentuk formal.'),
      fill(28, 'Lengkapi dengan participle: Governments cut spending, ___ to a rise in unemployment. (lead)', ['leading'], 'Participle clause akibat: ..., leading to + noun.'),
      g(29, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat dengan participle clause yang benar.',
        explanation_id: 'Pola: Faced with + noun, + subjek yang sama (many companies) + kata kerja.',
        segments: ['Faced with rising costs,', 'many companies', 'reduced', 'their workforce.'],
      }),
      g(30, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (kelas kata).',
        explanation_id: 'Setelah "The" diperlukan noun: "decision", bukan verb "decide".',
        tokens: ['The', 'decide', 'of', 'the', 'government', 'surprised', 'everyone.'],
        correct_answers: [1],
      }),
    ],
  },
};

export default sub;
