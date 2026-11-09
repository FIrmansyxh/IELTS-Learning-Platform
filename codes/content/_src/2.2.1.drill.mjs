const P = 'Q-WR221-';
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
    sub_module_title: 'Anatomi Paragraf Akademik: Topic Sentence + Explanation + Concrete Example',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis SATU paragraf badan dalam bahasa Inggris (sekitar 90 sampai 110 kata) untuk soal: "Some people think museums should be free for everyone. Do you agree?" Dukung pendapat setuju.\n\nGunakan struktur TEEL:\n- Topic sentence yang jelas dengan controlling idea (pernyataan, bukan pertanyaan)\n- Explanation yang menjawab "mengapa/bagaimana" (1 sampai 2 kalimat)\n- Example yang SPESIFIK (siapa, melakukan apa, hasilnya), tanpa statistik karangan\n- Link yang mengaitkan kembali ke pertanyaan\n\nPastikan semua kalimat mendukung satu ide dan gunakan minimal dua penghubung berbeda.',
    ai_rubric_criteria:
      'Task Response: satu ide utama dikembangkan, posisi jelas. Coherence and Cohesion: topic sentence dengan controlling idea; explanation menambah informasi baru (bukan mengulang); contoh spesifik; link; unity (tidak ada kalimat tidak relevan); penghubung dan kata rujukan (this, such) tepat. Lexical Resource: kosakata formal tepat. Grammar: kalimat bervariasi dan akurat. Contoh samar (many people) dan statistik karangan membatasi skor.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'What does TEEL stand for?', ['Topic sentence, Explanation, Example, Link', 'Title, Evidence, Ending, Language', 'Topic, Edit, Express, List', 'Thesis, Example, Evaluate, Link'], 'Topic sentence, Explanation, Example, Link', 'TEEL: topic sentence, explanation, example, link.'),
      mcq(2, 'Which is the BEST topic sentence for a body paragraph?', ['Education is important.', 'Free education can reduce inequality by giving poor students equal opportunities.', 'Some schools in Medan provide free textbooks in grade 3.', 'Why is education important?'], 'Free education can reduce inequality by giving poor students equal opportunities.', 'Topic sentence yang baik fokus dan memuat controlling idea. Pilihan lain terlalu luas, terlalu sempit, atau berupa pertanyaan.'),
      mcq(3, 'Which sentence does NOT belong in this paragraph? "(1) Regular exercise improves students\' concentration. (2) Physical activity increases blood flow to the brain. (3) School uniforms are often expensive. (4) For instance, a student who plays football feels more alert."', ['Sentence 1', 'Sentence 2', 'Sentence 3', 'Sentence 4'], 'Sentence 3', 'Kalimat 3 tentang seragam tidak mendukung ide utama (olahraga dan konsentrasi). Ini melanggar unity.'),
      mcq(4, 'Which is the MOST specific example?', ['For example, many people use public transport.', 'For example, a worker who takes the bus instead of driving saves money on fuel and parking every month.', 'For example, it is good.', 'For example, there are many examples.'], 'For example, a worker who takes the bus instead of driving saves money on fuel and parking every month.', 'Contoh kuat menyebut siapa, melakukan apa, dan hasilnya.'),
      mcq(5, 'What is the function of "Therefore, schools should include daily exercise"?', ['Link to the thesis', 'Topic sentence', 'Explanation', 'Introduction'], 'Link to the thesis', 'Kalimat penutup yang mengaitkan kembali ke pendapat utama adalah link.'),
      mcq(6, 'About how long should a body paragraph in Task 2 be?', ['80 to 120 words', '20 words', '300 words', 'One sentence'], '80 to 120 words', 'Paragraf badan Task 2 sekitar 80–120 kata, cukup untuk mengembangkan satu ide.'),
      mcq(7, 'What is the controlling idea in "Regular exercise at school can improve students\' academic performance"?', ['can improve students\' academic performance', 'Regular exercise', 'at school', 'Students'], 'can improve students\' academic performance', 'Controlling idea adalah arah/pendapat yang membatasi isi paragraf.'),
      mcq(8, 'Why is "Why is education important?" a poor topic sentence?', ['It is a question, not a statement of the main idea', 'It is too long', 'It has a mistake in grammar', 'It uses a difficult word'], 'It is a question, not a statement of the main idea', 'Topic sentence sebaiknya pernyataan yang menyatakan ide utama.'),
      mcq(9, 'Choose the best reference word: "Many students lack sleep. ___ affects their grades."', ['This', 'These', 'Those', 'They'], 'This', '"This" merujuk pada seluruh ide sebelumnya (kurang tidur) dan diikuti kata kerja tunggal.'),
      mcq(10, 'Which sentence is an EXPLANATION?', ['This is because physical activity increases blood flow to the brain.', 'For instance, a student who plays football feels alert.', 'Therefore, schools should include daily exercise.', 'Regular exercise improves performance.'], 'This is because physical activity increases blood flow to the brain.', 'Explanation menjawab "mengapa" dan biasanya memakai this is because, which means, dan sejenisnya.'),
      fill(11, 'Lengkapi: For ___, a student who plays football before class often feels more alert.', ['instance', 'example'], 'For instance dan for example memperkenalkan contoh.'),
      fill(12, 'Lengkapi penghubung link: ___, schools should include daily exercise in the timetable.', ['Therefore', 'Consequently', 'Thus'], 'Therefore, consequently, dan thus menutup paragraf dengan akibat/kesimpulan.'),
      fill(13, 'Lengkapi: Public transport is cheap ___ many passengers share one vehicle. (because / although)', ['because', 'since', 'as'], 'Because/since/as menyatakan alasan (explanation).'),
      fill(14, 'Lengkapi dengan kata rujukan: Many young people lack sleep. ___ can affect their health. (This / These)', ['This'], '"This" merujuk pada ide sebelumnya (kurang tidur).'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun kalimat menjadi paragraf TEEL yang benar.',
        explanation_id: 'Urutan: topic sentence, explanation, example, link.',
        segments: [
          'Public transport offers significant benefits.',
          'Because many passengers share one vehicle, the cost per person is low.',
          'For example, a worker who takes the bus saves money on fuel.',
          'Therefore, governments should invest in it.',
        ],
      }),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi topic sentence yang benar.',
        explanation_id: 'Pola: One key advantage of X is that + klausa.',
        segments: ['One key advantage of', 'online learning is that', 'it offers', 'flexibility.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (kesepakatan subjek-kata kerja).',
        explanation_id: '"Public transport" tunggal (uncountable), sehingga memakai "is".',
        tokens: ['Public', 'transport', 'are', 'cheap', 'for', 'many', 'people.'],
        correct_answers: [2],
      }),
      g(18, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kalimat dengan fungsinya dalam paragraf.',
        explanation_id: 'Kalimat pertama = topic sentence; "This is because" = explanation; "For instance" = example; "Therefore" = link.',
        points: 4,
        matching: {
          left: [
            'Regular exercise at school can improve academic performance.',
            'This is because physical activity increases blood flow to the brain.',
            'For instance, a student who plays football feels more alert.',
            'Therefore, schools should offer daily exercise.',
          ],
          right: ['Topic sentence', 'Explanation', 'Example', 'Link', 'Counter-argument'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2, 3],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA topic sentence yang baik.',
        explanation_id: 'Topic sentence yang baik fokus dan memuat controlling idea. "Education is important" terlalu luas; kalimat tentang Medan terlalu sempit.',
        points: 2,
        options: [
          'Education is important.',
          'Free education can reduce inequality by giving poor students equal opportunities.',
          'Some schools in Medan provide free textbooks in grade 3.',
          'Online learning offers flexibility that traditional classes cannot match.',
        ],
        correct_answers: [
          'Free education can reduce inequality by giving poor students equal opportunities.',
          'Online learning offers flexibility that traditional classes cannot match.',
        ],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA hal yang sebaiknya DIHINDARI dalam paragraf akademik.',
        explanation_id: 'Statistik karangan dan daftar ide satu kalimat melemahkan paragraf. Contoh spesifik dan link justru dianjurkan.',
        points: 2,
        options: ['Invented statistics such as "87% of people..."', 'A specific example', 'A list of one-sentence ideas with no explanation', 'A link to the thesis'],
        correct_answers: ['Invented statistics such as "87% of people..."', 'A list of one-sentence ideas with no explanation'],
      }),
    ],
  },
};

export default sub;
