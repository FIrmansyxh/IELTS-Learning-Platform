const P = 'Q-VC413-';
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
    sub_module_title: 'Kosakata & Kolokasi Situasi Sehari-hari dan Dunia Kerja untuk General Training',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis surat semi-formal pendek (sekitar 120 sampai 150 kata) dalam bahasa Inggris kepada pemilik rumah (Mr Harris). Situasi: kamu menyewa apartemen, pemanas rusak sejak seminggu, dan kamu ingin perbaikan serta kepastian soal uang jaminan.\n\nWajib memakai minimal 8 kata/frasa dari topik ini (mis. tenant, landlord, deposit, repair, maintenance, notice, utilities, faulty, arrange, inconvenience, at your earliest convenience, look into), register semi-formal yang konsisten (Dear Mr Harris, ... Yours sincerely), dan minimal 2 phrasal verbs yang tepat (mis. look into, get back to, fill in).',
    ai_rubric_criteria:
      'Task Achievement: tiga poin tercakup (masalah pemanas dan sejak kapan, permintaan perbaikan, pertanyaan uang jaminan); register semi-formal konsisten. Lexical Resource: kosakata situasi tepat (tenant, landlord, deposit, repair, faulty), frasa tetap dan kolokasi benar (arrange a repair, at your earliest convenience), phrasal verbs akurat. Grammar: preposisi benar (apply for, discuss tanpa about, look forward to hearing). Coherence: surat teratur.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'What does "vacancy" mean in a job advertisement?', ['an available job', 'a holiday', 'a salary', 'a meeting'], 'an available job', '"Vacancy" = lowongan pekerjaan (juga bisa berarti kamar kosong).'),
      mcq(2, 'Which sentence is correct?', ['I would like to apply for the position.', 'I would like to apply to the position.', 'I would like to apply the position.', 'I would like to apply at the position.'], 'I would like to apply for the position.', 'Kolokasi tetap: apply for a job/position.'),
      mcq(3, 'What does "non-refundable" mean?', ['The money cannot be returned', 'The money is returned automatically', 'The item is free', 'The offer is valid for a year'], 'The money cannot be returned', 'Non-refundable berarti uang tidak dapat dikembalikan.'),
      mcq(4, 'Which expression is the most FORMAL way to ask for help?', ['I would be grateful if you could assist me.', 'Can you give me a hand?', 'Help me, please!', 'I need you to help.'], 'I would be grateful if you could assist me.', '"I would be grateful if you could..." adalah permintaan formal.'),
      mcq(5, 'What does "RSVP" ask you to do?', ['Reply to confirm attendance', 'Pay immediately', 'Bring a gift', 'Arrive early'], 'Reply to confirm attendance', 'RSVP = répondez s\'il vous plaît, mohon konfirmasi kehadiran.'),
      mcq(6, 'The landlord asked for a ___ of one month\'s rent before the tenant moved in.', ['deposit', 'receipt', 'vacancy', 'warranty'], 'deposit', 'Deposit = uang jaminan sewa.'),
      mcq(7, 'Which is the correct phrasal verb? "You need to ___ the form and return it by Friday."', ['fill in', 'fill up to', 'fill with', 'fill at'], 'fill in', '"Fill in/out a form" = mengisi formulir.'),
      mcq(8, 'Which sentence is correct?', ['We will discuss the problem tomorrow.', 'We will discuss about the problem tomorrow.', 'We will discuss to the problem tomorrow.', 'We will discuss on the problem tomorrow.'], 'We will discuss the problem tomorrow.', 'Discuss adalah transitive: tanpa about.'),
      mcq(9, 'Which sentence is correct?', ['I look forward to hearing from you.', 'I look forward to hear from you.', 'I look forward hearing from you.', 'I look forward for hearing from you.'], 'I look forward to hearing from you.', 'Look forward to + V-ing.'),
      mcq(10, 'In a semi-formal letter to a landlord you know by name, which opening and closing match?', ['Dear Mr Harris, ... Yours sincerely,', 'Dear Sir or Madam, ... Yours sincerely,', 'Dear Mr Harris, ... See ya!', 'Hi Harris, ... Yours faithfully,'], 'Dear Mr Harris, ... Yours sincerely,', 'Salam dengan nama dipasangkan dengan Yours sincerely; register semi-formal tidak memakai See ya!.'),
      fill(11, 'Lengkapi: Please keep the ___ as proof of purchase.', ['receipt'], 'Receipt = struk bukti pembelian.'),
      fill(12, 'Lengkapi: The item arrived ___, so I would like a replacement. (dalam keadaan rusak)', ['faulty', 'damaged', 'defective', 'broken'], 'Faulty, damaged, defective, atau broken menyatakan barang rusak.'),
      fill(13, 'Lengkapi: Please ___ out of the room by noon on the day of departure. (kata kerja hotel)', ['check', 'move'], 'Check out = keluar dari hotel; move out juga dipakai untuk pindah.'),
      fill(14, 'Lengkapi dengan preposisi: Thank you ___ your help.', ['for'], 'Thank you for + noun.'),
      fill(15, 'Lengkapi dengan phrasal verb: We will ___ into the matter and get back to you. (menyelidiki)', ['look'], 'Look into = menyelidiki.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi permintaan formal yang benar.',
        explanation_id: 'Pola: I would be grateful if you could + V1 + objek + keterangan.',
        segments: ['I would be grateful', 'if you could', 'arrange a repair', 'as soon as possible.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (preposisi).',
        explanation_id: 'Kolokasi: apply for a job, bukan apply to a job.',
        tokens: ['She', 'wants', 'to', 'apply', 'to', 'a', 'new', 'job.'],
        correct_answers: [4],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (redundan).',
        explanation_id: '"Return back" redundan; "return" sudah berarti mengembalikan.',
        tokens: ['Please', 'return', 'back', 'the', 'keys', 'to', 'the', 'landlord.'],
        correct_answers: [2],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kata dengan artinya.',
        explanation_id: 'Tenant = penyewa; landlord = pemilik; probation = masa percobaan.',
        points: 3,
        matching: {
          left: ['tenant', 'landlord', 'probation'],
          right: ['person who rents a property', 'person who owns a property', 'trial period at work', 'a type of insurance'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA ungkapan yang sesuai untuk surat FORMAL.',
        explanation_id: 'I wish to complain dan I would appreciate your prompt reply sesuai register formal. Drop me a line dan Gimme a refund informal.',
        points: 2,
        options: ['I wish to complain about...', 'I would appreciate your prompt reply.', 'Drop me a line!', 'Gimme a refund.'],
        correct_answers: ['I wish to complain about...', 'I would appreciate your prompt reply.'],
      }),
      mcq(21, 'A brochure says: "Rooms are subject to availability." What does this mean?', ['You can only get a room if one is still free', 'Rooms are always available', 'Rooms are free of charge', 'Rooms must be paid for in advance'], 'You can only get a room if one is still free', '"Subject to availability" = tergantung ketersediaan, jadi kamar tidak dijamin ada.'),
      mcq(22, 'Which phrasal verb means "to postpone"?', ['put off', 'turn down', 'take up', 'drop off'], 'put off', 'Put off = menunda; turn down = menolak, take up = memulai hobi, drop off = mengantar.'),
      mcq(23, 'Which verb is the FORMAL equivalent of "start"?', ['commence', 'kick off', 'get going', 'crack on'], 'commence', 'Commence adalah bentuk formal dari start/begin; kick off informal.'),
      mcq(24, 'A notice at a clinic says: "By appointment only." What must you do?', ['Arrange a time before you come', 'Arrive early and wait in a queue', 'Pay a fee at the door', 'Bring your ID card'], 'Arrange a time before you come', '"By appointment only" = hanya dengan janji, jadi kamu harus membuat janji temu dulu.'),
      mcq(25, 'Which sentence is correct?', ['Could you explain the problem to me?', 'Could you explain me the problem?', 'Could you explain to the problem me?', 'Could you explain about me the problem?'], 'Could you explain the problem to me?', 'Struktur yang benar: explain + sesuatu + to + orang, bukan explain me.'),
      fill(26, 'Lengkapi dengan phrasal verb: The company ___ down my application, so I did not get the job. (menolak)', ['turned'], 'Turn down = menolak; bentuk lampau: turned down.'),
      fill(27, 'Lengkapi: You can pay for the sofa in twelve monthly ___. (cicilan)', ['instalments', 'installments', 'payments'], 'Pay in instalments = membayar dengan cicilan.'),
      fill(28, 'Lengkapi frasa tetap: Admission is free of ___ for children under five.', ['charge'], 'Free of charge = gratis.'),
      g(29, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat pembuka surat yang benar.',
        explanation_id: 'Pola pembuka surat: I am writing to enquire about + hal yang ditanyakan.',
        segments: ['I am writing', 'to enquire about', 'the vacancy for', 'a part-time receptionist.'],
      }),
      g(30, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (redundan).',
        explanation_id: '"Cancel off" redundan; cukup "cancel my booking".',
        tokens: ['Please', 'cancel', 'off', 'my', 'booking', 'for', 'Friday.'],
        correct_answers: [2],
      }),
    ],
  },
};

export default sub;
