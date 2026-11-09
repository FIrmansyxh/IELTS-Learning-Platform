const P = 'Q-VC412-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'VOCAB', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 4,
    module_code: '4.1',
    module_category: 'VOCAB',
    sub_module_title: 'Eliminasi Kosakata B1/B2 Repetitif menuju Kosakata Presisi Level C1',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis ulang paragraf berikut dalam bahasa Inggris (110 sampai 140 kata) dengan mengganti kata B1/B2 yang berulang dengan padanan yang lebih presisi dan natural. Pertahankan makna.\n\nParagraf asli: "Technology is very good for education. It helps students get a lot of information. Many people think it is very important for the future. But there is also a big problem: students use phones too much, and this is very bad for their health. The government should do something about this thing."\n\nWajib: ganti minimal 8 kata/frasa (good, very important, get, a lot of, think, big problem, very bad, do something, thing); pakai minimal 3 kolokasi (mis. play a crucial role, pose a serious threat, take measures); jaga register formal; jangan memaksakan kata yang tidak kamu yakini.',
    ai_rubric_criteria:
      'Lexical Resource: padanan presisi tepat makna dan kolokasi (beneficial/effective, obtain/access, substantial amount, argue/maintain, major challenge, detrimental, take measures, issue/matter); tidak ada pengganti yang salah kolokasi atau berbeda makna; variasi tanpa berlebihan. Grammar: kalimat akurat dan bervariasi. Task Achievement: makna paragraf asli dipertahankan dan paragraf tetap koheren. Register formal konsisten.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which word is the best replacement for "very important" in a formal essay?', ['crucial', 'big', 'nice', 'normal'], 'crucial', '"Crucial" (juga vital atau essential) menggantikan "very important" dengan satu kata presisi.'),
      mcq(2, 'Which word best replaces "get" in "Students get qualifications"?', ['obtain', 'catch', 'grab', 'take off'], 'obtain', '"Obtain" atau "acquire" adalah pengganti formal untuk get qualifications.'),
      mcq(3, 'Which replacement for "a lot of" is correct with an UNCOUNTABLE noun?', ['a great deal of', 'a large number of', 'numerous', 'many'], 'a great deal of', 'Untuk noun tak terhitung gunakan a great deal of; numerous dan a large number of dipakai dengan countable jamak.'),
      mcq(4, 'Which sentence is MORE precise?', ['Pollution is very bad for health.', 'Pollution is detrimental to health.', 'Pollution is a bad thing for health.', 'Pollution is bad for health a lot.'], 'Pollution is detrimental to health.', '"Detrimental" menggantikan very bad dengan satu kata presisi dan kolokasi benar (detrimental to).'),
      mcq(5, 'Which phrase is the best replacement for "do something about the problem"?', ['take measures to address the issue', 'make something for the problem', 'do the thing about it', 'give a do to the problem'], 'take measures to address the issue', 'Kolokasi formal: take measures dan address an issue.'),
      mcq(6, '"Get tired" can be replaced by...', ['become exhausted', 'obtain tired', 'receive tired', 'acquire tired'], 'become exhausted', 'Get dalam get tired berarti become; obtain, receive, atau acquire tidak punya kolokasi itu.'),
      mcq(7, 'Which replacement for "very big" fits a formal essay?', ['considerable', 'giant-sized', 'big-big', 'massive-ish'], 'considerable', 'Considerable (atau substantial/significant) adalah pengganti formal untuk very big.'),
      mcq(8, 'Which adverb collocates naturally with "unlikely"?', ['highly', 'greatly', 'bigly', 'strongly'], 'highly', 'Kolokasi: highly unlikely, highly effective, highly controversial.'),
      mcq(9, 'Which verb is the best replacement for "show" in: "The data ___ a clear trend."?', ['reveals', 'does', 'gives out', 'makes'], 'reveals', 'Reveal, indicate, dan demonstrate adalah pengganti formal untuk show dalam konteks data.'),
      mcq(10, 'What is the main risk of replacing every simple word with a difficult word?', ['The writing sounds forced and may contain wrong collocations', 'The essay becomes too short', 'The grammar always improves', 'The examiner gives extra marks'], 'The writing sounds forced and may contain wrong collocations', 'Mengganti semua kata terasa dipaksakan dan sering memuat kolokasi atau nuansa yang salah.'),
      fill(11, 'Ganti "people" dengan kata yang lebih spesifik dalam konteks belanja: ___ prefer cheaper brands.', ['consumers', 'Consumers', 'shoppers'], 'Dalam konteks belanja, consumers atau shoppers lebih spesifik daripada people.'),
      fill(12, 'Lengkapi dengan kata kerja formal yang tepat: Students ___ practical skills during the course.', ['acquire', 'obtain', 'gain', 'develop'], 'Acquire, obtain, gain, atau develop cocok untuk skills; get terlalu umum.'),
      fill(13, 'Lengkapi dengan kata yang lebih presisi untuk "big problem": a major ___ for cities.', ['challenge', 'problem', 'issue', 'concern'], 'Challenge, issue, atau concern adalah pengganti problem yang lebih presisi dalam esai.'),
      fill(14, 'Lengkapi dengan intensifier natural: The two proposals are ___ different.', ['entirely', 'completely', 'totally', 'very', 'quite'], 'Entirely atau completely adalah intensifier natural dengan different.'),
      fill(15, 'Lengkapi dengan "increase" yang lebih tajam: Prices ___ last year. (naik tajam)', ['surged', 'soared', 'rocketed', 'jumped'], 'Surge dan soar menyatakan kenaikan tajam.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat presisi yang benar.',
        explanation_id: 'Pola: subjek + enables + objek + to + obtain + noun.',
        segments: ['Technology', 'enables students', 'to obtain', 'information quickly.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (kolokasi).',
        explanation_id: '"A giant problem" tidak natural; kolokasi yang benar adalah a major/serious problem.',
        tokens: ['This', 'is', 'a', 'giant', 'problem', 'for', 'cities.'],
        correct_answers: [3],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (countable vs uncountable).',
        explanation_id: '"People" countable jamak, jadi "a large number of people". "A huge amount of people" tidak tepat.',
        tokens: ['A', 'huge', 'amount', 'of', 'people', 'use', 'phones.'],
        correct_answers: [2],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kata umum dengan pengganti yang lebih presisi.',
        explanation_id: 'Very important = crucial; very bad = detrimental; a lot of (countable) = numerous.',
        points: 3,
        matching: {
          left: ['very important', 'very bad', 'a lot of (countable)'],
          right: ['crucial', 'detrimental', 'numerous', 'a thing'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA langkah yang baik saat mengganti kata umum.',
        explanation_id: 'Memeriksa kolokasi dan memastikan kamu yakin artinya adalah langkah penting. Mengganti semua kata atau memakai kata yang tidak dipahami merugikan.',
        points: 2,
        options: ['Check the collocation in a dictionary', 'Use only words you are sure about', 'Replace every word with the most difficult one', 'Ignore the register'],
        correct_answers: ['Check the collocation in a dictionary', 'Use only words you are sure about'],
      }),
    ],
  },
};

export default sub;
