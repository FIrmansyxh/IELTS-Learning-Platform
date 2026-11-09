const P = 'Q-LS312-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'LISTENING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const discussion =
  'Transkrip: Tutor: "How will you collect your data?" Anna: "We thought of an online survey, but people might not respond." Ben: "Maybe interviews would be better, although they take a lot of time." Anna: "What if we do both: a short survey first, then interviews with ten people?" Tutor: "That sounds sensible."';
const lecture =
  'Transkrip: "Today I would like to talk about urban green spaces. Firstly, they improve air quality: a single mature tree can absorb about twenty kilograms of carbon dioxide a year. Secondly, they benefit mental health; people who live near parks report lower stress. However, creating parks is expensive, which is why many cities rely on rooftop gardens as a cheaper alternative."';

const sub = {
  meta: {
    tier_number: 3,
    module_code: '3.1',
    module_category: 'LISTENING',
    sub_module_title: 'Section 3 & 4: Diskusi Akademik Multi-Pembicara & Monolog Kuliah Universitas',
  },
  mini_task: {
    task_type: 'SELF_CHECK',
    prompt:
      'Latihan mandiri (tanpa penilaian AI), sekitar 30 menit.\n1. Pilih satu kuliah pendek berbahasa Inggris (4 sampai 6 menit, mis. kuliah terbuka dengan transkrip). Sebelum mendengar, tulis kerangka catatan berisi judul topik dan 4 sampai 5 baris kosong untuk poin utama.\n2. Dengarkan sekali, catat HANYA kata kunci, angka, dan istilah (pakai singkatan: →, ↑, ↓, w/, e.g.). Tandai kata signposting yang kamu dengar (firstly, however, turning to, in conclusion).\n3. Dari catatanmu, buat 5 soal note/summary completion sendiri dengan batas kata, lalu isi ulang besok tanpa melihat transkrip.\n4. Periksa dengan transkrip dan catat: istilah yang salah eja, angka yang tertukar, dan bagian di mana kamu ketinggalan.',
    ai_rubric_criteria:
      'Daftar periksa mandiri: (a) catatan berupa kata kunci, bukan kalimat panjang; (b) struktur kuliah (poin, contoh, kesimpulan) tertangkap lewat signposting; (c) angka, nama, dan istilah akurat dengan ejaan benar; (d) soal buatan memakai batas kata dan jawaban persis dari audio; (e) kesalahan dianalisis penyebabnya.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which description matches Section 3 of the Listening test?', ['An academic discussion between two to four speakers', 'A monologue about a local event', 'A conversation to complete a booking form', 'A university lecture by one speaker'], 'An academic discussion between two to four speakers', 'Section 3 adalah diskusi akademik 2–4 pembicara (mahasiswa dan tutor). Section 4 adalah kuliah satu pembicara.'),
      mcq(2, 'Which description matches Section 4?', ['A university lecture by one speaker', 'An everyday conversation', 'A guided tour', 'A discussion between three students'], 'A university lecture by one speaker', 'Section 4 berupa kuliah akademik oleh satu pembicara.'),
      mcq(3, 'What is special about the question timing in Section 4?', ['There are no pauses between the questions', 'The audio is played twice', 'There are long pauses after every answer', 'Questions are read aloud'], 'There are no pauses between the questions', 'Section 4 berjalan tanpa jeda antar-soal, sehingga harus menulis singkat dan lanjut mendengar.'),
      mcq(4, discussion + ' What did the students decide to do?', ['Do a survey and then interviews', 'Do only an online survey', 'Do only interviews', 'Change the topic'], 'Do a survey and then interviews', 'Keputusan akhir: "do both: a short survey first, then interviews with ten people".'),
      mcq(5, discussion + ' Why did Anna doubt the online survey?', ['People might not respond', 'It costs too much', 'It takes too much time', 'The tutor disliked it'], 'People might not respond', 'Anna berkata "people might not respond". Waktu yang lama adalah masalah wawancara.'),
      mcq(6, discussion + ' What is the tutor\'s opinion of the final plan?', ['It is sensible', 'It is too expensive', 'It is risky', 'It is too short'], 'It is sensible', 'Tutor berkata "That sounds sensible".'),
      mcq(7, lecture + ' How much carbon dioxide can one mature tree absorb a year?', ['About 20 kilograms', 'About 12 kilograms', 'About 200 kilograms', 'About 2 kilograms'], 'About 20 kilograms', '"about twenty kilograms" = 20 kg. Waspadai twenty dan twelve atau two hundred.'),
      mcq(8, lecture + ' What is the problem with creating parks?', ['They are expensive', 'They reduce air quality', 'They are too small', 'They increase stress'], 'They are expensive', '"creating parks is expensive".'),
      mcq(9, 'Which word signals a CONTRAST in a lecture?', ['However', 'Firstly', 'For instance', 'In conclusion'], 'However', '"However" menandai kontras. Firstly (urutan), for instance (contoh), in conclusion (penutup).'),
      mcq(10, 'Which phrase usually introduces a definition in a lecture?', ['known as', 'turning to', 'for example', 'to sum up'], 'known as', '"Known as", "in other words", dan "that is to say" memperkenalkan definisi atau istilah.'),
      fill(11, lecture + ' Benefit 1: they improve ___ quality.', ['air'], 'Teks: "they improve air quality". Celah meminta kata yang mendahului "quality".'),
      fill(12, lecture + ' People who live near parks report lower ___. (satu kata)', ['stress'], 'Teks: "report lower stress".'),
      fill(13, lecture + ' Many cities use ___ gardens as a cheaper alternative. (satu kata)', ['rooftop'], 'Teks: "rooftop gardens as a cheaper alternative".'),
      fill(14, lecture + ' Green spaces benefit ___ health. (satu kata)', ['mental'], 'Teks: "they benefit mental health".'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi urutan strategi Section 4 yang benar.',
        explanation_id: 'Baca catatan dan prediksi, tulis kata kunci, lanjutkan mendengar, lalu periksa di akhir.',
        segments: ['Read the notes and predict,', 'write only key words,', 'keep listening,', 'then check spelling at the end.'],
      }),
      g(16, {
        question_type: 'ERROR_RECOGNITION',
        prompt: lecture + ' Klik kata yang salah dalam catatan siswa: "A mature tree absorbs about twelve kilograms of carbon dioxide a year."',
        explanation_id: 'Pembicara berkata twenty (20), bukan twelve (12).',
        tokens: ['A', 'mature', 'tree', 'absorbs', 'about', 'twelve', 'kilograms', 'a', 'year.'],
        correct_answers: [5],
      }),
      g(17, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan fungsi dengan ungkapan signposting.',
        explanation_id: 'Firstly = urutan; however = kontras; to sum up = penutup.',
        points: 3,
        matching: {
          left: ['listing points in order', 'introducing a contrast', 'concluding the lecture'],
          right: ['Firstly, ...', 'However, ...', 'To sum up, ...', 'For example, ...'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(18, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA teknik catatan yang efisien untuk kuliah.',
        explanation_id: 'Kata kunci dan singkatan/simbol menghemat waktu sehingga tidak ketinggalan audio. Menulis kalimat panjang membuat ketinggalan.',
        points: 2,
        options: ['Write key words only', 'Use abbreviations and symbols', 'Write full sentences', 'Stop listening while you write'],
        correct_answers: ['Write key words only', 'Use abbreviations and symbols'],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA ungkapan yang menyatakan ketidaksetujuan yang halus.',
        explanation_id: '"I\'m not so sure" dan "I see what you mean, but..." adalah cara halus untuk tidak setuju. "Exactly" dan "Absolutely" menyatakan setuju.',
        points: 2,
        options: ['I\'m not so sure', 'I see what you mean, but...', 'Exactly', 'Absolutely'],
        correct_answers: ['I\'m not so sure', 'I see what you mean, but...'],
      }),
      mcq(20, 'In a discussion, speakers mention three ideas but only agree on one at the end. When should you choose your answer?', ['After the speakers make their final decision', 'When the first idea is mentioned', 'When the second idea is mentioned', 'Before the audio starts'], 'After the speakers make their final decision', 'Jawaban pada diskusi biasanya adalah keputusan akhir, bukan ide yang pertama disebut.'),
    ],
  },
};

export default sub;
