const P = 'Q-GR214-';
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
    sub_module_title: 'Conditional Sentences (Zero, First, Second, Third) untuk Argumen Esai',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis satu paragraf argumen Writing Task 2 (sekitar 110 sampai 140 kata) dalam bahasa Inggris tentang: "Should governments make public transport free?"\n\nDalam paragrafmu wajib ada:\n- satu First Conditional untuk prediksi nyata (If governments ..., ... will ...)\n- satu Second Conditional untuk usulan hipotetis (If more people used..., ... would ...)\n- satu Third Conditional atau Mixed Conditional tentang masa lalu/akibat sekarang\n- satu kalimat dengan unless, as long as, atau provided that\n- tidak ada will/would di klausa if, dan tidak ada "unless ... don\'t"',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: rumus conditional benar (if + present, will; if + past, would; if + past perfect, would have + V3); tidak ada will/would di klausa if; were untuk hipotetis; unless/as long as dipakai tepat tanpa negatif ganda. Task Achievement: argumen jelas, kedua sisi dipertimbangkan, semua elemen conditional muncul. Coherence: hubungan sebab-akibat logis. Lexical Resource: kosakata kebijakan transportasi sesuai.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'If you heat ice, it ___.', ['melts', 'will melt', 'would melt', 'melted'], 'melts', 'Fakta ilmiah = zero conditional: If + present simple, present simple.'),
      mcq(2, 'If it rains tomorrow, we ___ at home.', ['stay', 'will stay', 'would stay', 'stayed'], 'will stay', 'Kemungkinan nyata di masa depan = first conditional: If + present, will + V1.'),
      mcq(3, 'If I ___ more time, I would travel the world.', ['have', 'had', 'will have', 'would have'], 'had', 'Hipotetis (tidak nyata sekarang) = second conditional: If + past simple, would + V1.'),
      mcq(4, 'If she ___ harder, she would have passed the exam.', ['studied', 'had studied', 'would study', 'has studied'], 'had studied', 'Andai masa lampau = third conditional: If + past perfect, would have + V3.'),
      mcq(5, 'If I ___ you, I would accept the offer.', ['am', 'was', 'were', 'be'], 'were', 'Hipotetis memakai were untuk semua subjek (If I were you).'),
      mcq(6, '___ you hurry, you will miss the train.', ['Unless', 'If', 'Although', 'Because'], 'Unless', '"Unless you hurry" = if you don\'t hurry. Unless sudah bermakna negatif.'),
      mcq(7, 'Which sentence is CORRECT?', ['If I will see him, I will tell him.', 'If I see him, I will tell him.', 'If I would see him, I tell him.', 'If I saw him, I will tell him.'], 'If I see him, I will tell him.', 'Klausa if pada first conditional memakai present simple, bukan will.'),
      mcq(8, 'What does "If I hadn\'t missed the bus, I wouldn\'t have been late" mean?', ['I missed the bus and was late.', 'I did not miss the bus and was not late.', 'I will miss the bus and be late.', 'I am missing the bus now.'], 'I missed the bus and was late.', 'Third conditional membicarakan hal yang tidak terjadi: kenyataannya saya ketinggalan bus dan terlambat.'),
      mcq(9, 'Which sentence is a MIXED conditional (past cause, present result)?', ['If I study, I will pass.', 'If I had studied medicine, I would be a doctor now.', 'If I were rich, I would buy a car.', 'If you heat ice, it melts.'], 'If I had studied medicine, I would be a doctor now.', 'Mixed 3→2: if + past perfect, would + V1 (akibat sekarang).'),
      mcq(10, 'Take an umbrella ___ it rains.', ['unless', 'in case', 'although', 'so that'], 'in case', '"In case" = untuk berjaga-jaga jika hujan.'),
      fill(11, 'Lengkapi dengan bentuk yang benar dari "rain": If it ___ tomorrow, we will cancel the picnic.', ['rains'], 'Klausa if pada first conditional memakai present simple (rains).'),
      fill(12, 'Lengkapi dengan V1: If I won the lottery, I would ___ a house.', ['buy', 'purchase', 'build'], 'Klausa utama second conditional: would + V1.'),
      fill(13, 'Lengkapi dengan V3 dari "know": If I had ___, I would have helped.', ['known'], 'Third conditional: had + V3 di klausa if. V3 dari know adalah known.'),
      fill(14, 'Lengkapi: I wish I ___ more free time. (have)', ['had'], 'Wish tentang keadaan sekarang memakai past simple: I wish I had...'),
      fill(15, 'Lengkapi dengan unless atau if: ___ you don\'t hurry, you will be late.', ['If', 'if'], 'Dengan "don\'t" memakai If. Unless sudah bermakna negatif, sehingga tidak boleh diikuti negatif lagi.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat second conditional yang benar.',
        explanation_id: 'Pola: If + S + past simple, S + would + V1.',
        segments: ['If I', 'had more time,', 'I would', 'learn to dance.'],
      }),
      g(17, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat third conditional yang benar.',
        explanation_id: 'Pola: If + S + had + V3, S + would have + V3.',
        segments: ['If she', 'had left earlier,', 'she would', 'have caught the train.'],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Tidak ada "will" di klausa if. Gunakan present simple: If it rains.',
        tokens: ['If', 'it', 'will', 'rain', 'tomorrow,', 'we', 'will', 'stay', 'home.'],
        correct_answers: [2],
      }),
      g(19, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Third conditional: klausa if memakai past perfect (had studied), bukan "would have studied".',
        tokens: ['If', 'I', 'would', 'have', 'studied,', 'I', 'would', 'have', 'passed.'],
        correct_answers: [2],
      }),
      g(20, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan tipe conditional dengan fungsinya.',
        explanation_id: 'Zero = fakta umum; second = hipotetis sekarang; third = penyesalan masa lampau.',
        points: 3,
        matching: {
          left: ['Zero conditional', 'Second conditional', 'Third conditional'],
          right: ['fakta/kebenaran umum', 'hipotetis sekarang', 'penyesalan masa lampau', 'prediksi nyata'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(21, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'Second dan third conditional benar. "If I will" dan "Unless you don\'t" salah.',
        points: 2,
        options: ['If I will see him, I tell him.', 'If more people cycled, cities would be cleaner.', 'Unless you don\'t hurry, you will be late.', 'If I had known, I would have helped.'],
        correct_answers: ['If more people cycled, cities would be cleaner.', 'If I had known, I would have helped.'],
      }),
    ],
  },
};

export default sub;
