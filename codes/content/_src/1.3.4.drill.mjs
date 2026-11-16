const P = 'Q-GR114-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'GRAMMAR', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.3',
    module_category: 'GRAMMAR',
    sub_module_title: 'Modals of Ability, Obligation & Possibility (can, must, should, might)',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis paragraf pendek (sekitar 90 sampai 110 kata) dalam bahasa Inggris berisi saran untuk temanmu yang akan mengikuti ujian IELTS bulan depan.\n\nDalam paragrafmu:\n- berikan minimal 2 saran dengan should / ought to / had better\n- sebutkan satu kewajiban dengan must atau have to dan satu hal yang TIDAK wajib dengan don\'t have to\n- nyatakan satu dugaan atau kemungkinan dengan might / may / could (mis. tentang hasil ujiannya)\n- gunakan satu permintaan sopan dengan Could you... atau Would you mind...',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: modal selalu diikuti V1 tanpa -s, tanpa to, tanpa do/does; mustn\'t dan don\'t have to dipakai sesuai maknanya; dugaan masa lampau memakai modal + have + V3 bila ada; tidak ada dua modal berurutan (will can). Task Achievement: semua fungsi yang diminta (saran, kewajiban, tidak wajib, dugaan, permintaan sopan) muncul. Lexical Resource dan Coherence: pilihan modal sesuai tingkat kepastian dan kesopanan, paragraf terhubung.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'She ___ speak three languages.', ['can', 'cans', 'can to', 'is can'], 'can', 'Modal tidak berubah untuk he/she/it dan tidak memakai to atau am/is/are.'),
      mcq(2, '___ you swim when you were a child?', ['Could', 'Do', 'Did', 'Are'], 'Could', 'Kemampuan umum di masa lampau memakai could. Tanya modal: Could + S + V1.'),
      mcq(3, 'You ___ park here. It\'s forbidden.', ['mustn\'t', 'don\'t have to', 'needn\'t to', 'might not'], 'mustn\'t', 'Mustn\'t menyatakan larangan. "Don\'t have to" berarti tidak wajib (boleh, tetapi tidak harus).'),
      mcq(4, 'You ___ come early; the event starts at ten, and there is no need to be early.', ['mustn\'t', 'don\'t have to', 'can\'t', 'shouldn\'t'], 'don\'t have to', '"Don\'t have to" = tidak wajib. "Mustn\'t" akan berarti dilarang datang awal, yang tidak sesuai konteks.'),
      mcq(5, 'She has worked since 6 a.m., so she ___ be tired.', ['must', 'can\'t', 'mustn\'t', 'might not'], 'must', 'Dugaan kuat (hampir pasti) dengan alasan yang jelas memakai must.'),
      mcq(6, 'That ___ be Rina. She is on holiday in Bali this week.', ['must', 'can\'t', 'should', 'might'], 'can\'t', 'Mustahil menurut bukti (dia sedang di Bali) = can\'t be.'),
      mcq(7, 'It is cloudy. It ___ rain later, but I\'m not sure.', ['must', 'might', 'has to', 'doesn\'t have to'], 'might', 'Kemungkinan kecil/tidak pasti memakai might, may, atau could.'),
      mcq(8, 'Which sentence is the MOST polite request?', ['Open the window.', 'Can you open the window?', 'Could you open the window, please?', 'You must open the window.'], 'Could you open the window, please?', 'Could + please lebih sopan daripada can. Perintah langsung dan must tidak sopan untuk permintaan.'),
      mcq(9, 'Which sentence is grammatically CORRECT?', ['She can to swim.', 'She cans swim.', 'Does she can swim?', 'Can she swim?'], 'Can she swim?', 'Modal tidak memakai to atau -s; bentuk tanya modal dengan membalik posisi, tanpa do/does.'),
      mcq(10, 'After three hours of work, we finally ___ fix the problem.', ['could', 'were able to', 'can', 'must'], 'were able to', 'Untuk satu kejadian spesifik yang berhasil di masa lampau digunakan was/were able to, bukan could.'),
      fill(11, 'Lengkapi dengan modal yang tepat: You ___ see a doctor. You look ill. (saran)', ['should'], 'Saran umum memakai should (atau ought to).'),
      fill(12, 'Lengkapi: Students ___ to wear uniforms at this school. (aturan sekolah)', ['have', 'need'], 'Kewajiban dari aturan eksternal memakai have to (students have to wear).'),
      fill(13, 'Lengkapi dengan modal yang tepat: She ___ have forgotten the meeting. (dugaan: pasti lupa)', ['must'], 'Dugaan kuat tentang masa lampau: must + have + V3.'),
      fill(14, 'Lengkapi dengan V3: He might have ___ the bus. (miss)', ['missed'], 'Modal + have + V3. V3 dari miss adalah missed.'),
      fill(15, 'Lengkapi dengan modal yang tepat: I ___ study abroad if I had a scholarship. (kondisional)', ['would'], 'Kalimat kondisional (if + past) memakai would + V1.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi pertanyaan yang benar.',
        explanation_id: 'Tanya dengan modal: Modal + subjek + V1 + keterangan, tanpa do/does.',
        segments: ['Could', 'you', 'help', 'me', 'with this exercise?'],
      }),
      g(17, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat larangan yang benar.',
        explanation_id: 'Larangan: subjek + mustn\'t + V1 + keterangan tempat.',
        segments: ['You', 'mustn\'t', 'use', 'your phone', 'in the exam room.'],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Modal tidak memakai to. Seharusnya: He must go home now.',
        tokens: ['He', 'must', 'to', 'go', 'home', 'now.'],
        correct_answers: [2],
      }),
      g(19, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Dua modal tidak dipakai bersamaan. Gunakan will be able to: I will be able to help you.',
        tokens: ['I', 'will', 'can', 'help', 'you', 'tomorrow.'],
        correct_answers: [2],
      }),
      g(20, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan modal dengan fungsinya.',
        explanation_id: 'Must = kewajiban/dugaan kuat; should = saran; might = kemungkinan kecil.',
        points: 3,
        matching: {
          left: ['You must wear a seatbelt.', 'You should drink more water.', 'It might rain tomorrow.'],
          right: ['kewajiban', 'saran', 'kemungkinan', 'larangan'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(21, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'Modal tidak memakai -s atau to. "Must have + V3" dan "can\'t" untuk dugaan benar. "He cans" dan "She must to" salah.',
        points: 2,
        options: ['He cans swim very fast.', 'She must have forgotten the key.', 'They must to leave now.', 'That can\'t be true.'],
        correct_answers: ['She must have forgotten the key.', 'That can\'t be true.'],
      }),
      mcq(22, 'You ___ hurry, or you will miss the train.', ['had better', 'have better', 'had better to', 'would better'], 'had better', 'Saran kuat yang punya konsekuensi memakai had better + V1, tanpa to.'),
      mcq(23, 'Which is the MOST formal way to ask for permission?', ['Can I come in?', 'May I come in?', 'I come in?', 'Do I can come in?'], 'May I come in?', '"May" adalah pilihan paling sopan/formal untuk meminta izin; "can" bernada biasa.'),
      mcq(24, 'I ___ live in Surabaya, but now I live in Jakarta.', ['use to', 'used to', 'am used to', 'would to'], 'used to', '"Used to + V1" menyatakan keadaan atau kebiasaan lampau yang sudah tidak berlaku.'),
      mcq(25, 'He ___ have finished already. He only started five minutes ago.', ['must', 'can\'t', 'should', 'has to'], 'can\'t', 'Dugaan mustahil tentang masa lampau: can\'t + have + V3.'),
      mcq(26, 'I ___ vote next year when I turn seventeen.', ['will can', 'will be able to', 'can to', 'am can'], 'will be able to', 'Dua modal tidak dipakai bersamaan. Kemampuan di masa depan memakai will be able to.'),
      g(27, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Modal tidak pernah mendapat -s, juga untuk subjek she. Seharusnya: She must leave early today.',
        tokens: ['She', 'musts', 'leave', 'early', 'today.'],
        correct_answers: [1],
      }),
      fill(28, 'Lengkapi dengan satu kata: You ___ to see a doctor about that cough. (saran; sama artinya dengan should)', ['ought'], '"Ought to" bermakna sama dengan should untuk saran umum, dan merupakan pengecualian yang memakai to.'),
      fill(29, 'Lengkapi dengan bentuk yang benar dari kata kerja dalam kurung: He should ___ harder for the exam. (studied)', ['study'], 'Setelah modal, kata kerja selalu V1: should study, bukan should studied.'),
      fill(30, 'Lengkapi dengan satu kata: She may ___ gone home early yesterday. (dugaan masa lampau)', ['have'], 'Dugaan tentang masa lampau memakai modal + have + V3: may have gone.'),
    ],
  },
};

export default sub;
