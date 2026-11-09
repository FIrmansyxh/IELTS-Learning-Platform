const P = 'Q-SP342-';
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
    sub_module_title: 'Part 2 (Cue Card): Strategi Mencatat 1 Menit & Berbicara 2 Menit Penuh',
  },
  mini_task: {
    task_type: 'AI_SHORT_SPEAKING',
    prompt:
      'Cue card:\nDescribe a place you have visited that you would like to visit again.\nYou should say:\n- where it is\n- when you went there\n- what you did there\nand explain why you would like to go back.\n\nLangkah: (1) siapkan catatan kata kunci selama 1 menit, (2) berbicara dalam bahasa Inggris selama 1,5 sampai 2 menit tanpa membaca naskah. Gunakan struktur: pembuka, detail tiga poin, alasan (explain why), penutup. Sertakan minimal satu detail indra atau perasaan, satu kalimat dengan relative clause atau past continuous, dan penghubung natural.',
    ai_rubric_criteria:
      'Fluency and Coherence: bicara 1,5 sampai 2 menit tanpa jeda panjang, struktur jelas (pembuka, detail, alasan, penutup), keempat poin kartu dijawab termasuk explain why, penghubung natural. Lexical Resource: kosakata deskriptif tepat dan bervariasi, parafrase. Grammatical Range and Accuracy: tense konsisten (past untuk kunjungan, present untuk deskripsi tempat), ada struktur kompleks (relative clause, past continuous). Pronunciation: bunyi akhir terdengar, tekanan kata dan intonasi wajar. Durasi kurang dari 60 detik membatasi Fluency.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'How much preparation time do you get in Speaking Part 2?', ['1 minute', '30 seconds', '3 minutes', 'No preparation time'], '1 minute', 'Part 2 memberi 1 menit persiapan dengan kertas dan pensil.'),
      mcq(2, 'How long should you aim to speak in Part 2?', ['1 to 2 minutes', '20 seconds', '5 minutes', '30 seconds'], '1 to 2 minutes', 'Kamu berbicara 1–2 menit; penguji menghentikan setelah 2 menit.'),
      mcq(3, 'What should you write in your 1-minute notes?', ['Full sentences', 'Key words for each bullet point', 'Only the topic title', 'A memorised script'], 'Key words for each bullet point', 'Catatan efektif berisi kata kunci (1–3 kata) untuk tiap poin, bukan kalimat lengkap.'),
      mcq(4, 'Which part of the cue card is most often skipped by candidates?', ['"and explain why..."', 'The first bullet point', 'The topic title', 'The word "Describe"'], '"and explain why..."', 'Poin terakhir (explain why) sering terlewat, padahal menuntut alasan dan pendapat.'),
      mcq(5, 'You finish your main points after only 50 seconds and the examiner has not stopped you. What should you do?', ['Stop and wait', 'Add a sensory detail, a feeling or a comparison', 'Repeat the first sentence', 'Ask the examiner a question'], 'Add a sensory detail, a feeling or a comparison', 'Detail indra, perasaan, perbandingan, atau dampak adalah cara alami untuk memperpanjang jawaban.'),
      mcq(6, 'The cue card is "Describe a memorable event." Which tense will you mainly use?', ['Past Simple', 'Present Simple', 'Future Simple', 'Present Perfect'], 'Past Simple', 'Kejadian yang sudah berlalu diceritakan dengan Past Simple (dan Past Continuous untuk latar).'),
      mcq(7, 'What happens after the 2-minute talk?', ['The test ends', 'The examiner asks one or two short follow-up questions', 'You start Part 1 again', 'You write a summary'], 'The examiner asks one or two short follow-up questions', 'Penguji mengajukan 1–2 pertanyaan singkat (rounding off) sebelum Part 3.'),
      mcq(8, 'Which opening sentence is the best way to begin?', ['I don\'t know what to say.', 'I\'d like to talk about cooking, which is a skill I picked up when I was fifteen.', 'Cooking.', 'Please repeat the card.'], 'I\'d like to talk about cooking, which is a skill I picked up when I was fifteen.', 'Pembuka yang baik langsung menyebut topik dan memberi sedikit konteks.'),
      mcq(9, 'The examiner stops you at exactly two minutes. What does this mean?', ['You made a mistake', 'This is normal; stop calmly and answer the follow-up', 'You failed', 'You should repeat the answer'], 'This is normal; stop calmly and answer the follow-up', 'Penguji selalu menghentikan setelah 2 menit; itu normal.'),
      mcq(10, 'Which sentence best adds a feeling?', ['I went there in 2022.', 'I felt really proud when everyone finished the meal.', 'The place is in the south.', 'It takes three hours by car.'], 'I felt really proud when everyone finished the meal.', 'Ungkapan perasaan menambah kedalaman cerita.'),
      fill(11, 'Lengkapi pembuka: I\'d ___ to talk about my hometown.', ['like', 'love'], '"I\'d like to talk about..." adalah pembuka standar Part 2.'),
      fill(12, 'Lengkapi: ___ back, I think that trip was a turning point in my life.', ['Looking', 'looking'], '"Looking back" dipakai untuk refleksi di akhir jawaban.'),
      fill(13, 'Lengkapi: ___ for the food, it was delicious.', ['As', 'as'], '"As for..." beralih ke poin berikutnya.'),
      fill(14, 'Lengkapi dengan bentuk lampau dari "teach": My mother ___ me how to cook when I was fifteen.', ['taught'], 'Past Simple dari teach adalah taught.'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat pembuka Part 2 yang benar.',
        explanation_id: 'Pola pembuka: I\'d like to talk about + topik, which + detail.',
        segments: ['I\'d like to talk about', 'a trip to Bali,', 'which I took', 'with my family last year.'],
      }),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat alasan yang benar.',
        explanation_id: 'Pola: The main reason is that + klausa.',
        segments: ['The main reason', 'is that', 'it taught me', 'patience.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah dalam kalimat seorang kandidat.',
        explanation_id: 'Kejadian lampau memakai Past Simple: "went", bukan "go".',
        tokens: ['Last', 'year', 'I', 'go', 'to', 'Bali', 'with', 'my', 'family.'],
        correct_answers: [3],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah dalam kalimat seorang kandidat.',
        explanation_id: '"Very" tidak dipakai langsung sebelum kata kerja. Yang benar: "I really enjoyed the trip" atau "I enjoyed the trip very much".',
        tokens: ['I', 'very', 'enjoyed', 'the', 'trip.'],
        correct_answers: [1],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan teknik dengan contoh kalimatnya.',
        explanation_id: 'Detail indra: "smelled of garlic". Perasaan: "felt proud". Perbandingan: "Unlike eating out".',
        points: 3,
        matching: {
          left: ['sensory detail', 'feeling', 'comparison'],
          right: [
            'The kitchen smelled of garlic and fried rice.',
            'I felt proud when everyone finished the meal.',
            'Unlike eating out, I know exactly what goes into my food.',
            'It takes three hours by car.',
          ],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA kebiasaan yang baik dalam persiapan 1 menit.',
        explanation_id: 'Kata kunci dan satu baris per poin kartu adalah kebiasaan yang efektif. Menulis kalimat lengkap atau menghafal naskah membuang waktu.',
        points: 2,
        options: ['Write key words for each bullet point', 'Write full sentences for the whole answer', 'Plan an opening sentence', 'Memorise a script from the internet'],
        correct_answers: ['Write key words for each bullet point', 'Plan an opening sentence'],
      }),
    ],
  },
};

export default sub;
