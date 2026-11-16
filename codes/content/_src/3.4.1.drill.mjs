const P = 'Q-SP341-';
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
    sub_module_title: 'Part 1: Menjawab Lugas dengan Rumus Direct Answer + Reason + Short Example',
  },
  mini_task: {
    task_type: 'AI_SHORT_SPEAKING',
    prompt:
      'Jawab tiga pertanyaan Speaking Part 1 berikut secara lisan dalam bahasa Inggris, masing-masing sekitar 20 sampai 30 detik (2 sampai 4 kalimat):\n1. Do you like cooking? Why or why not?\n2. What do you usually do in your free time?\n3. Did you enjoy school when you were a child?\n\nGunakan rumus DRE (Direct answer, Reason, short Example) pada setiap jawaban, tense yang sesuai dengan pertanyaan (present simple untuk 1 dan 2, past simple untuk 3), minimal satu penghubung alami (Well, because, for example, although), dan jangan menjawab dengan satu kata.',
    ai_rubric_criteria:
      'Fluency and Coherence: jawaban langsung, alasan dan contoh tersusun, penghubung alami, jeda wajar, tidak menghafal. Lexical Resource: kosakata tepat dan bervariasi, parafrase saat perlu. Grammatical Range and Accuracy: tense sesuai pertanyaan, kalimat bervariasi, bentuk kata kerja benar (tidak "I am like", tidak "I go" untuk masa lalu). Pronunciation: bunyi akhir (-s, -ed) terdengar, tekanan kata dan intonasi wajar. Setiap jawaban sekitar 20 sampai 30 detik.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'About how long does Speaking Part 1 last?', ['4 to 5 minutes', '1 to 2 minutes', '10 minutes', '15 minutes'], '4 to 5 minutes', 'Part 1 berlangsung sekitar 4–5 menit. Part 2 sekitar 3–4 menit dan Part 3 sekitar 4–5 menit.'),
      mcq(2, 'What does DRE stand for?', ['Direct answer, Reason, Example', 'Detail, Repeat, End', 'Define, Recall, Explain', 'Describe, React, Evaluate'], 'Direct answer, Reason, Example', 'DRE: jawab langsung (Direct answer), beri alasan (Reason), lalu contoh singkat (Example).'),
      mcq(3, 'How long should a typical Part 1 answer be?', ['One word', '2 to 4 sentences', 'Two full minutes', 'As long as possible'], '2 to 4 sentences', 'Jawaban Part 1 ideal 2–4 kalimat (sekitar 15–30 detik). Satu kata terlalu pendek; monolog panjang tidak perlu.'),
      mcq(4, 'Which answer to "Do you like cooking?" is the strongest?', ['Yes.', 'Yes, I do. I cook sometimes.', 'Yes, I really enjoy it because it helps me relax, and last weekend I made a Thai curry for my family.', 'Cooking is a very important activity in all cultures of the world.'], 'Yes, I really enjoy it because it helps me relax, and last weekend I made a Thai curry for my family.', 'Jawaban terkuat langsung, memberi alasan, dan memberi contoh spesifik (DRE).'),
      mcq(5, 'The examiner asks, "What did you do last weekend?" Which tense should you mainly use?', ['Past Simple', 'Present Simple', 'Future Simple', 'Present Perfect Continuous'], 'Past Simple', 'Pertanyaan tentang waktu lampau yang spesifik dijawab dengan Past Simple.'),
      mcq(6, 'The examiner asks, "Have you ever travelled abroad?" Which answer uses the most suitable tense?', ['Yes, I have been to Singapore twice.', 'Yes, I go to Singapore twice.', 'Yes, I am going to Singapore twice.', 'Yes, I will be to Singapore twice.'], 'Yes, I have been to Singapore twice.', 'Pengalaman hidup tanpa waktu spesifik memakai Present Perfect (have been).'),
      mcq(7, 'You forget the English word for "scissors". What is the best thing to do?', ['Stay silent until you remember it', 'Say it in Indonesian', 'Paraphrase: "a tool you use to cut paper"', 'Change the subject'], 'Paraphrase: "a tool you use to cut paper"', 'Parafrase menjaga fluency dan menunjukkan Lexical Resource.'),
      mcq(8, 'Why is memorising a long answer risky?', ['It may not match the question and examiners can recognise it', 'It uses too many difficult words', 'It makes the answer too short', 'It is not allowed by the rules'], 'It may not match the question and examiners can recognise it', 'Jawaban hafalan sering tidak sesuai pertanyaan dan dikenali dari intonasi yang tidak natural.'),
      mcq(9, 'The examiner asks an opinion question and you have no strong opinion. What should you do?', ['Say "I don\'t know" and stop', 'Say you haven\'t thought about it much, then give a simple view with a reason', 'Ask the examiner to choose', 'Change the topic'], 'Say you haven\'t thought about it much, then give a simple view with a reason', 'Tetap jawab: pendapat sederhana dengan alasan lebih baik daripada diam.'),
      mcq(10, 'Which is NOT one of the four Speaking criteria?', ['Spelling accuracy', 'Fluency and Coherence', 'Pronunciation', 'Lexical Resource'], 'Spelling accuracy', 'Empat kriteria: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, dan Pronunciation. Ejaan tidak dinilai di Speaking.'),
      fill(11, 'Lengkapi: Yes, I do. ___ example, I often cook at weekends.', ['For'], '"For example" memperkenalkan contoh pada bagian Example dari DRE.'),
      fill(12, 'Lengkapi: When I was a child, I used to ___ badminton every afternoon.', ['play'], 'Used to + V1 untuk kebiasaan masa lalu.'),
      fill(13, 'Lengkapi: I ___ 20 years old. (am / have)', ['am'], 'Umur dinyatakan dengan be: I am 20 years old, bukan have.'),
      fill(14, 'Lengkapi dengan bentuk lampau dari "go": Yesterday I ___ to the market with my mother.', ['went'], 'Yesterday menandakan masa lalu: Past Simple went.'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi jawaban DRE yang benar.',
        explanation_id: 'Urutan: jawaban langsung, alasan, lalu contoh.',
        segments: ['Yes, I really enjoy it.', 'It helps me relax after work,', 'and last weekend I tried', 'a new Thai recipe.'],
      }),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar.',
        explanation_id: 'Pola: I\'m really into + noun, so + klausa + keterangan waktu.',
        segments: ['I\'m really into', 'badminton,', 'so I usually play', 'on Saturday mornings.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah dalam kalimat seorang kandidat.',
        explanation_id: '"Like" sudah kata kerja, jadi tidak dipakai bersama am. Seharusnya: I like football very much.',
        tokens: ['I', 'am', 'like', 'football', 'very', 'much.'],
        correct_answers: [1],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah dalam kalimat seorang kandidat.',
        explanation_id: 'Yesterday menandakan masa lalu, jadi "went", bukan "go".',
        tokens: ['Yesterday', 'I', 'go', 'to', 'the', 'market.'],
        correct_answers: [2],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan pertanyaan dengan tense jawaban yang paling sesuai.',
        explanation_id: 'Kebiasaan sekarang = Present Simple; "Did you ... ?" = Past Simple; "Have you ever ... ?" = Present Perfect.',
        points: 3,
        matching: {
          left: ['What do you usually do on weekends?', 'Did you enjoy school?', 'Have you ever visited another country?'],
          right: ['Present Simple', 'Past Simple', 'Present Perfect', 'Future Simple'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA cara yang baik untuk memperpanjang jawaban Part 1.',
        explanation_id: 'Menambah alasan dengan because dan contoh singkat adalah inti rumus DRE. Menghafal pidato panjang dan menjawab satu kata tidak dianjurkan.',
        points: 2,
        options: ['Give a reason with because', 'Memorise a long speech', 'Add a short example', 'Answer with one word'],
        correct_answers: ['Give a reason with because', 'Add a short example'],
      }),
      mcq(21, 'Which answer to "Do you prefer cooking at home or eating out?" is the strongest?', ['At home.', 'I prefer cooking at home.', 'I prefer cooking at home because it\'s cheaper and healthier, although I do enjoy eating out occasionally.', 'Eating out is a tradition in many countries around the world.'], 'I prefer cooking at home because it\'s cheaper and healthier, although I do enjoy eating out occasionally.', 'Pola pertanyaan pilihan: pilih satu, beri alasan, lalu akui sisi lainnya. Jawaban terakhir tidak menjawab pertanyaan.'),
      mcq(22, 'The examiner asks, "Are you studying anything at the moment?" Which tense should you mainly use?', ['Present Continuous', 'Past Simple', 'Present Perfect', 'Future Simple'], 'Present Continuous', 'Situasi yang sedang berlangsung sekarang dijawab dengan Present Continuous, misalnya "I\'m taking an English course".'),
      mcq(23, 'What is the examiner assessing in Part 1?', ['Your language, not whether your answers are right or wrong', 'Your general knowledge', 'Whether your opinions are correct', 'How many facts you can remember'], 'Your language, not whether your answers are right or wrong', 'Di Part 1 tidak ada jawaban benar atau salah. Yang dinilai adalah bahasanya, bukan isinya.'),
      mcq(24, 'Which sentence is CORRECT?', ['I was tired, so I stayed at home.', 'Because I was tired, so I stayed at home.', 'Because I tired, I stayed at home.', 'I was tired, because so I stayed at home.'], 'I was tired, so I stayed at home.', 'Because dan so tidak dipakai bersama dalam satu kalimat. Pilih salah satu.'),
      mcq(25, 'Which syllable is stressed in the word "photographer"?', ['phoTOgrapher', 'PHOtographer', 'photoGRApher', 'photograPHER'], 'phoTOgrapher', 'Tekanan kata berpindah: PHOtograph, phoTOgrapher, photoGRAphic.'),
      fill(26, 'Lengkapi: My hobby is ___ badminton. (play / playing)', ['playing'], 'Setelah "My hobby is" dipakai bentuk -ing: playing badminton.'),
      fill(27, 'Lengkapi: I ___ like spicy food. (very / really)', ['really'], '"Very" tidak diletakkan langsung di depan kata kerja. Pakai "I really like" atau "I like it very much".'),
      g(28, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi jawaban yang benar untuk pertanyaan pilihan (A atau B).',
        explanation_id: 'Pola: pilih satu, beri alasan dengan because, lalu akui sisi lain dengan although.',
        segments: ['I prefer walking to work', 'because it clears my mind,', 'although I take the bus', 'when it rains.'],
      }),
      g(29, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah dalam kalimat seorang kandidat.',
        explanation_id: 'Kebiasaan masa lalu memakai "used to" + V1, bukan "use to".',
        tokens: ['When', 'I', 'was', 'a', 'child,', 'I', 'use', 'to', 'play', 'marbles.'],
        correct_answers: [6],
      }),
      g(30, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan situasi saat tes dengan ucapan yang paling tepat.',
        explanation_id: 'Lupa kata: parafrase. Butuh waktu: frasa pengisi yang sopan. Tidak menangkap pertanyaan: minta diulang. Tidak punya pendapat: tetap beri pandangan sederhana.',
        points: 4,
        matching: {
          left: ['You forget the word "scissors"', 'You need a moment to think', 'You did not catch the question', 'You have no strong opinion'],
          right: ['It\'s a thing you use to cut paper.', 'That\'s an interesting question. Let me think...', 'Sorry, could you repeat that, please?', 'I haven\'t thought about it much, but I guess...', 'Yes.'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2, 3],
      }),
    ],
  },
};

export default sub;
