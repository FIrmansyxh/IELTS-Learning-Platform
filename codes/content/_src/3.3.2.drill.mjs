const P = 'Q-WR332-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'WRITING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 3,
    module_code: '3.3',
    module_category: 'WRITING',
    sub_module_title: 'Task 2 Essay: Kerangka 4 Paragraf untuk Opinion, Discussion, Problem-Solution, Two-Part Questions',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Soal: "Some people think that public libraries are no longer necessary because of the internet. To what extent do you agree or disagree?"\n\nTulis DUA paragraf dalam bahasa Inggris (sekitar 130 sampai 160 kata total):\n1. Introduction (2 sampai 3 kalimat): parafrase soal (jangan menyalin) dan nyatakan posisimu dengan jelas.\n2. SATU paragraf badan memakai kerangka PEEL: Point (kalimat topik), Explanation, Example, Link.\n\nGunakan register formal (tanpa singkatan), minimal dua penghubung berbeda (mis. Firstly, For example, Therefore, However), dan satu kalimat kompleks (although / which / if).',
    ai_rubric_criteria:
      'Task Response: posisi jelas di introduction dan konsisten di paragraf badan; paragraf badan mengembangkan satu ide utama dengan penjelasan dan contoh (PEEL). Coherence and Cohesion: topic sentence jelas, penghubung bervariasi tidak mekanis, link kembali ke thesis. Lexical Resource: parafrase introduction memakai sinonim, kolokasi formal. Grammatical Range and Accuracy: ada kalimat kompleks yang akurat, kesalahan tidak mengganggu makna, register formal tanpa singkatan.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'How long should you spend on Writing Task 2, and how many words are required?', ['40 minutes, at least 250 words', '20 minutes, at least 150 words', '40 minutes, at least 150 words', '60 minutes, at least 300 words'], '40 minutes, at least 250 words', 'Task 2: sekitar 40 menit dan minimal 250 kata. Task 1: 20 menit dan 150 kata.'),
      mcq(2, 'Task 2 accounts for what share of the Writing score?', ['One third', 'One half', 'Two thirds', 'The same as Task 1'], 'Two thirds', 'Task 2 bernilai dua kali lipat Task 1, atau dua pertiga skor Writing.'),
      mcq(3, 'The question says: "Discuss both views and give your opinion." How many tasks must you answer?', ['Three (view 1, view 2, your opinion)', 'One', 'Two', 'Four'], 'Three (view 1, view 2, your opinion)', 'Soal discussion memuat tiga tugas: pandangan pertama, pandangan kedua, dan opinimu.'),
      mcq(4, 'What does PEEL stand for?', ['Point, Explanation, Example, Link', 'Plan, Evidence, Essay, Link', 'Paragraph, Example, Edit, Learn', 'Point, Emphasis, Evaluate, List'], 'Point, Explanation, Example, Link', 'PEEL: Point (topic sentence), Explanation, Example, Link ke soal/thesis.'),
      mcq(5, 'Which is the BEST introduction for a Task 2 essay?', ['I will write about this topic.', 'Many people think children spend too much time on screens. (copied from the question)', 'It is widely believed that young people spend excessive time on electronic devices; this essay will argue that parents should limit it.', 'Screens are bad. Everyone knows this.'], 'It is widely believed that young people spend excessive time on electronic devices; this essay will argue that parents should limit it.', 'Introduction yang baik memarafrase soal dan menyatakan posisi. Menyalin soal atau terlalu singkat tidak efektif.'),
      mcq(6, 'What should the conclusion contain?', ['A new idea that was not in the essay', 'A restatement of the position and a summary of the main reasons', 'A long example', 'Only a question'], 'A restatement of the position and a summary of the main reasons', 'Conclusion merangkum dan mengulang posisi; tidak memperkenalkan ide baru.'),
      mcq(7, 'Which essay type needs a paragraph about CAUSES and another about SOLUTIONS?', ['Opinion', 'Problem-solution', 'Discussion', 'Two-part'], 'Problem-solution', 'Problem-solution menuntut penyebab/masalah dan solusi.'),
      mcq(8, 'Which sentence is the best TOPIC sentence for a body paragraph?', ['Firstly, excessive screen time can harm children\'s health.', 'I will now write about screens.', 'Another thing.', 'There are many things to say.'], 'Firstly, excessive screen time can harm children\'s health.', 'Topic sentence menyatakan ide utama paragraf secara jelas.'),
      mcq(9, 'Which statement uses appropriate HEDGING?', ['Everyone knows that homework is useless.', 'Homework can be useful, although it may cause stress.', 'Homework is always bad for all students.', 'Nobody likes homework.'], 'Homework can be useful, although it may cause stress.', 'Hedging memakai can, may, tend to, often. Kata mutlak (everyone, always, nobody) mudah dibantah.'),
      mcq(10, 'What is the most serious problem with memorising a whole template essay?', ['It may not answer the question and examiners can recognise it', 'It is too long', 'It uses formal English', 'It saves too much time'], 'It may not answer the question and examiners can recognise it', 'Esai hafalan sering off-topic dan dikenali penguji sehingga skor dikurangi.'),
      fill(11, 'Lengkapi: ___ it is true that early learning is helpful, it requires well-trained teachers. (While / Because)', ['While', 'while'], '"While it is true that..." adalah pola konsesi formal yang berguna di esai: mengakui satu sisi sebelum menyampaikan argumen utama.'),
      fill(12, 'Lengkapi: In ___, I firmly believe that the benefits outweigh the costs.', ['conclusion'], 'In conclusion dipakai untuk menutup esai.'),
      fill(13, 'Lengkapi contoh: ___ instance, a student who studies abroad often becomes more independent.', ['For'], 'For instance / For example memperkenalkan contoh.'),
      fill(14, 'Lengkapi: ___ a result, fewer people drove to work.', ['As'], 'As a result menyatakan akibat.'),
      fill(15, 'Lengkapi: ___ the other hand, public transport is cheaper.', ['On', 'on'], 'Frasa tetap: On the other hand.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat topik yang jelas.',
        explanation_id: 'Topic sentence: penghubung + ide utama + akibat.',
        segments: ['Firstly,', 'early language learning', 'brings long-term', 'academic benefits.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang membuat kalimat kurang tepat untuk esai akademik.',
        explanation_id: 'Kata mutlak "everyone" dan "always" mudah dibantah; gunakan hedging seperti "many people" dan "often".',
        tokens: ['Everyone', 'knows', 'that', 'technology', 'is', 'always', 'good.'],
        correct_answers: [0, 5],
      }),
      g(18, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan jenis soal dengan tugas utamanya.',
        explanation_id: 'Opinion = posisi (setuju/tidak); discussion = dua pandangan + opini; problem-solution = penyebab dan solusi.',
        points: 3,
        matching: {
          left: ['Opinion', 'Discussion', 'Problem-solution'],
          right: ['pertahankan satu posisi', 'bahas kedua pandangan dan beri opini', 'jelaskan penyebab dan solusi', 'jelaskan grafik'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA hal yang termasuk kerangka PEEL.',
        explanation_id: 'PEEL terdiri dari Point, Explanation, Example, dan Link.',
        points: 3,
        options: ['Point', 'Explanation', 'Example', 'Opinion that contradicts the thesis'],
        correct_answers: ['Point', 'Explanation', 'Example'],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kesalahan yang sebaiknya dihindari di Task 2.',
        explanation_id: 'Menyalin soal, menjawab hanya satu bagian, dan menambah ide baru di kesimpulan sama-sama merugikan.',
        points: 3,
        options: ['Copying the question as the introduction', 'Answering only one part of a two-part question', 'Adding a new idea in the conclusion', 'Giving an example to support an idea'],
        correct_answers: ['Copying the question as the introduction', 'Answering only one part of a two-part question', 'Adding a new idea in the conclusion'],
      }),
    ],
  },
};

export default sub;
