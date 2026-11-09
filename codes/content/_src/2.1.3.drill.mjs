const P = 'Q-GR213-';
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
    sub_module_title: 'Passive Voice untuk Deskripsi Proses & Laporan Ilmiah',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Jelaskan sebuah proses sederhana dalam bahasa Inggris (sekitar 100 sampai 130 kata), misalnya membuat teh, mendaur ulang botol plastik, atau mengolah biji kopi menjadi kopi bubuk.\n\nDalam tulisanmu wajib ada:\n- minimal 5 kalimat pasif yang benar (be + V3) untuk langkah-langkah proses\n- penanda urutan yang bervariasi (First, Next, After that, Once..., Finally) tanpa mengulang kata yang sama di setiap kalimat\n- satu pasif dengan modal (can be / must be) dan satu pasif perfect (has been / have been)\n- satu pola pelaporan, mis. "It is said that..." atau "X is believed to..."\n- tidak memakai I/we dan tidak memasifkan kata kerja intransitive (happen, occur, consist of)',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: pasif dibentuk dengan be + V3 yang benar di berbagai tense (present simple, perfect, modal); V3 tak beraturan benar (made, written, taken); tidak memasifkan kata kerja intransitive. Task Achievement: proses jelas dan berurutan, semua elemen yang diminta tercakup. Coherence and Cohesion: penanda urutan bervariasi dan alami. Lexical Resource: kosakata proses/teknis sesuai.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'English ___ all over the world.', ['speaks', 'is spoken', 'spoken', 'is speaking'], 'is spoken', 'Pasif present simple: is/are + V3. Subjek English menerima tindakan.'),
      mcq(2, 'This house ___ in 1990.', ['built', 'was built', 'is built', 'has built'], 'was built', 'Waktu lampau yang spesifik (in 1990) memakai pasif simple past: was + V3.'),
      mcq(3, 'The report ___ yet.', ['has not been published', 'is not publish', 'did not published', 'has not published'], 'has not been published', 'Pasif present perfect negatif: has/have not been + V3. "Yet" menandakan perfect.'),
      mcq(4, 'The problem can ___ easily.', ['solve', 'solved', 'be solved', 'be solving'], 'be solved', 'Pasif dengan modal: modal + be + V3.'),
      mcq(5, 'The cars ___ at the moment.', ['are being repaired', 'are repaired', 'were repairing', 'being repaired'], 'are being repaired', 'Pasif present continuous: am/is/are + being + V3.'),
      mcq(6, 'Which verb CANNOT be used in the passive?', ['build', 'happen', 'write', 'steal'], 'happen', '"Happen" adalah kata kerja intransitive (tidak punya objek), sehingga tidak bisa dipasifkan.'),
      mcq(7, 'Which sentence is CORRECT?', ['The accident was happened last night.', 'The accident happened last night.', 'The accident has been happened last night.', 'The accident is happened last night.'], 'The accident happened last night.', 'Happen tidak bisa dipasifkan. Gunakan bentuk aktif.'),
      mcq(8, 'Why is the passive used in this sentence? "Samples were collected and analysed."', ['The researcher is unknown or unimportant', 'The sentence is a question', 'The verb is intransitive', 'It is a polite request'], 'The researcher is unknown or unimportant', 'Laporan ilmiah memakai pasif untuk menekankan prosedur dan hasil, bukan pelaku.'),
      mcq(9, 'Choose the correct passive: "They gave me a prize."', ['I was given a prize.', 'I gave a prize.', 'I was gave a prize.', 'A prize gave me.'], 'I was given a prize.', 'Pasif simple past: was + V3. V3 dari give adalah given.'),
      mcq(10, 'Which expression is a formal REPORTING passive?', ['People say that exercise helps.', 'It is said that exercise helps memory.', 'Exercise is say to help memory.', 'It says that exercise helps memory.'], 'It is said that exercise helps memory.', 'Pola formal: It is + V3 + that + klausa.'),
      fill(11, 'Lengkapi dengan V3 dari "write": The letter was ___ by the manager.', ['written'], 'Pasif simple past: was + V3. V3 dari write adalah written.'),
      fill(12, 'Lengkapi dengan V3 dari "take": The photos will be ___ tomorrow.', ['taken'], 'Pasif future: will be + V3. V3 dari take adalah taken.'),
      fill(13, 'Lengkapi: The documents have ___ sent. (been / being)', ['been'], 'Pasif present perfect: have been + V3.'),
      fill(14, 'Lengkapi: The room is ___ cleaned at the moment. (being / been)', ['being'], 'Pasif present continuous: is being + V3.'),
      fill(15, 'Lengkapi dengan have atau get: I need to ___ my car repaired. (causative)', ['have', 'get'], 'Causative: have/get + objek + V3 berarti meminta orang lain memperbaiki.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat pasif yang benar.',
        explanation_id: 'Pasif present simple: S + is/are + V3 + keterangan.',
        segments: ['The beans', 'are dried', 'in the sun', 'for a week.'],
      }),
      g(17, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat pasif pelaporan yang benar.',
        explanation_id: 'Pola: S + is/are + V3 + to-infinitive.',
        segments: ['Exercise', 'is believed', 'to improve', 'memory.'],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Pasif wajib memakai be: "was broken".',
        tokens: ['The', 'window', 'broken', 'by', 'a', 'boy', 'yesterday.'],
        correct_answers: [2],
      }),
      g(19, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Setelah be, kata kerja berbentuk V3: made (bukan make).',
        tokens: ['These', 'cars', 'are', 'make', 'in', 'Japan.'],
        correct_answers: [3],
      }),
      g(20, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan tense dengan rumus pasifnya.',
        explanation_id: 'Present continuous: am/is/are being + V3. Present perfect: has/have been + V3. Modal: modal + be + V3.',
        points: 3,
        matching: {
          left: ['Present continuous', 'Present perfect', 'Modal (can/must)'],
          right: ['is/are being + V3', 'has/have been + V3', 'modal + be + V3', 'was/were + V3'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(21, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'Consist of dan happen intransitive: tidak dipasifkan. "Has been completed" dan "can be solved" benar.',
        points: 2,
        options: ['The team is consisted of five people.', 'The project has been completed.', 'The accident was happened at noon.', 'The problem can be solved.'],
        correct_answers: ['The project has been completed.', 'The problem can be solved.'],
      }),
    ],
  },
};

export default sub;
