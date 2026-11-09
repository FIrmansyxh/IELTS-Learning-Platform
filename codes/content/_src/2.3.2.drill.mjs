const P = 'Q-LS232-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'LISTENING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 2,
    module_code: '2.3',
    module_category: 'READING',
    sub_module_title: 'Mengenali Distractors (Koreksi Informasi & Jebakan Sinonim dalam Audio)',
  },
  mini_task: {
    task_type: 'SELF_CHECK',
    prompt:
      'Latihan mandiri (tanpa penilaian AI), sekitar 20 menit.\n1. Pilih satu percakapan atau wawancara berbahasa Inggris berdurasi 3 sampai 5 menit (podcast, video, atau rekaman latihan dengan transkrip).\n2. Dengarkan sekali, dan setiap kali pembicara memperbaiki diri, menolak sebuah pilihan, atau memakai but/actually/in the end, catat: (a) apa yang disebut lebih dulu, (b) apa jawaban akhirnya.\n3. Buat 3 soal pilihan ganda sendiri dengan 3 opsi yang semuanya disebut di audio, lalu minta teman menjawabnya.\n4. Periksa dengan transkrip: berapa pengecoh yang berhasil kamu kenali, dan kata penanda apa yang paling sering muncul?',
    ai_rubric_criteria:
      'Daftar periksa mandiri: (a) setiap koreksi/penolakan dicatat dengan jawaban akhir yang benar; (b) soal buatan memakai pengecoh yang benar-benar disebut di audio; (c) kata penanda (but, actually, in the end, no sorry) diidentifikasi; (d) jawaban diperiksa terhadap transkrip, bukan ingatan.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Transkrip: "The meeting is on Tuesday... no, sorry, Wednesday." When is the meeting?', ['Wednesday', 'Tuesday', 'Monday', 'Thursday'], 'Wednesday', 'Pembicara mengoreksi diri; jawaban akhir adalah Wednesday.'),
      mcq(2, 'Transkrip: "We could go by bus, which is cheap, or by train, which is faster, but in the end we decided to take a taxi because of the luggage." How will they travel?', ['By taxi', 'By bus', 'By train', 'On foot'], 'By taxi', 'Bus dan train hanya disebut sebagai opsi; keputusan akhir adalah taxi ("in the end").'),
      mcq(3, 'Transkrip: "It looks cheap, but it\'s actually quite expensive." What does the speaker think about the price?', ['It is expensive', 'It is cheap', 'It is free', 'It is reasonable'], 'It is expensive', 'Informasi setelah "but" dan "actually" adalah pendapat sebenarnya: expensive.'),
      mcq(4, 'Transkrip: "I thought about the beach, but it was too crowded, so we went to the museum." Where did they go?', ['The museum', 'The beach', 'The park', 'The station'], 'The museum', 'Pantai ditolak ("too crowded"); mereka pergi ke museum.'),
      mcq(5, 'Transkrip: "The class used to be on Mondays; now it is on Thursdays." When is the class now?', ['Thursdays', 'Mondays', 'Fridays', 'Tuesdays'], 'Thursdays', '"Used to ... now" menunjukkan perubahan; jadwal sekarang adalah Thursdays.'),
      mcq(6, 'Transkrip: "We planned to leave at nine, but because of the traffic we left at ten." When did they leave?', ['At ten', 'At nine', 'At eleven', 'At eight'], 'At ten', 'Rencana (nine) berubah karena lalu lintas; mereka berangkat pukul sepuluh.'),
      mcq(7, 'Transkrip: "I wasn\'t impressed by the food, but the service was excellent." What did the speaker like?', ['The service', 'The food', 'Both the food and the service', 'Neither'], 'The service', '"Wasn\'t impressed" = tidak suka makanan; "excellent" = suka pelayanan.'),
      mcq(8, 'Why are distractors included in Listening questions?', ['To test understanding of meaning and the whole conversation, not just matching words', 'To make the audio longer', 'To confuse native speakers', 'Because the audio is played twice'], 'To test understanding of meaning and the whole conversation, not just matching words', 'Pengecoh menguji pemahaman makna dan alur, bukan sekadar kata yang cocok.'),
      mcq(9, 'How many times is the Listening audio played in the real test?', ['Once', 'Twice', 'Three times', 'As many times as you want'], 'Once', 'Audio hanya diputar satu kali, sehingga strategi dilakukan saat mendengar.'),
      mcq(10, 'Which words often signal that the information AFTER them is the answer?', ['but, actually, in fact', 'and, also, too', 'the, a, an', 'maybe, perhaps, possibly'], 'but, actually, in fact', 'Kata kontras dan koreksi menandai bahwa informasi setelahnya sering menjadi jawaban.'),
      fill(11, 'Transkrip: "Room twenty-one... no, I mean twelve." Tulis nomor kamar:', ['12'], 'Koreksi "no, I mean" menetapkan jawaban akhir: 12.'),
      fill(12, 'Transkrip: "It costs forty... sorry, fourteen pounds." Tulis harga dalam angka:', ['14'], 'Koreksi: forty diganti fourteen = 14.'),
      fill(13, 'Transkrip: "The single is eighty pounds. Breakfast is ten... oh, sorry, twelve." Tulis harga sarapan (angka):', ['12'], 'Jawaban akhir setelah koreksi: twelve = 12.'),
      fill(14, 'Transkrip: "We considered a double room, but a single will do." Tulis tipe kamar yang dipilih (satu kata):', ['single'], 'Double ditolak; yang dipilih adalah single.'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi urutan strategi Listening yang benar.',
        explanation_id: 'Baca soal dulu, tandai pengecoh, dengarkan sampai ide selesai, lalu pilih jawaban akhir.',
        segments: ['Read the questions first,', 'listen until the idea', 'is finished,', 'then choose the final answer.'],
      }),
      g(16, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Transkrip: "We could meet at the library, the café or the park. The park is best because it\'s quiet." Klik tempat yang SALAH sebagai jawaban akhir dalam catatan siswa: "They will meet at the library."',
        explanation_id: 'Jawaban akhir adalah the park; library hanya salah satu opsi yang disebut.',
        tokens: ['They', 'will', 'meet', 'at', 'the', 'library.'],
        correct_answers: [5],
      }),
      g(17, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan tipe pengecoh dengan contoh audionya.',
        explanation_id: 'Koreksi diri: no, sorry. Penolakan: too crowded. Perubahan rencana: planned to... but.',
        points: 3,
        matching: {
          left: ['self-correction', 'rejection of an option', 'change of plan'],
          right: [
            'It costs forty... sorry, fourteen pounds.',
            'We considered the beach, but it was too crowded.',
            'We planned to leave at nine, but we left at ten.',
            'The meeting is at noon.',
          ],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(18, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA kata yang menandai bahwa pembicara mengoreksi dirinya.',
        explanation_id: '"No, sorry" dan "I mean" menandai koreksi. "Also" dan "for example" menambah informasi atau memberi contoh.',
        points: 2,
        options: ['no, sorry', 'I mean', 'also', 'for example'],
        correct_answers: ['no, sorry', 'I mean'],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA kebiasaan baik saat mengerjakan Listening Multiple Choice.',
        explanation_id: 'Membaca soal sebelum audio dan menunggu keputusan akhir pembicara adalah dua kebiasaan penting. Menjawab pada kata pertama atau terpaku pada soal terlewat merugikan.',
        points: 2,
        options: ['Read the questions and options before the audio', 'Wait for the speaker\'s final decision', 'Choose the first option you hear', 'Stay on a missed question until you work it out'],
        correct_answers: ['Read the questions and options before the audio', 'Wait for the speaker\'s final decision'],
      }),
      mcq(20, 'Transkrip: "He enjoyed the film, but the ending was disappointing." Which statement is closest to the speaker\'s view?', ['He liked the film overall but not the ending', 'He disliked the whole film', 'He loved the ending', 'He did not see the film'], 'He liked the film overall but not the ending', 'Kata "film" disebut, tetapi maknanya sebagian positif dan sebagian negatif; pilih makna, bukan kata yang sama.'),
    ],
  },
};

export default sub;
