const P = 'Q-LS311-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'LISTENING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const tour =
  'Transkrip: "When you enter through the main door, you will see the reception desk straight ahead. The café is on your left, next to the gift shop. The exhibition hall is opposite the café, and the toilets are at the end of the corridor, just past the exhibition hall."';

const sub = {
  meta: {
    tier_number: 3,
    module_code: '3.1',
    module_category: 'LISTENING',
    sub_module_title: 'Section 1 & 2: Form/Note Completion, Multiple Choice, & Map/Plan Labeling',
  },
  mini_task: {
    task_type: 'SELF_CHECK',
    prompt:
      'Latihan mandiri (tanpa penilaian AI), sekitar 25 menit.\n1. Cari satu percakapan Section 1 (pendaftaran, pemesanan) atau pengumuman Section 2 (tur, fasilitas) berbahasa Inggris dengan transkrip. Sebelum memutar audio, baca soal/label dan tebak jenis jawaban tiap celah.\n2. Putar SEKALI saja dan isi formulir (nama, nomor, tanggal, harga) sambil mendengar. Tulis angka sebagai digit dan salin ejaan persis.\n3. Untuk pengumuman denah, gambar sketsa dari deskripsi (opposite, next to, past, turn left) dan beri huruf pada tempat yang disebut.\n4. Cocokkan dengan transkrip: catat kesalahan karena ejaan, -teen/-ty, koreksi pembicara, atau kiri-kanan.',
    ai_rubric_criteria:
      'Daftar periksa mandiri: (a) jenis jawaban diprediksi sebelum audio; (b) koreksi pembicara diikuti dan jawaban akhir benar; (c) ejaan dan angka akurat; (d) sketsa denah sesuai deskripsi (opposite/next to/past); (e) kesalahan dicatat dengan penyebabnya.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'How many sections and questions are there in the IELTS Listening test?', ['4 sections and 40 questions', '3 sections and 30 questions', '4 sections and 30 questions', '2 sections and 20 questions'], '4 sections and 40 questions', 'Listening IELTS terdiri dari 4 section dengan total 40 soal.'),
      mcq(2, 'How many times is the audio played?', ['Once', 'Twice', 'Three times', 'Until you press stop'], 'Once', 'Audio diputar satu kali, jadi strategi dilakukan saat mendengar.'),
      mcq(3, 'Which type of recording is usually in Section 2?', ['A monologue about an everyday topic, such as a tour or announcement', 'A university lecture', 'A discussion between students and a tutor', 'A two-person conversation to complete a form'], 'A monologue about an everyday topic, such as a tour or announcement', 'Section 2 berupa monolog sehari-hari. Section 1 percakapan dua orang; Section 3 diskusi akademik; Section 4 kuliah.'),
      mcq(4, 'What is the best thing to do during the preparation time before a section?', ['Read the questions and predict the type of answers', 'Close your eyes and relax', 'Check the answers from the last section', 'Write the answers from memory'], 'Read the questions and predict the type of answers', 'Waktu persiapan dipakai untuk membaca soal dan memperkirakan jenis jawaban.'),
      mcq(5, 'Transkrip: "I would like to join the evening photography course. It begins on the fourteenth of October." What do you write for Start date?', ['14 October', '4 October', '40 October', '14th September'], '14 October', 'Fourteenth = 14; tulis 14 October sesuai format soal.'),
      mcq(6, tour + ' Where is the café?', ['On the left, next to the gift shop', 'Straight ahead', 'At the end of the corridor', 'Opposite the toilets'], 'On the left, next to the gift shop', '"The café is on your left, next to the gift shop".'),
      mcq(7, tour + ' Where are the toilets?', ['At the end of the corridor, just past the exhibition hall', 'Next to the gift shop', 'Opposite the café', 'Straight ahead of the main door'], 'At the end of the corridor, just past the exhibition hall', '"the toilets are at the end of the corridor, just past the exhibition hall".'),
      mcq(8, 'In map labelling, what does "opposite" mean?', ['On the other side, facing something', 'Next to something', 'Behind something', 'At the end of something'], 'On the other side, facing something', '"Opposite" = berseberangan, menghadap sesuatu.'),
      mcq(9, 'Transkrip: "The pool costs six pounds for adults." What do you write for the adult price?', ['£6', '£16', '£60', '£0.6'], '£6', 'Six pounds = £6; tulis angka sebagai digit.'),
      mcq(10, 'Why is it a problem to confuse left and right in map labelling?', ['The speaker describes directions as if you are walking, so you must work out the facing direction', 'Left and right are never mentioned', 'The speaker always starts from the exit', 'Only Section 4 has maps'], 'The speaker describes directions as if you are walking, so you must work out the facing direction', 'Arah kiri dan kanan dijelaskan dari perspektif orang yang berjalan, sehingga arah hadap harus ditentukan dulu.'),
      fill(11, 'Transkrip: "It is Maria Lopez, L-O-P-E-Z." Tulis nama belakang:', ['Lopez', 'LOPEZ', 'lopez'], 'Salin huruf yang dieja: L-O-P-E-Z.'),
      fill(12, 'Transkrip: "Eighty-five pounds." Tulis harga dalam angka:', ['85', '£85'], 'Eighty-five = 85.'),
      fill(13, 'Transkrip: "The tennis courts are closed for repair until the end of March." Tulis bulan (satu kata):', ['March', 'march'], '"until the end of March" menjawab kapan lapangan dibuka kembali.'),
      fill(14, 'Transkrip: "Please note that the tennis courts are closed." Fasilitas apa yang tutup? (dua kata)', ['tennis courts', 'the tennis courts'], 'Tennis courts adalah fasilitas yang tutup.', 3),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi urutan strategi Section 1 yang benar.',
        explanation_id: 'Baca label, tebak jenis jawaban, tulis saat mendengar, dan ikuti koreksi.',
        segments: ['Read the labels,', 'predict the type of answer,', 'write while listening,', 'and follow any correction.'],
      }),
      g(16, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Transkrip: "The café is on your left, next to the gift shop." Klik kata yang salah dalam catatan siswa: "The café is on the right, next to the gift shop."',
        explanation_id: 'Pembicara berkata "on your left", bukan right.',
        tokens: ['The', 'café', 'is', 'on', 'the', 'right,', 'next', 'to', 'the', 'gift', 'shop.'],
        correct_answers: [5],
      }),
      g(17, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: tour + ' Cocokkan tempat dengan letaknya.',
        explanation_id: 'Reception: lurus dari pintu. Café: di kiri, sebelah gift shop. Exhibition hall: seberang café. Toilets: di ujung lorong.',
        points: 4,
        matching: {
          left: ['reception desk', 'café', 'exhibition hall', 'toilets'],
          right: ['straight ahead of the main door', 'on the left, next to the gift shop', 'opposite the café', 'at the end of the corridor', 'on the first floor'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2, 3],
      }),
      g(18, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA hal yang penting saat mengisi form completion.',
        explanation_id: 'Ejaan dan batas kata menentukan benar atau salahnya jawaban. Jawaban panjang dan menebak ejaan merugikan.',
        points: 2,
        options: ['Spell the answer correctly', 'Follow the word limit', 'Write long answers to be safe', 'Guess the spelling from the sound'],
        correct_answers: ['Spell the answer correctly', 'Follow the word limit'],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA ungkapan yang menyatakan lokasi.',
        explanation_id: 'Opposite dan next to menyatakan lokasi relatif. Because dan however adalah penghubung.',
        points: 2,
        options: ['opposite the café', 'next to the gift shop', 'because of the rain', 'however'],
        correct_answers: ['opposite the café', 'next to the gift shop'],
      }),
      mcq(20, 'Transkrip: "I was going to book a double room... no, actually, a single will do." Which room type should be written?', ['single', 'double', 'twin', 'suite'], 'single', 'Koreksi diri: double diganti single; jawaban akhir adalah single.'),
      mcq(21, 'Transkrip: "The reading room is still on the ground floor, but the computer room has moved upstairs to the second floor." Where is the computer room now?', ['On the second floor', 'On the ground floor', 'On the first floor', 'Next to the reading room'], 'On the second floor', 'Jawaban akhir ada setelah "but": computer room sudah pindah ke second floor. Ground floor adalah letak reading room.'),
      mcq(22, 'The instruction says "ONE WORD AND/OR A NUMBER". Which answer follows the word limit?', ['14 October', 'Monday 14 October', 'the fourteenth of October', 'in the middle of October'], '14 October', '"14 October" terdiri dari satu angka dan satu kata. Opsi lain memakai lebih dari satu kata.'),
      mcq(23, 'A map labelling task asks you to write the correct letter, A–H. What should you write for the café if it is at position C?', ['C', 'café', 'C café', 'on the left'], 'C', 'Jika instruksi meminta huruf, tulis hurufnya saja, bukan nama tempat.'),
      mcq(24, 'You missed the answer to one question and the speaker has already moved on. What is the best thing to do?', ['Move on to the next question and guess the missed one later', 'Keep thinking about the missed question', 'Wait for the audio to be repeated', 'Leave the answer empty because wrong answers lose points'], 'Move on to the next question and guess the missed one later', 'Terpaku pada soal yang terlewat membuat soal berikutnya ikut hilang. Tebak nanti, karena tidak ada penalti untuk jawaban salah.'),
      mcq(25, 'Transkrip: "My number is oh-seven, double three, four five six." Which number should be written?', ['0733456', '0723456', '07333456', '0733465'], '0733456', '"Oh" = 0 dan "double three" = 33, sehingga nomornya 07 33 456.'),
      fill(26, 'Transkrip: "The cooking class costs fifty pounds, and it starts on the thirteenth of May." Tulis tanggal mulai (angkanya saja):', ['13', '13th'], 'Thirteenth = 13. Jangan tertukar dengan thirtieth (30) atau dengan harga 50.'),
      fill(27, 'Transkrip: "I live at fifteen Baker Street. That is B-A-K-E-R." Tulis nama jalan (satu kata, tanpa Street):', ['Baker', 'BAKER', 'baker'], 'Salin huruf yang dieja: B-A-K-E-R.'),
      g(28, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi urutan langkah mengerjakan soal peta yang benar.',
        explanation_id: 'Tentukan titik awal, baca label, ikuti arah yang disebut pembicara, lalu tulis hurufnya.',
        segments: ['Find the starting point,', 'read the labels,', 'follow the directions,', 'and write the letter.'],
      }),
      g(29, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Transkrip: "The pool costs six pounds for adults." Klik kata yang salah dalam catatan siswa: "The pool costs sixteen pounds for adults."',
        explanation_id: 'Pembicara berkata "six" (6), bukan sixteen (16).',
        tokens: ['The', 'pool', 'costs', 'sixteen', 'pounds', 'for', 'adults.'],
        correct_answers: [3],
      }),
      g(30, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan pola di sekitar celah dengan jenis jawaban yang paling mungkin.',
        explanation_id: 'Tanda £ diikuti angka, "to" diikuti kata kerja dasar, "on" diikuti hari atau tanggal, dan kata sebelum Street adalah nama jalan.',
        points: 4,
        matching: {
          left: ['Fee: £ ______', 'You need to ______ a form.', 'The course starts on ______.', 'Address: 12 ______ Street'],
          right: ['a number', 'a base verb', 'a day or date', 'a street name', 'a colour'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2, 3],
      }),
    ],
  },
};

export default sub;
