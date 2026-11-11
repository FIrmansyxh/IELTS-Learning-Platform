const P = 'Q-GR117-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'GRAMMAR', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.1',
    module_category: 'GRAMMAR',
    sub_module_title: 'Prepositions (in, on, at, & Bound Prepositions) dan Interjections',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis surat formal singkat (sekitar 80 sampai 100 kata) kepada manajer sebuah tempat kursus bahasa untuk menanyakan kelas malam.\n\nDalam suratmu:\n- buka dengan "I am writing to enquire about ..." dan tutup dengan "I look forward to hearing from you."\n- pakai in / on / at dengan benar untuk minimal 3 keterangan waktu atau tempat (mis. on Monday, at 7 p.m., in July)\n- pakai minimal 3 bound preposition yang benar (mis. interested in, apply for, depend on, reason for, good at)\n- pakai minimal 1 pola preposition + gerund (mis. interested in joining)\n- jangan memakai kata seru (Wow!, What a ...!) karena ini surat formal',
    ai_rubric_criteria:
      'Grammatical Accuracy: in/on/at tepat untuk waktu dan tempat; bound preposition benar (interested in, apply for, depend on, similar to, different from); tidak ada preposisi berlebih (discuss about, in next week, go to home); kata kerja sesudah preposisi berbentuk -ing termasuk "look forward to hearing"; pronoun sesudah preposisi berbentuk objek. Task Achievement: semua unsur yang diminta muncul dan tujuan surat jelas. Register: formal, tanpa interjection. Coherence dan Lexical Resource: surat teratur dan kolokasi lazim.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'The meeting starts ___ 9 a.m.', ['in', 'on', 'at', 'to'], 'at', 'Jam atau titik waktu yang tepat memakai "at": at 9 a.m., at noon. "In" untuk bulan/tahun dan "on" untuk hari/tanggal.'),
      mcq(2, 'My sister was born ___ 2005.', ['in', 'on', 'at', 'to'], 'in', 'Tahun adalah rentang waktu yang panjang, jadi memakai "in": in 2005. "On" untuk hari/tanggal, "at" untuk jam.'),
      mcq(3, 'A beautiful painting hangs ___ the wall.', ['in', 'on', 'at', 'into'], 'on', 'Lukisan menempel pada permukaan dinding, jadi memakai "on". "In" berarti di dalam ruang, "into" menunjukkan gerakan masuk.'),
      mcq(4, 'She is waiting ___ the bus stop.', ['at', 'on', 'into', 'to'], 'at', 'Halte dipandang sebagai sebuah titik lokasi, jadi memakai "at". "Into" dan "to" menunjukkan gerakan, padahal ia sedang diam menunggu.'),
      mcq(5, 'He opened the tin ___ a knife.', ['by', 'with', 'of', 'from'], 'with', 'Alat yang dipakai untuk melakukan sesuatu memakai "with". "By" dipakai untuk pelaku pada kalimat pasif atau cara/kendaraan (by bus).'),
      mcq(6, 'I have lived in Bandung ___ 2019.', ['since', 'for', 'during', 'until'], 'since', '2019 adalah titik awal, jadi memakai "since". "For" diikuti lama waktu (for five years), "during" diikuti nama peristiwa, dan "until" menunjukkan titik akhir.'),
      mcq(7, 'Please submit the form ___ Friday at the latest.', ['by', 'until', 'since', 'during'], 'by', '"By" berarti paling lambat pada waktu itu (batas waktu), cocok dengan "at the latest". "Until" dipakai untuk kegiatan yang berlangsung terus sampai suatu waktu.'),
      mcq(8, 'My results are similar ___ yours.', ['with', 'to', 'as', 'from'], 'to', 'Pasangan tetapnya "similar to". Kata "dengan" pada "mirip dengan" tidak diterjemahkan menjadi "with".'),
      mcq(9, 'She is married ___ a doctor.', ['with', 'to', 'of', 'at'], 'to', 'Pasangan tetapnya "married to". "Married with" adalah terjemahan langsung dari "menikah dengan" dan salah.'),
      mcq(10, 'We look forward to ___ from you soon.', ['hear', 'hearing', 'heard', 'be heard'], 'hearing', '"To" pada "look forward to" adalah preposisi, dan kata kerja sesudah preposisi harus berbentuk gerund (-ing): hearing.'),
      mcq(11, 'Which sentence is correct?', ['We discussed about the problem.', 'We discussed the problem.', 'We discussed on the problem.', 'We discussed to the problem.'], 'We discussed the problem.', '"Discuss" langsung diikuti objek tanpa preposisi. "Discuss about" muncul karena menerjemahkan "membahas tentang".'),
      mcq(12, '___ a lovely day it is!', ['What', 'How', 'Which', 'So'], 'What', 'Inti frasanya kata benda (day) dengan artikel "a", jadi polanya What + a + adjective + noun. "How" hanya diikuti adjective atau adverb tanpa noun.'),
      mcq(13, '___ fast he runs!', ['What', 'How', 'What a', 'Such'], 'How', '"Fast" di sini adverb tanpa kata benda, jadi polanya How + adverb + subject + verb. "What" memerlukan kata benda sesudahnya.'),
      mcq(14, 'Which sentence is suitable for a formal letter to a manager?', ['Wow, your service was terrible!', 'I am writing to complain about the service I received.', 'Oops, I think you made a mistake!', 'Hey! Fix my order now!'], 'I am writing to complain about the service I received.', 'Interjection seperti Wow, Oops, dan Hey hanya cocok untuk Speaking dan tulisan informal. Surat formal memakai kalimat netral dengan pasangan "complain about".'),
      fill(15, 'Lengkapi: Success depends ___ hard work. (on / of / from)', ['on'], 'Pasangan tetapnya "depend on". "Depend of" dan "depend from" adalah terjemahan langsung dari "bergantung pada/dari" dan salah.'),
      fill(16, 'Lengkapi: The new term starts ___ Monday. (in / on / at)', ['on'], 'Nama hari memakai "on": on Monday. "In" untuk bulan/tahun, "at" untuk jam.'),
      fill(17, 'Lengkapi: My little brother is afraid ___ spiders. (of / with / from)', ['of'], 'Pasangan tetapnya "afraid of". Adjective ini tidak dipasangkan dengan "with" atau "from".'),
      fill(18, 'Lengkapi: This phone is different ___ the old one. (with / from / of)', ['from'], 'Bentuk bakunya "different from". "Different with" adalah terjemahan langsung dari "berbeda dengan" dan selalu salah.'),
      fill(19, 'Lengkapi dengan bentuk yang tepat dari kata kerja learn: I am interested in ___ Spanish.', ['learning'], 'Kata kerja sesudah preposisi (in) harus berbentuk gerund, yaitu verb + -ing: interested in learning.'),
      fill(20, 'Lengkapi: The team consists ___ five members. (of / from / in)', ['of'], 'Pasangan tetapnya "consist of". "Consist from" muncul karena menerjemahkan "terdiri dari" dan salah.'),
      fill(21, 'Lengkapi: We arrived ___ the airport two hours early. (to / at / on)', ['at'], '"Arrive" tidak pernah diikuti "to". Untuk tempat seperti bandara, hotel, atau stasiun dipakai "arrive at"; untuk kota atau negara dipakai "arrive in".'),
      fill(22, 'Lengkapi dengan for, since, atau during: She has worked here ___ three years.', ['for'], '"Three years" adalah lama waktu, jadi memakai "for". "Since" diikuti titik awal (since 2021), dan "during" diikuti nama peristiwa (during the meeting).'),
      fill(23, 'Lengkapi: He walked ___ the room and sat down. (into / at / on)', ['into'], '"Into" menunjukkan gerakan masuk ke dalam suatu ruang. "At" dan "on" menunjukkan posisi, bukan gerakan masuk.'),
      g(24, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat pembuka surat lamaran yang benar.',
        explanation_id: 'Urutan: subjek + "am writing" + tujuan dengan pasangan tetap "apply for" + objeknya. Kata "position" diikuti "of" + nama jabatan.',
        segments: ['I', 'am writing', 'to apply for', 'the position', 'of sales assistant.'],
      }),
      g(25, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat seru yang benar.',
        explanation_id: 'Pola kalimat seru dengan What: What + a + adjective + noun + subject + verb. Karena bukan pertanyaan, subjek (you) tetap di depan kata kerja (have).',
        segments: ['What', 'a beautiful', 'garden', 'you have!'],
      }),
      g(26, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: '"Home" adalah keterangan tempat yang tidak memakai "to", jadi seharusnya "went home". Kata "to" harus dibuang.',
        tokens: ['She', 'went', 'to', 'home', 'after', 'the', 'lesson.'],
        correct_answers: [2],
      }),
      g(27, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Begitu nama hari disebut, preposisinya "on": on Monday morning. "In" hanya dipakai bila tanpa nama hari (in the morning).',
        tokens: ['The', 'shop', 'opens', 'in', 'Monday', 'morning.'],
        correct_answers: [3],
      }),
      g(28, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Sesudah preposisi (with), pronoun harus berbentuk objek: with her, bukan with she.',
        tokens: ['He', 'went', 'to', 'the', 'cinema', 'with', 'she', 'yesterday.'],
        correct_answers: [6],
      }),
      g(29, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap kata dengan preposisi pasangannya.',
        explanation_id: 'Pasangan tetap (bound preposition) harus dihafal: believe in, fond of, keen on, wait for. Tidak ada pasangan umum yang memakai "with" di daftar ini.',
        points: 4,
        matching: {
          left: ['believe', 'fond', 'keen', 'wait'],
          right: ['in', 'of', 'on', 'for', 'with'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2, 3],
      }),
      g(30, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA pasangan kata yang benar.',
        explanation_id: 'Interested in, responsible for, dan based on adalah pasangan yang benar. "Depend of" seharusnya depend on, dan "different with" seharusnya different from.',
        points: 3,
        options: ['interested in', 'depend of', 'responsible for', 'different with', 'based on'],
        correct_answers: ['interested in', 'responsible for', 'based on'],
      }),
    ],
  },
};

export default sub;
