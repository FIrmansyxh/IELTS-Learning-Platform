const P = 'Q-RD431-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'READING', passage_no: 1, ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });
const tfng = (n, prompt, answer, explanation_id) =>
  g(n, { question_type: 'TFNG', prompt, correct_answers: [answer], explanation_id });

const passage = `## How Cities Cool Themselves

[A] Cities are often several degrees warmer than the countryside around them, a pattern known as the urban heat island effect. Dark surfaces such as asphalt and roofing absorb sunlight, and heat released from air conditioners and engines adds to the problem. In the summer of 2019, one southern city recorded night-time temperatures up to 6°C higher in its centre than in nearby farmland.

[B] Planting trees is the best-known response. Leaves provide shade and release water vapour, which cools the air. A study of 20 streets found that those with continuous tree cover were on average 2.5°C cooler at midday than streets without trees. However, trees need years to grow, require regular watering in dry seasons, and compete for space with underground pipes.

[C] A faster alternative is to change the colour of roofs. Painting a roof white can reflect up to 80% of sunlight, compared with about 10% for a dark roof. In one housing district, residents who applied reflective paint reported that their top-floor rooms were about 4°C cooler. The main drawback is that the benefit fades as dirt builds up, so roofs must be repainted every few years.

[D] Some cities are experimenting with water. Fountains, shallow ponds and misting systems in public squares can lower local temperatures by several degrees. The effect is temporary, however, and in regions facing water shortages such schemes are controversial.

[E] Planners increasingly argue that no single measure is enough. The most successful programmes combine trees, reflective surfaces and water features with building rules that require shaded windows and ventilation. A city official quoted in the study noted that the cheapest approach is often to protect the green spaces that already exist.`;

const passage2 = `## Riverside Leisure Centre: Membership Information

[A] Riverside Leisure Centre offers three types of membership. Standard members may use the gym and the swimming pool every day from 6 a.m. to 10 p.m. Off-peak members pay less but may only enter between 9 a.m. and 4 p.m., Monday to Friday. Family membership covers two adults and up to three children under 16 living at the same address.

[B] All new members pay a joining fee of £25, which is non-refundable. Monthly fees are collected by direct debit on the first working day of each month. Members who pay for a full year in advance receive one month free of charge.

[C] Exercise classes are included in standard and family membership, while off-peak members pay £4 per class. Places must be booked at least 24 hours in advance, either online or at reception. Members who miss three booked classes in one month without cancelling will lose the right to book for the following four weeks.

[D] To cancel a membership, members must give one month's notice in writing. Membership may be suspended for up to three months for medical reasons, provided that a doctor's letter is supplied. Lockers are available on a first-come, first-served basis; members should bring their own padlock, as the centre does not sell them.`;

const p2 = (q) => ({ ...q, passage_no: 2 });

