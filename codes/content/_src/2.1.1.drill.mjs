const P = 'Q-GR211-';
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
    sub_module_title: 'Conjunctions & Discourse Markers (however, although, despite, therefore, whereas)',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis satu paragraf Writing Task 2 (sekitar 100 sampai 130 kata) dalam bahasa Inggris tentang: "Some people think students should wear school uniforms. Others disagree." Berikan pendapatmu.\n\nDalam paragrafmu wajib ada:\n- satu kontras dengan although / whereas / while (satu penghubung, bukan dua)\n- satu discourse marker kontras di awal kalimat (However, / Nevertheless,) dengan koma yang benar\n- satu sebab-akibat (because / because of / therefore / as a result)\n- satu penambahan (In addition, / Moreover,) dan satu contoh (For example,)\n- tidak ada comma splice dan tidak ada pola "Although..., but" atau "Despite of"',
    ai_rubric_criteria:
      'Coherence and Cohesion: penghubung bervariasi dan tepat fungsi; tidak mekanis. Grammatical Accuracy: although + klausa, despite + noun/V-ing, because of + noun; tanda baca discourse marker benar; tanpa comma splice dan tanpa penghubung ganda (Although... but, Because... so). Task Achievement: semua elemen yang diminta tercakup. Lexical Resource: pilihan penghubung formal sesuai register esai.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, '___ it was raining, we played football.', ['Although', 'Despite', 'Because of', 'However'], 'Although', 'Although diikuti klausa lengkap (it was raining) dan menyatakan kontras.'),
      mcq(2, '___ the rain, we played football.', ['Although', 'Despite', 'Because', 'However'], 'Despite', 'Despite diikuti noun (the rain). Although memerlukan klausa dengan subjek dan kata kerja.'),
      mcq(3, 'She stayed at home ___ her illness.', ['because', 'because of', 'although', 'despite of'], 'because of', 'Because of diikuti noun (her illness). Because memerlukan klausa.'),
      mcq(4, 'The plan is cheap. ___, it may take too long.', ['Because', 'Although', 'However', 'Despite'], 'However', 'However menghubungkan dua kalimat yang kontras dan diikuti koma.'),
      mcq(5, 'Rich countries use a lot of energy, ___ poor countries use much less.', ['whereas', 'because', 'so', 'unless'], 'whereas', 'Whereas membandingkan dua hal yang berbeda dalam satu kalimat.'),
      mcq(6, 'Prices rose sharply. ___, fewer people bought new cars.', ['Although', 'As a result', 'Despite', 'Whereas'], 'As a result', 'As a result menyatakan akibat dari kalimat sebelumnya, diikuti koma.'),
      mcq(7, 'Which sentence is CORRECT?', ['Although it rained, but we went out.', 'Although it rained, we went out.', 'Despite of the rain, we went out.', 'Because it rained, so we stayed in.'], 'Although it rained, we went out.', 'Satu hubungan logis hanya memakai satu penghubung. "Although... but", "Despite of", dan "Because... so" salah.'),
      mcq(8, 'Which sentence has a COMMA SPLICE (error)?', ['It was cold, so we went home.', 'It was cold, we went home.', 'It was cold; we went home.', 'It was cold. We went home.'], 'It was cold, we went home.', 'Dua klausa lengkap hanya dipisah koma = comma splice. Perbaiki dengan konjungsi, titik koma, atau titik.'),
      mcq(9, 'Which marker introduces an EXAMPLE?', ['For instance', 'Nevertheless', 'Consequently', 'In contrast'], 'For instance', 'For instance dan For example memperkenalkan contoh.'),
      mcq(10, 'Which marker is best for the CONCLUSION of an essay?', ['At last', 'In conclusion', 'In the other hand', 'Besides'], 'In conclusion', 'In conclusion menutup esai. "At last" berarti akhirnya setelah penantian.'),
      fill(11, 'Lengkapi: ___ being tired, she finished her homework. (despite / although)', ['despite', 'Despite'], 'Despite diikuti V-ing (being tired). Although akan memerlukan klausa lengkap.'),
      fill(12, 'Lengkapi: He missed the train ___ the heavy traffic. (because / because of)', ['because of'], 'Because of diikuti noun (the heavy traffic).', 2),
      fill(13, 'Lengkapi: It was ___ hot that we stayed inside. (so / such)', ['so'], 'Pola so + adjektif + that: so hot that.'),
      fill(14, 'Lengkapi: I saved money ___ that I could travel. (so / because)', ['so'], 'So that menyatakan tujuan.'),
      fill(15, 'Lengkapi: ___ you hurry, you will miss the bus. (Unless / Although)', ['Unless', 'unless'], 'Unless = if not; Unless you hurry = jika tidak bergegas.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar.',
        explanation_id: 'Pola: Although + klausa, klausa utama (dengan koma).',
        segments: ['Although', 'it was late,', 'she kept', 'working.'],
      }),
      g(17, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar.',
        explanation_id: 'Pola: klausa utama + despite + noun/V-ing.',
        segments: ['They', 'cancelled the trip', 'because of', 'the storm.'],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Despite tidak memakai "of". Gunakan "despite" atau "in spite of".',
        tokens: ['Despite', 'of', 'the', 'rain,', 'we', 'went', 'out.'],
        correct_answers: [1],
      }),
      g(19, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Although dan but tidak dipakai bersamaan. Hapus "but".',
        tokens: ['Although', 'he', 'is', 'young,', 'but', 'he', 'is', 'wise.'],
        correct_answers: [4],
      }),
      g(20, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan penghubung dengan fungsinya.',
        explanation_id: 'However = kontras; Therefore = akibat; Moreover = tambahan.',
        points: 3,
        matching: {
          left: ['However', 'Therefore', 'Moreover'],
          right: ['kontras', 'akibat', 'tambahan', 'contoh'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(21, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'Despite + noun dan although + klausa benar. "Because of it was late" dan "Despite he was tired" salah karena jenis kata setelah penghubung tidak sesuai.',
        points: 2,
        options: ['Despite the delay, the match started.', 'Because of it was late, we left.', 'Although he was tired, he continued.', 'Despite he was tired, he continued.'],
        correct_answers: ['Despite the delay, the match started.', 'Although he was tired, he continued.'],
      }),
    ],
  },
};

export default sub;
