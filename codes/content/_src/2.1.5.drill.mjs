const P = 'Q-GR215-';
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
    sub_module_title: 'Gerund & To Infinitive (Verb + -ing vs. to + Verb)',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis satu paragraf (sekitar 100 sampai 120 kata) dalam bahasa Inggris tentang satu kebiasaan yang ingin kamu ubah atau satu keterampilan yang sedang kamu pelajari.\n\nParagrafmu wajib memuat:\n- satu kalimat dengan gerund sebagai subjek (mis. "Getting up early is...")\n- dua kata kerja yang diikuti gerund (mis. enjoy, avoid, keep, give up, consider)\n- dua kata kerja yang diikuti to infinitive (mis. want, hope, decide, plan, manage)\n- satu preposisi + gerund (mis. "good at...", "instead of...", "look forward to...")\n- satu pola verb + object + to infinitive (mis. "My friend encouraged me to...")\n- tidak ada bentuk seperti "enjoy to", "want going", atau "for to"',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: bentuk sesudah kata kerja tepat (gerund sesudah enjoy/avoid/keep, to infinitive sesudah want/hope/decide); gerund sesudah preposisi; gerund sebagai subjek dengan kata kerja tunggal; pola verb + object + to infinitive benar; tidak ada "to" sesudah modal, make, atau let. Task Achievement: semua unsur yang diminta muncul dan topik sesuai. Coherence: paragraf mengalir wajar. Lexical Resource: kosakata tentang kebiasaan atau belajar tepat.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'I really enjoy ___ historical places at the weekend.', ['visit', 'to visit', 'visiting', 'visited'], 'visiting', 'Enjoy hanya bisa diikuti gerund (V-ing), jadi enjoy visiting, bukan enjoy to visit.'),
      mcq(2, 'We have decided ___ to a smaller flat next year.', ['moving', 'to move', 'move', 'moved'], 'to move', 'Decide hanya diikuti to infinitive karena menyatakan keputusan tentang hal yang belum terjadi.'),
      mcq(3, 'My parents never let me ___ out late when I was a teenager.', ['stay', 'to stay', 'staying', 'stayed'], 'stay', 'Pola let + orang + V1 tanpa to (bare infinitive): let me stay.'),
      mcq(4, 'I am looking forward to ___ from you soon.', ['hear', 'hearing', 'heard', 'be heard'], 'hearing', 'To pada look forward to adalah preposisi, dan sesudah preposisi kata kerja selalu berbentuk gerund.'),
      mcq(5, 'She stopped ___ two years ago, and now she feels much healthier.', ['smoking', 'to smoke', 'smoke', 'smoked'], 'smoking', 'Stop + gerund berarti tidak lagi melakukan kegiatan itu. Stop to smoke berarti berhenti sejenak supaya bisa merokok, yang tidak cocok dengan "feels much healthier".'),
      mcq(6, 'Please remember ___ the door when you leave tonight.', ['locking', 'to lock', 'lock', 'locked'], 'to lock', 'Remember + to infinitive berarti ingat untuk melakukan sesuatu yang belum dikerjakan. Remember locking berarti mengingat kejadian yang sudah lewat.'),
      mcq(7, '___ a foreign language takes time and patience.', ['Learn', 'Learning', 'Learned', 'To learning'], 'Learning', 'Kegiatan yang menjadi subjek kalimat memakai gerund. V1 polos (Learn) tidak bisa menjadi subjek.'),
      mcq(8, 'Which sentence is CORRECT?', ['The doctor suggested me to rest for a week.', 'The doctor suggested resting for a week.', 'The doctor suggested to rest for a week.', 'The doctor suggested me resting for a week.'], 'The doctor suggested resting for a week.', 'Suggest diikuti gerund (atau that-clause), tidak pernah diikuti to infinitive atau pola orang + to infinitive.'),
      mcq(9, 'The tea was too hot ___.', ['drinking', 'to drink', 'drink', 'for drink'], 'to drink', 'Pola too + adjective + to infinitive: too hot to drink (terlalu panas untuk diminum).'),
      mcq(10, 'My car is very dirty. It needs ___.', ['washing', 'wash', 'to washing', 'be washed'], 'washing', 'Sesudah need, gerund bermakna pasif kalau subjeknya benda: needs washing = needs to be washed. Pilihan "be washed" salah karena tidak ada to.'),
      mcq(11, '"I regret telling her the secret." What does this sentence mean?', ['I told her the secret, and now I feel sorry about it.', 'I am sorry, but I am about to tell her the secret.', 'I did not tell her the secret.', 'I forgot to tell her the secret.'], 'I told her the secret, and now I feel sorry about it.', 'Regret + gerund berarti menyesali sesuatu yang sudah dilakukan. Regret + to infinitive (regret to tell) dipakai untuk menyampaikan kabar buruk yang baru akan diucapkan.'),
      mcq(12, 'On the way home, we stopped ___ some petrol because the tank was almost empty.', ['to buy', 'buying', 'buy', 'bought'], 'to buy', 'Stop + to infinitive menyatakan tujuan: berhenti (dari perjalanan) supaya bisa membeli bensin. Stopped buying berarti tidak lagi membeli, yang berlawanan dengan konteks.'),
      mcq(13, 'She is used to ___ in a noisy office, so the sound does not bother her.', ['work', 'working', 'worked', 'works'], 'working', 'Be used to berarti sudah terbiasa, dan to di sini preposisi sehingga diikuti gerund. Jangan tertukar dengan used to + V1 (kebiasaan lampau).'),
      mcq(14, 'The teacher made the whole class ___ the essay again.', ['rewrite', 'to rewrite', 'rewriting', 'rewrote'], 'rewrite', 'Pola make + orang + V1 tanpa to: made the class rewrite.'),
      mcq(15, 'This museum is worth ___ at least once.', ['visit', 'to visit', 'visiting', 'visited'], 'visiting', 'Ungkapan be worth selalu diikuti gerund: worth visiting (layak dikunjungi).'),
      fill(16, 'Lengkapi dengan bentuk yang tepat dari kata kerja di kurung: She avoided ___ (answer) my question.', ['answering'], 'Avoid hanya diikuti gerund, jadi avoided answering.'),
      fill(17, 'Lengkapi dengan bentuk yang tepat dari kata kerja di kurung (dua kata): We cannot afford ___ (buy) a new car this year.', ['to buy'], 'Afford hanya diikuti to infinitive: cannot afford to buy.', 2),
      fill(18, 'Lengkapi dengan bentuk yang tepat dari kata kerja di kurung: Thank you for ___ (help) me with my application.', ['helping'], 'For adalah preposisi, dan sesudah preposisi kata kerja selalu berbentuk gerund: for helping.'),
      fill(19, 'Lengkapi dengan bentuk yang tepat dari kata kerja di kurung (dua kata): He promised not ___ (be) late again.', ['to be'], 'Promise diikuti to infinitive. Bentuk negatifnya not + to + V1: promised not to be late.', 2),
      fill(20, 'Lengkapi dengan bentuk yang tepat dari kata kerja di kurung (dua kata): The manager allowed us ___ (leave) early on Friday.', ['to leave'], 'Pola allow + orang + to infinitive: allowed us to leave. Berbeda dengan let, yang memakai V1 tanpa to.', 2),
      fill(21, 'Lengkapi dengan bentuk yang tepat dari kata kerja di kurung: Not ___ (be) invited to the party made her sad.', ['being'], 'Subjek kalimat ini adalah gerund pasif negatif: not + being + V3 (not being invited = tidak diundang).'),
      fill(22, 'Lengkapi dengan bentuk yang tepat dari kata kerja di kurung: I will never forget ___ (see) the ocean for the first time when I was six.', ['seeing'], 'Forget + gerund dipakai untuk pengalaman lampau yang tidak terlupakan. Kejadiannya sudah terjadi (when I was six), jadi seeing, bukan to see.'),
      fill(23, 'Lengkapi dengan bentuk yang tepat dari kata kerja di kurung (satu kata): When I was a child, I used to ___ (play) football every afternoon.', ['play'], 'Used to (tanpa be) menyatakan kebiasaan lampau dan diikuti V1: used to play. Bandingkan dengan be used to + V-ing (terbiasa).'),
      g(24, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar (gerund sebagai subjek).',
        explanation_id: 'Gerund phrase "Banning cars in city centres" menjadi subjek, lalu diikuti kata kerja "would reduce" dan objeknya.',
        segments: ['Banning cars', 'in city centres', 'would reduce', 'air pollution.'],
      }),
      g(25, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar (verb + object + to infinitive).',
        explanation_id: 'Pola encourage + orang + to infinitive: orang (me) diletakkan di antara kata kerja dan to infinitive.',
        segments: ['My teacher', 'encouraged me', 'to apply', 'for the scholarship.'],
      }),
      g(26, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Want hanya diikuti to infinitive, jadi "going" seharusnya "to go": She wants to go to Australia next year.',
        tokens: ['She', 'wants', 'going', 'to', 'Australia', 'next', 'year.'],
        correct_answers: [2],
      }),
      g(27, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Sesudah make + orang dipakai V1 tanpa to, jadi "to" harus dihapus: He made me wait for an hour.',
        tokens: ['He', 'made', 'me', 'to', 'wait', 'for', 'an', 'hour.'],
        correct_answers: [3],
      }),
      g(28, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'To pada look forward to adalah preposisi, jadi kata kerja sesudahnya harus gerund: "hear" seharusnya "hearing".',
        tokens: ['I', 'look', 'forward', 'to', 'hear', 'from', 'you', 'soon.'],
        correct_answers: [4],
      }),
      g(29, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap kalimat dengan maknanya.',
        explanation_id: 'Stop + to infinitive = berhenti supaya bisa melakukan hal lain; stop + gerund = tidak lagi melakukan. Remember + to infinitive = ingat untuk melakukan tugas; remember + gerund = punya ingatan tentang hal yang sudah dilakukan.',
        points: 4,
        matching: {
          left: ['I stopped to talk to her.', 'I stopped talking to her.', 'I remembered to post the letter.', 'I remember posting the letter.'],
          right: [
            'Saya berhenti dulu supaya bisa mengobrol dengannya.',
            'Saya tidak lagi mengobrol dengannya.',
            'Saya tidak lupa pada tugas itu, lalu mengeposkan suratnya.',
            'Saya punya ingatan bahwa surat itu sudah saya poskan.',
            'Saya lupa mengeposkan surat itu.',
          ],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2, 3],
      }),
      g(30, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'Agree diikuti to infinitive, dan preposisi at diikuti gerund, jadi dua kalimat itu benar. Yang salah: enjoy harus diikuti gerund (enjoy reading), tujuan tidak memakai for + to (came here to study), dan let diikuti V1 tanpa to (let me use).',
        points: 2,
        options: ['I enjoy to read before bed.', 'She agreed to help us.', 'I came here for to study.', 'They are good at solving problems.', 'He let me to use his laptop.'],
        correct_answers: ['She agreed to help us.', 'They are good at solving problems.'],
      }),
    ],
  },
};

export default sub;
