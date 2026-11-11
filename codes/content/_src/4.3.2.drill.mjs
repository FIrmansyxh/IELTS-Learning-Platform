const P = 'Q-SP432-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'SPEAKING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 4,
    module_code: '4.3',
    module_category: 'READING',
    sub_module_title: 'Latihan Shadowing, Intonasi Natural, & Idiomatic Expressions untuk Speaking Band 7.0+',
  },
  mini_task: {
    task_type: 'AI_SHORT_SPEAKING',
    prompt:
      'Rekam dirimu dalam bahasa Inggris (total sekitar 90 detik):\n1. Shadowing (30 detik): pilih satu klip 20 sampai 30 detik dari wawancara atau podcast dengan transkrip, lalu ucapkan ulang kalimatnya dengan menirukan ritme dan intonasi (tanpa melihat transkrip pada pengulangan terakhir).\n2. Jawaban bebas (60 detik): "Do you think it is important to learn from your mistakes? Why?" Jawab dengan thought groups yang jelas, intonasi bervariasi, dan SATU sampai TIGA ungkapan natural/idiomatis yang kamu yakini artinya (mis. to be honest, a blessing in disguise, at the end of the day, in the long run).\n\nTekankan kata isi, lemahkan kata fungsi, dan jangan menghafal naskah.',
    ai_rubric_criteria:
      'Pronunciation: tekanan kata isi dan pelemahan kata fungsi, intonasi bervariasi (turun pada pernyataan, naik pada pertanyaan yes/no), thought groups dengan jeda wajar, bunyi akhir terdengar. Fluency and Coherence: lancar, tidak menghafal, ide berkembang dengan alasan dan contoh. Lexical Resource: 1 sampai 3 ungkapan natural atau idiomatis yang tepat makna dan bentuknya, tanpa idiom yang dipaksakan. Grammatical Range and Accuracy: variasi struktur dan akurasi.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'What is shadowing?', ['Repeating what a native speaker says almost at the same time, copying rhythm and intonation', 'Writing down everything you hear', 'Translating a speech into Indonesian', 'Memorising a long answer'], 'Repeating what a native speaker says almost at the same time, copying rhythm and intonation', 'Shadowing = menirukan pembicara native hampir bersamaan untuk melatih ritme dan intonasi.'),
      mcq(2, 'Which words are usually stressed in a sentence?', ['Content words (nouns, main verbs, adjectives, adverbs)', 'Articles and prepositions', 'Only the first word', 'Every word equally'], 'Content words (nouns, main verbs, adjectives, adverbs)', 'Kata isi ditekan; kata fungsi (a, the, of, to) dilemahkan.'),
      mcq(3, 'What intonation do yes/no questions usually have?', ['Rising', 'Falling', 'Flat', 'Falling then flat'], 'Rising', 'Pertanyaan yes/no biasanya naik di akhir.'),
      mcq(4, 'What is a thought group?', ['A short chunk of words (about 3-7) with one main stress, separated by short pauses', 'A list of idioms', 'A group of students', 'A long sentence without any pause'], 'A short chunk of words (about 3-7) with one main stress, separated by short pauses', 'Thought group = kelompok kata bermakna dengan satu tekanan utama dan jeda singkat.'),
      mcq(5, 'What does "a piece of cake" mean?', ['very easy', 'very expensive', 'very tired', 'very rare'], 'very easy', '"A piece of cake" = sangat mudah.'),
      mcq(6, 'What does "once in a blue moon" mean?', ['very rarely', 'every month', 'at night', 'very quickly'], 'very rarely', '"Once in a blue moon" = sangat jarang.'),
      mcq(7, 'Which idiom is used correctly?', ['The phone cost an arm and a leg.', 'The phone cost a hand and a foot.', 'The phone cost a piece of cake.', 'The phone cost under the weather.'], 'The phone cost an arm and a leg.', 'Bentuk tetap: cost an arm and a leg (= sangat mahal).'),
      mcq(8, 'What is the best way to use idioms in the Speaking test?', ['Use one to three that you are sure about, naturally', 'Use one in every sentence', 'Avoid all natural expressions', 'Change the words to make them original'], 'Use one to three that you are sure about, naturally', 'Idiom dipakai hemat, tepat, dan natural; bentuknya tidak boleh diubah.'),
      mcq(9, 'In connected speech, "an apple" is usually pronounced like...', ['a-napple (the sounds link)', 'an... apple (with a long pause)', 'a apple', 'on apple'], 'a-napple (the sounds link)', 'Linking: konsonan akhir /n/ tersambung ke vokal berikutnya.'),
      mcq(10, 'Which phrase gives you thinking time naturally?', ['Well, let me think...', 'Ummm ummm ummm...', 'I don\'t know. Next.', 'Pass.'], 'Well, let me think...', 'Frasa pengisi seperti "Well, let me think" lebih natural daripada hesitasi berlebihan.'),
      fill(11, 'Lengkapi idiom: At the end of the ___, it is your decision. (hari)', ['day'], 'Idiom: at the end of the day (= pada akhirnya).'),
      fill(12, 'Lengkapi idiom: Losing the job was a ___ in disguise. (berkah)', ['blessing'], 'Idiom: a blessing in disguise (= berkah tersembunyi).'),
      fill(13, 'Lengkapi: I eat out once in a ___ moon. (warna)', ['blue'], 'Idiom: once in a blue moon.'),
      fill(14, 'Lengkapi: The weak vowel sound found in many unstressed syllables is called the ___.', ['schwa'], 'Bunyi vokal lemah yang paling umum di suku kata tanpa tekanan disebut schwa /ə/.'),
      fill(15, 'Lengkapi: Content words are stressed, and function words are ___. (lawan dari ditekan)', ['weak', 'weakened', 'unstressed', 'reduced'], 'Kata fungsi dilemahkan: weak/unstressed.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi langkah shadowing yang benar.',
        explanation_id: 'Dengarkan, baca transkrip dan tandai, tiru per kalimat, lalu rekam dan bandingkan.',
        segments: ['Listen to the clip,', 'mark the stress in the transcript,', 'repeat sentence by sentence,', 'then record and compare.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (bentuk idiom).',
        explanation_id: 'Bentuk idiom tetap: a piece of cake, bukan a piece of the cake.',
        tokens: ['The', 'exam', 'was', 'a', 'piece', 'of', 'the', 'cake.'],
        correct_answers: [6],
      }),
      g(18, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan idiom dengan artinya.',
        explanation_id: 'On cloud nine = sangat senang; under the weather = kurang sehat; in the long run = untuk jangka panjang.',
        points: 3,
        matching: {
          left: ['on cloud nine', 'under the weather', 'in the long run'],
          right: ['very happy', 'slightly ill', 'over a long period of time', 'very expensive'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA hal yang membantu bicara terdengar natural.',
        explanation_id: 'Thought groups dengan jeda wajar dan intonasi bervariasi membuat bicara jelas dan ekspresif. Intonasi datar dan menekankan semua kata merugikan.',
        points: 2,
        options: ['Speak in thought groups with short pauses', 'Vary your intonation', 'Stress every word equally', 'Keep a flat intonation'],
        correct_answers: ['Speak in thought groups with short pauses', 'Vary your intonation'],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA kesalahan yang sebaiknya dihindari saat memakai idiom.',
        explanation_id: 'Mengubah bentuk idiom dan memakai idiom di setiap kalimat terdengar tidak natural dan dipaksakan.',
        points: 2,
        options: ['Changing the words of the idiom', 'Using an idiom in every sentence', 'Using one idiom you are sure about', 'Choosing an idiom that fits the topic'],
        correct_answers: ['Changing the words of the idiom', 'Using an idiom in every sentence'],
      }),
      mcq(21, 'What intonation does a statement such as "I live in Bandung." usually have?', ['Falling', 'Rising', 'Flat', 'Rising, then rising again'], 'Falling', 'Pernyataan (dan pertanyaan WH) biasanya memakai intonasi turun di akhir.'),
      mcq(22, 'How does intonation usually move in a list such as "apples, bananas and oranges"?', ['It rises on each item and falls on the last one', 'It falls on every item', 'It rises on every item, including the last', 'It stays flat throughout'], 'It rises on each item and falls on the last one', 'Pola daftar: naik, naik, lalu turun pada butir terakhir.'),
      mcq(23, 'In fast speech, "next day" often sounds like "nex day". What is this feature called?', ['elision', 'linking', 'intrusion', 'contraction'], 'elision', 'Elision = bunyi hilang, misalnya /t/ pada "next day".'),
      mcq(24, 'English is a "stress-timed" language. What does this mean?', ['Stressed syllables come at roughly regular intervals, so unstressed syllables are said quickly', 'Every syllable is given the same length', 'Only the last word of a sentence is stressed', 'Speakers must pause after every word'], 'Stressed syllables come at roughly regular intervals, so unstressed syllables are said quickly', 'Stress-timed: jarak antar suku kata yang ditekan kurang lebih sama, sehingga suku kata lain dipercepat dan dilemahkan.'),
      mcq(25, 'During the test you forget the word "scissors". What is the best thing to do?', ['Paraphrase it, for example "a tool you use to cut paper", and carry on', 'Stop and stay silent until you remember', 'Say the word in Indonesian', 'Ask the examiner for the word'], 'Paraphrase it, for example "a tool you use to cut paper", and carry on', 'Saat lupa kata, parafrase lalu lanjut; jeda panjang mencari kata sempurna merugikan kelancaran.'),
      fill(26, 'Lengkapi idiom: You hit the ___ on the head. (tepat sasaran)', ['nail'], 'Idiom: hit the nail on the head (= tepat sasaran).'),
      fill(27, 'Lengkapi idiom: The job was hard at first, but I am getting the ___ of it. (mulai terbiasa)', ['hang'], 'Idiom: get the hang of it (= mulai terbiasa).'),
      g(28, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun thought groups berikut menjadi jawaban yang natural.',
        explanation_id: 'Pembuka natural (Well, to be honest), lalu pendapat, lalu alasan dengan "mainly because".',
        segments: ['Well, to be honest,', "I'm not a big fan of cities,", 'mainly because', "they're so crowded."],
      }),
      g(29, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (bentuk idiom).',
        explanation_id: 'Bentuk idiom tetap: on cloud nine (= sangat senang), bukan on cloud seven.',
        tokens: ['She', 'was', 'on', 'cloud', 'seven', 'after', 'the', 'interview.'],
        correct_answers: [4],
      }),
      g(30, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan idiom dengan artinya.',
        explanation_id: 'Burn the midnight oil = begadang bekerja; break the bank = menguras uang; learn the ropes = mempelajari dasar.',
        points: 3,
        matching: {
          left: ['burn the midnight oil', 'break the bank', 'learn the ropes'],
          right: ['work or study late into the night', 'cost too much money', 'learn the basics of a new task', 'feel slightly ill'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
    ],
  },
};

export default sub;