const sub = {
  meta: {
    tier_number: 4,
    module_code: '4.3',
    module_category: 'READING',
    sub_module_title: 'Menyelesaikan 3 Reading Passages (40 Soal) dalam 50 Menit dengan Akurasi >= 30/40',
  },
  mini_task: {
    task_type: 'SELF_CHECK',
    prompt:
      'Simulasi mandiri bertimer (tanpa penilaian AI), sekitar 70 menit:\n1. Ambil satu set Reading lengkap (3 teks, 40 soal) dari sumber latihan yang kamu miliki. Atur timer 50 menit dan kerjakan dengan alur: skim + peta teks, soal cepat dulu, tandai soal lebih dari 90 detik, tebak semua soal kosong sebelum waktu habis.\n2. Catat waktu selesai tiap teks dan skor mentah per teks.\n3. Buat LOG KESALAHAN: nomor soal, tipe soal, penyebab (kosakata, parafrase, jebakan False vs Not Given, waktu, ceroboh), dan tindakan perbaikan.\n4. Tentukan satu prioritas perbaikan untuk simulasi berikutnya dan jadwalkan ulang minggu depan. Target: 30/40 atau lebih.',
    ai_rubric_criteria:
      'Daftar periksa mandiri: (a) simulasi dilakukan dengan timer dan alur yang disepakati; (b) waktu per teks dicatat dan disiplin triage (90 detik) diterapkan; (c) semua soal salah dimasukkan ke log dengan penyebab yang spesifik; (d) ada satu prioritas perbaikan yang terukur; (e) tidak ada jawaban kosong.',
  },
  drill: {
    time_limit_seconds: 1200,
    passages: [passage, passage2],
    questions: [
      g(1, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Choose the correct heading for each paragraph (A-E). There are more headings than paragraphs.',
        matching: {
          left: ['Paragraph A', 'Paragraph B', 'Paragraph C', 'Paragraph D', 'Paragraph E'],
          right: [
            'Why cities become hotter',
            'The benefits and limits of trees',
            'A quick fix with a short life',
            'Temporary cooling with water',
            'The case for combined solutions',
            'The history of urban planning',
            'Health risks of extreme heat',
          ],
          allow_reuse: false,
        },
        points: 5,
        correct_answers: [0, 1, 2, 3, 4],
        explanation_id: 'A: penyebab kota lebih panas. B: manfaat dan keterbatasan pohon. C: cat atap putih, cepat tetapi memudar. D: air, sifatnya sementara. E: solusi gabungan. Dua judul lain adalah pengecoh.',
      }),
      tfng(2, 'Heat from air conditioners adds to the urban heat island effect.', 'True', 'Paragraf A: "heat released from air conditioners and engines adds to the problem".'),
      tfng(3, 'Streets with continuous tree cover were about 5°C cooler at midday than streets without trees.', 'False', 'Paragraf B: rata-rata 2,5°C lebih dingin, bukan 5°C.'),
      tfng(4, 'The cooling effect of white roof paint lasts permanently.', 'False', 'Paragraf C: manfaat memudar saat kotoran menumpuk, sehingga atap harus dicat ulang.'),
      tfng(5, 'Water cooling schemes are cheaper than planting trees.', 'Not Given', 'Teks tidak membandingkan biaya sistem air dan penanaman pohon.'),
      fill(6, 'A dark roof reflects about ___% of sunlight.', ['10', 'ten'], 'Paragraf C: "compared with about 10% for a dark roof".'),
      fill(7, 'Residents who used reflective paint found their top-floor rooms about ___°C cooler.', ['4', 'four'], 'Paragraf C: "about 4°C cooler".'),
      fill(8, 'Roofs must be repainted every ___ years.', ['few'], 'Paragraf C: "repainted every few years".'),
      fill(9, 'Fountains, ponds and misting systems can lower local temperatures by ___ degrees.', ['several'], 'Paragraf D: "lower local temperatures by several degrees".'),
      g(10, {
        question_type: 'SHORT_ANSWER',
        prompt: 'According to the writer, what do the most successful programmes combine with trees and water features? (Maximum THREE words)',
        correct_answers: ['reflective surfaces', 'reflective surface'],
        max_words: 3,
        explanation_id: 'Paragraf E: "combine trees, reflective surfaces and water features".',
      }),
      mcq(11, 'What is the main purpose of the text?', ['To compare different ways cities can reduce heat', 'To argue that trees are useless', 'To explain how air conditioners work', 'To describe the history of one city'], 'To compare different ways cities can reduce heat', 'Teks membahas beberapa cara (pohon, atap putih, air, kombinasi) beserta kelebihan dan keterbatasannya.'),
      mcq(12, 'What do planners increasingly argue?', ['No single measure is enough', 'Trees are the only solution', 'Reflective paint is too expensive', 'Cities cannot be cooled'], 'No single measure is enough', 'Paragraf E: "Planners increasingly argue that no single measure is enough".'),
      g(13, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Which paragraph contains each piece of information? (Paragraphs A-E)',
        matching: {
          left: ['a drawback of a quick solution', 'a comparison with farmland', 'advice from a city official'],
          right: ['A', 'B', 'C', 'D', 'E'],
          allow_reuse: false,
        },
        points: 3,
        correct_answers: [2, 0, 4],
        explanation_id: 'Kekurangan solusi cepat (cat atap memudar): C. Perbandingan dengan lahan pertanian: A. Saran pejabat kota: E.',
      }),
      mcq(14, 'You have spent 2 minutes on one question and still cannot decide. What is the best action?', ['Mark it, make a guess and move on', 'Stay until you are sure', 'Leave it blank', 'Skip the rest of the section'], 'Mark it, make a guess and move on', 'Satu soal bernilai satu poin; menandai, menebak, dan lanjut menghemat waktu untuk soal lain.'),
      mcq(15, 'Which question types are usually the quickest to answer first?', ['Completion and short-answer questions', 'Matching headings', 'Opinion-based multiple choice', 'Questions about the writer\'s purpose'], 'Completion and short-answer questions', 'Completion dan short answer dijawab dengan scanning sehingga biasanya paling cepat.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi urutan alur kerja per teks yang benar.',
        explanation_id: 'Skim dan peta teks, kerjakan soal cepat, lalu soal sulit, dan cek di akhir.',
        segments: ['Skim and make a text map,', 'answer the quick questions,', 'then the difficult ones,', 'and check at the end.'],
      }),
      g(17, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan masalah dengan perbaikannya.',
        explanation_id: 'Kehabisan waktu: triage dan timer. False vs Not Given: periksa kalimat bertentangan. Salah ejaan: cek di akhir.',
        points: 3,
        matching: {
          left: ['running out of time', 'False vs Not Given confusion', 'careless spelling mistakes'],
          right: ['practise triage with a timer', 'check for a contradicting sentence', 'check spelling at the end', 'read the whole text first'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(18, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA hal yang sebaiknya dicatat dalam log kesalahan.',
        explanation_id: 'Tipe soal dan penyebab kesalahan membantu menemukan pola dan prioritas perbaikan. Warna pena atau suasana hati tidak relevan.',
        points: 2,
        options: ['The question type', 'The cause of the mistake', 'The colour of your pen', 'Your mood that day'],
        correct_answers: ['The question type', 'The cause of the mistake'],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA cara yang baik untuk membangun stamina membaca.',
        explanation_id: 'Tes penuh bertimer dan membaca ekstensif melatih ketahanan dan kecepatan. Membaca tanpa timer sekali sebulan atau menghindari soal sulit tidak membantu.',
        points: 2,
        options: ['Do a full timed test every week', 'Read English articles for 20-30 minutes a day', 'Practise only without a timer', 'Avoid the hardest question types'],
        correct_answers: ['Do a full timed test every week', 'Read English articles for 20-30 minutes a day'],
      }),
      fill(20, 'Tulis angka: In the real test, there are ___ questions in total.', ['40', 'forty'], 'Reading IELTS terdiri dari 40 soal dalam 3 teks dan 60 menit.'),
      p2(tfng(21, 'Off-peak members may use the centre on Saturday mornings.', 'False', 'Paragraf A teks 2: anggota off-peak hanya boleh masuk pukul 9 pagi sampai 4 sore, Senin sampai Jumat.')),
      p2(tfng(22, 'The joining fee is returned to members who cancel within the first month.', 'False', 'Paragraf B teks 2: biaya pendaftaran £25 bersifat "non-refundable", jadi tidak dikembalikan.')),
      p2(tfng(23, 'Family membership costs less than two standard memberships.', 'Not Given', 'Teks 2 tidak menyebut harga keanggotaan family maupun standard, jadi tidak bisa dibandingkan.')),
      p2(tfng(24, 'Members who pay for a whole year at once are not charged for one of the months.', 'True', 'Paragraf B teks 2: "Members who pay for a full year in advance receive one month free of charge".')),
      p2(fill(25, 'Class places must be booked at least ___ hours in advance.', ['24', 'twenty-four'], 'Paragraf C teks 2: "booked at least 24 hours in advance".')),
      p2(fill(26, 'Members who want to use a locker should bring their own ___.', ['padlock', 'padlocks'], 'Paragraf D teks 2: "members should bring their own padlock".')),
      p2(g(27, {
        question_type: 'SHORT_ANSWER',
        prompt: 'What must be supplied in order to suspend a membership for medical reasons? (Maximum THREE words)',
        correct_answers: ["a doctor's letter", "doctor's letter", 'a doctors letter', 'doctors letter'],
        max_words: 3,
        explanation_id: 'Paragraf D teks 2: "provided that a doctor\'s letter is supplied".',
      })),
      p2(mcq(28, 'What happens to members who miss three booked classes in one month without cancelling?', ['They cannot book classes for the next four weeks', 'They must pay the joining fee again', 'Their membership is cancelled', 'They are charged £4 for each missed class'], 'They cannot book classes for the next four weeks', 'Paragraf C teks 2: mereka "lose the right to book for the following four weeks".')),
      mcq(29, 'On test day, what is the suggested maximum time to spend on Text 1?', ['17 minutes', '10 minutes', '25 minutes', '30 minutes'], '17 minutes', 'Teks 1 adalah yang termudah; jangan lewat 17 menit agar teks 3 tidak kekurangan waktu.'),
      mcq(30, 'A text says only that sales and temperatures both rose in July. A statement claims that the heat CAUSED the rise in sales. What is the answer?', ['Not Given', 'True', 'False', 'Leave it blank'], 'Not Given', 'Jebakan sebab-akibat tersirat: teks hanya menyebut dua hal terjadi bersamaan, jadi hubungan sebab-akibat itu Not Given.'),
    ],
  },
};

export default sub;
