const P = 'Q-SP343-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'SPEAKING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 3,
    module_code: '3.4',
    module_category: 'SPEAKING',
    sub_module_title: 'Part 3: Menjawab Pertanyaan Abstrak & Analitis (Speculating, Comparing, Evaluating)',
  },
  mini_task: {
    task_type: 'AI_SHORT_SPEAKING',
    prompt:
      'Jawab tiga pertanyaan Speaking Part 3 berikut secara lisan dalam bahasa Inggris, masing-masing sekitar 30 sampai 40 detik (3 sampai 6 kalimat):\n1. (Speculating) What would happen if schools had no exams?\n2. (Comparing) How has the way people work changed over the past few decades?\n3. (Evaluating) Is it better to live in a city or in the countryside?\n\nGunakan kerangka ARE-C (Answer, Reason, Example, Consider the other side) pada setiap jawaban. Bicaralah pada tingkat umum (many people, young people), pakai hedging (tend to, might, many), conditional untuk nomor 1, dan perbandingan (compared with, whereas, used to) untuk nomor 2.',
    ai_rubric_criteria:
      'Fluency and Coherence: jawaban 3 sampai 6 kalimat dengan struktur ARE-C, penghubung natural, ide berkembang (tidak berhenti di satu kalimat). Lexical Resource: kosakata abstrak tepat (benefits outweigh, double-edged sword, work-life balance), parafrase. Grammatical Range and Accuracy: conditional (if + past, would) untuk spekulasi, perbandingan (compared with, whereas, used to), hedging; akurasi bentuk kata kerja. Pronunciation: jelas, tekanan kata dan intonasi untuk menunjukkan kontras. Jawaban hanya tentang diri sendiri dan tanpa alasan membatasi skor.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'About how long does Speaking Part 3 last?', ['4 to 5 minutes', '1 to 2 minutes', '10 minutes', '15 minutes'], '4 to 5 minutes', 'Part 3 berlangsung sekitar 4–5 menit setelah Part 2.'),
      mcq(2, 'Part 3 questions are mainly about...', ['abstract ideas, society and trends', 'only your personal daily routine', 'reading a passage aloud', 'describing a picture'], 'abstract ideas, society and trends', 'Part 3 membahas ide umum dan abstrak (masyarakat, tren, generasi), bukan hanya pengalaman pribadi.'),
      mcq(3, 'What does ARE-C stand for?', ['Answer, Reason, Example, Consider the other side', 'Ask, Repeat, Explain, Conclude', 'Argue, Rest, End, Confirm', 'Answer, Repeat, Edit, Close'], 'Answer, Reason, Example, Consider the other side', 'ARE-C: pendapat, alasan, contoh, lalu mempertimbangkan sisi lain.'),
      mcq(4, 'How long should a typical Part 3 answer be?', ['3 to 6 sentences', 'One word', 'One sentence', 'Two full minutes'], '3 to 6 sentences', 'Jawaban Part 3 ideal 3–6 kalimat (sekitar 20–40 detik).'),
      mcq(5, 'Which question is a SPECULATING question?', ['What would happen if schools had no exams?', 'What is your name?', 'Where do you live?', 'Do you like cooking?'], 'What would happen if schools had no exams?', 'Pertanyaan "What would happen if...?" meminta spekulasi dan memakai conditional.'),
      mcq(6, 'Which structure is best for answering a speculating question?', ['If + Past Simple, would + V1', 'If + will, would', 'Present Perfect only', 'Imperative'], 'If + Past Simple, would + V1', 'Second conditional (if + past simple, would + V1) untuk situasi hipotetis.'),
      mcq(7, 'Which sentence uses appropriate hedging?', ['Everyone thinks that technology is bad.', 'Many people think that technology can be harmful if it is overused.', 'Technology is always bad.', 'Nobody likes technology.'], 'Many people think that technology can be harmful if it is overused.', 'Hedging memakai many, can, if; kata mutlak (everyone, always, nobody) mudah dibantah.'),
      mcq(8, 'Which phrase best introduces the "other side" of an argument?', ['That said, ...', 'Because of this, ...', 'For example, ...', 'First of all, ...'], 'That said, ...', '"That said" dan "On the other hand" mengantar pertimbangan sisi lain.'),
      mcq(9, 'The examiner asks about a topic you do not know well. What is the best response?', ['Stay silent', 'Say "I haven\'t thought about it much, but I\'d imagine that..." and give a reasoned view', 'Ask the examiner to change the topic', 'Say "No comment."'], 'Say "I haven\'t thought about it much, but I\'d imagine that..." and give a reasoned view', 'Tetap jawab dengan logika umum; tidak ada jawaban benar atau salah, yang dinilai adalah bahasanya.'),
      mcq(10, 'Which answer is MOST appropriate at Part 3 level?', ['Yes, I think it is good.', 'It depends, but generally I think it is beneficial because it saves time. That said, it can reduce personal contact.', 'My sister has a phone.', 'I do not know.'], 'It depends, but generally I think it is beneficial because it saves time. That said, it can reduce personal contact.', 'Jawaban terkuat: posisi, alasan, dan sisi lain, dengan bahasa hati-hati.'),
      fill(11, 'Lengkapi hedging: Young people ___ to read less than before.', ['tend', 'seem'], '"Tend to" adalah ungkapan hati-hati untuk menyatakan kecenderungan.'),
      fill(12, 'Lengkapi: ___ the one hand, it saves time. On the other hand, it reduces contact.', ['On', 'on'], 'Pola "On the one hand..., on the other hand..." untuk evaluasi dua sisi.'),
      fill(13, 'Lengkapi perbandingan: People ___ to write letters, but these days they send messages.', ['used'], '"Used to + V1" untuk kebiasaan masa lalu yang sudah berubah.'),
      fill(14, 'Lengkapi: If everyone worked from home, cities ___ be much quieter.', ['would', 'could', 'might'], 'Second conditional: If + past simple, would + V1.'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat spekulasi yang benar.',
        explanation_id: 'Pola: If + past simple, would + V1.',
        segments: ['If schools had no exams,', 'students might', 'focus more on', 'real understanding.'],
      }),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat perbandingan yang benar.',
        explanation_id: 'Pola: Compared with + waktu, + klausa dengan kata perbandingan.',
        segments: ['Compared with', 'the past,', 'communication has become', 'much faster.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang membuat kalimat kurang tepat untuk jawaban Part 3.',
        explanation_id: 'Kata mutlak "everyone" dan "always" kurang tepat; gunakan "many people" dan "often".',
        tokens: ['Everyone', 'thinks', 'that', 'technology', 'is', 'always', 'good.'],
        correct_answers: [0, 5],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah dalam kalimat seorang kandidat.',
        explanation_id: 'Agree adalah kata kerja; tidak dipakai bersama am. Seharusnya: I agree with that.',
        tokens: ['I', 'am', 'agree', 'with', 'that.'],
        correct_answers: [1],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan jenis pertanyaan dengan bahasa yang paling sesuai.',
        explanation_id: 'Speculating = conditional/would; comparing = compared with/whereas; evaluating = on the one hand / outweigh.',
        points: 3,
        matching: {
          left: ['What would happen if...?', 'How has... changed?', 'Is it better to...?'],
          right: ['If + past simple, would + V1', 'compared with / used to / whereas', 'on the one hand... on the other hand', 'imperatives'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA hal yang sebaiknya dilakukan di Part 3.',
        explanation_id: 'Bicara pada tingkat umum dan mempertimbangkan sisi lain menunjukkan pemikiran analitis. Jawaban satu kata dan hanya bercerita tentang diri sendiri kurang tepat.',
        points: 2,
        options: ['Talk about people and society in general', 'Answer with one word', 'Consider the other side of an argument', 'Only talk about yourself'],
        correct_answers: ['Talk about people and society in general', 'Consider the other side of an argument'],
      }),
    ],
  },
};

export default sub;
