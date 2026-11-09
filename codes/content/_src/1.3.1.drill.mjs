const P = 'Q-LS131-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'LISTENING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.3',
    module_category: 'READING',
    sub_module_title: 'Mendengarkan Angka, Ejaan Nama, Waktu, & Alamat',
  },
  mini_task: {
    task_type: 'SELF_CHECK',
    prompt:
      'Latihan dikte mandiri (tanpa penilaian AI), sekitar 15 menit:\n1. Minta teman (atau gunakan aplikasi teks-ke-suara) membacakan 10 angka acak, campur pasangan 13/30, 14/40, 15/50, sebuah nomor telepon dengan "double", dan satu harga dengan desimal. Tulis sebagai digit, lalu periksa.\n2. Minta teman mengeja 5 nama (mis. Smythe, Kowalski, O\'Brien, Catherine, Jackson) huruf demi huruf. Tulis, lalu periksa ejaan.\n3. Tulis 6 waktu dan tanggal dari ucapan (quarter to four, half past two, the twelfth of March...) dalam bentuk angka.\n4. Catat kesalahanmu dan tebak penyebabnya (tekanan -teen/-ty, huruf mirip, atau lupa double).',
    ai_rubric_criteria:
      'Daftar periksa mandiri: (a) pasangan 13/30 dan 14/40 dibedakan benar; (b) double dipahami (77, bukan 7); (c) ejaan nama disalin persis, bukan ditebak; (d) quarter to dan quarter past tidak tertukar; (e) angka ditulis sebagai digit; (f) kesalahan dicatat beserta penyebabnya.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'A speaker says: "My number is oh-seven, double three, four five six." Which number do you write?', ['0733456', '073456', '07456', '0773456'], '0733456', '"Oh" = 0, "double three" = 33, lalu 4, 5, 6: 0-7-3-3-4-5-6.'),
      mcq(2, 'A speaker says: "The fee is fifty... no, sorry, fifteen pounds." What is the final answer?', ['£15', '£50', '£5', '£65'], '£15', 'Pembicara memperbaiki diri; jawaban akhir adalah angka setelah koreksi: fifteen = 15.'),
      mcq(3, 'What time is "quarter to four"?', ['3.45', '4.15', '3.15', '4.45'], '3.45', 'Quarter to four = lima belas menit sebelum pukul empat = 3.45.'),
      mcq(4, 'What time is "half past two"?', ['2.30', '1.30', '2.15', '3.30'], '2.30', 'Half past two = setengah jam setelah pukul dua = 2.30.'),
      mcq(5, 'A speaker spells: "S-M-Y-T-H-E". Which surname do you write?', ['Smythe', 'Smith', 'Smyth', 'Smythe-e'], 'Smythe', 'Salin huruf demi huruf persis seperti dieja: S-M-Y-T-H-E.'),
      mcq(6, 'Which pair of letters is most easily confused when listening?', ['B and P', 'A and Z', 'O and X', 'R and L'], 'B and P', 'B dan P (juga M/N, G/J, I/E) sering tertukar karena bunyinya mirip.'),
      mcq(7, 'How do you say the email "jane.smith@mail.com" aloud?', ['jane dot smith at mail dot com', 'jane point smith @ mail point com', 'jane dash smith at mail com', 'jane smith dot mail com'], 'jane dot smith at mail dot com', '"." dibaca dot dan "@" dibaca at.'),
      mcq(8, 'A speaker says "the fourteenth of March". What do you write?', ['14 March', '4 March', '40 March', '14th of Mar'], '14 March', 'Fourteenth = 14. Tulis bentuk yang diminta soal: 14 March.'),
      mcq(9, 'The speaker stresses the FIRST syllable: "THIRty". Which number is it?', ['30', '13', '3', '300'], '30', 'Thirty = 30 (tekanan di awal). Thirteen = 13 (tekanan di akhir: thirTEEN).'),
      mcq(10, 'The instructions say ONE WORD AND/OR A NUMBER. The speaker says "forty-two". How do you write it?', ['42', 'forty-two', 'forty two', '4 2'], '42', 'Angka ditulis sebagai digit (42) dan dihitung sebagai satu angka.'),
      fill(11, 'Tulis angka dari ucapan "nine nine eight":', ['998'], 'Nine nine eight = 9-9-8: 998.'),
      fill(12, 'Tulis angka dari ucapan "one hundred and twenty":', ['120'], 'One hundred and twenty = 120.'),
      fill(13, 'Tulis nama bulan kedua dalam setahun (ejaan lengkap):', ['February', 'february'], 'Ejaan yang benar: February. Ejaan sering salah, jadi hafalkan.'),
      fill(14, 'Tulis dua huruf dari ejaan "double L":', ['LL', 'll'], '"Double L" berarti huruf L ditulis dua kali: LL.'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi urutan langkah form completion yang benar.',
        explanation_id: 'Baca soal sebelum audio, lalu dengarkan dan tulis jawaban akhir (setelah koreksi).',
        segments: ['Read the questions', 'before the audio starts,', 'then listen and write', 'the final answer.'],
      }),
      g(16, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata dengan ejaan yang salah.',
        explanation_id: 'Ejaan yang benar: Wednesday (ada huruf d yang tidak dibaca).',
        tokens: ['The', 'meeting', 'is', 'on', 'Wensday', 'at', 'quarter', 'to', 'four.'],
        correct_answers: [4],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata dengan ejaan yang salah.',
        explanation_id: 'Ejaan yang benar: forty (tanpa huruf u), berbeda dari four.',
        tokens: ['The', 'fee', 'is', 'fourty', 'pounds.'],
        correct_answers: [3],
      }),
      g(18, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan ucapan dengan cara menulisnya.',
        explanation_id: 'Double seven = 77; oh = 0; quarter past three = 3.15.',
        points: 3,
        matching: {
          left: ['double seven', 'oh (in a phone number)', 'quarter past three'],
          right: ['77', '0', '3.15', '3.45'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA kebiasaan yang baik saat mendengar angka dan nama.',
        explanation_id: 'Menunggu koreksi pembicara dan menyalin ejaan persis menghindari kesalahan paling umum. Menebak ejaan atau menulis angka dengan kata merugikan.',
        points: 2,
        options: ['Wait for self-corrections like "sorry, I mean"', 'Copy the spelled letters exactly', 'Guess the spelling from the sound', 'Write numbers as words'],
        correct_answers: ['Wait for self-corrections like "sorry, I mean"', 'Copy the spelled letters exactly'],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA pasangan huruf yang paling sering tertukar saat mendengar.',
        explanation_id: 'B/P dan M/N termasuk pasangan paling sering tertukar. A/Q dan X/O bunyinya cukup berbeda.',
        points: 2,
        options: ['B and P', 'M and N', 'A and Q', 'X and O'],
        correct_answers: ['B and P', 'M and N'],
      }),
    ],
  },
};

export default sub;
