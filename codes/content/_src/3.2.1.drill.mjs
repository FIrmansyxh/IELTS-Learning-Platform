const P = 'Q-RD321-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'READING', passage_no: 1, ...rest });
const tfng = (n, prompt, answer, explanation_id) =>
  g(n, { question_type: 'TFNG', prompt, correct_answers: [answer], explanation_id });
const ynng = (n, prompt, answer, explanation_id) =>
  g(n, { question_type: 'YNNG', passage_no: 2, prompt, correct_answers: [answer], explanation_id });

const passage1 = `## Walking to School: A Small Town's Experiment

[A] Over the past three decades, the share of children who walk to school has fallen in many countries. Parents cite busy roads, tight morning schedules and fears about safety, and the result is a daily queue of cars outside school gates. In 2016, a primary school in the coastal town of Marlow Bay decided to try a different approach. It introduced a "walking bus", a scheme in which groups of children travel to school on foot along fixed routes, led by adult volunteers.

[B] The scheme began modestly, with three routes and 41 children. Each route has several stops where children join the group, and every group is accompanied by at least two adults. The volunteers include parents and retired residents of the town, and none of them is paid. The council provided high-visibility vests for the children and funds a coordinator, who works twelve hours a week arranging timetables and training new volunteers. By its second year the scheme had grown to nine routes, serving 187 of the school's 410 pupils.

[C] A research team from a nearby university studied the scheme over its first two years. Before it began, only 12% of pupils walked to school; after two years, the figure had risen to 46%. Counts taken outside the school gate during the morning drop-off showed that the number of cars had fallen by about a third. The researchers also looked for evidence that traffic had simply moved to neighbouring streets, but they found none.

[D] The effects on the children themselves were harder to measure. Pupils who joined the scheme took, on average, about 2,500 more steps a day than those who did not. Teachers reported that these pupils arrived at class more alert, but the researchers point out that this impression comes from teachers' reports and was not measured by any test. They therefore describe the finding as encouraging rather than proven.

[E] Not everyone was convinced at the start. Some parents were worried about the safety of children walking in groups, and a few felt that supervising other people's children was too great a responsibility for volunteers. The school responded by requiring all volunteers to complete safety training and by publishing the route plans online so that parents could see exactly where each group would walk.

[F] The researchers are careful not to claim that the walking bus would work everywhere. It succeeds best in compact neighbourhoods; children who live more than two kilometres from the school rarely joined, and participation in winter dropped by about a fifth. The team now plans to follow the same pupils for a further three years to see whether the habit of walking lasts as they grow older.`;

const passage2 = `## Is Handwriting Still Worth Teaching?

For several years, many schools have reduced the time they spend on handwriting. The argument is simple: children will type for most of their adult lives, so why teach a skill that the keyboard has made old-fashioned? I find this reasoning too hasty.

Typing is undeniably faster, and no sensible teacher should deny pupils the chance to learn it. Yet when students take notes by hand, they are forced to select and summarise, because nobody can write as fast as a lecturer speaks. That effort of choosing, I believe, is exactly what helps ideas stay in the mind. Several small studies point in the same direction, although they involve too few students to be conclusive.

I would therefore not abolish handwriting but shorten it: ten minutes a day would be enough to keep the skill alive. Critics may say that even this is a waste of time. I disagree. A child who can write legibly by hand is rarely left helpless when a battery dies, and the habit of slowing down to think is hard to teach in any other way.`;

const passage3 = `## Riverside Community Garden: Information for New Members

Welcome to Riverside Community Garden. The garden was opened in 2012 on land that used to be a car park, and it now has 64 plots that are rented to local residents.

**Plots and fees.** A full plot costs £45 a year and a half plot costs £25. Fees are due on 1 March. Members who are over 65 or who are full-time students pay half the normal fee. Because demand is high, each household may rent only one plot, and new applicants usually wait about eight months before a plot becomes free.

**Opening hours.** Members may enter the garden at any time between 7 a.m. and sunset, using the code for the main gate. The code is changed every three months and is sent to members by email. Please do not share it with non-members. Visitors are welcome, but they must be accompanied by a member at all times.

**Tools and water.** Spades, forks and watering cans are kept in the green shed and are free to borrow, but they must be cleaned and returned on the same day. Members must bring their own gloves. Water comes from six taps around the site. Hosepipes may be used before 9 a.m. and after 6 p.m. only; at other times, please use a watering can.

**What you may grow.** Members may grow vegetables, fruit, herbs and flowers. Trees are not allowed because they shade neighbouring plots. Produce is for members' own use and must not be sold, although surplus vegetables may be left in the sharing box by the gate for anyone to take.

**Keeping your plot.** The committee inspects all plots in April and September. If a plot has been left uncultivated, the member receives a written warning and has four weeks to improve it. After that, the plot may be offered to the next person on the waiting list.`;

const sub = {
  meta: {
    tier_number: 3,
    module_code: '3.2',
    module_category: 'READING',
    sub_module_title: 'Taktik True / False / Not Given & Yes / No / Not Given',
  },
  mini_task: {
    task_type: 'SELF_CHECK',
    prompt:
      'Latihan mandiri (tanpa penilaian AI). Ambil satu paragraf berbahasa Inggris (berita, artikel, atau buku) sepanjang 100 sampai 150 kata. Lalu:\n1. Tulis 6 pernyataan: 2 yang True, 2 yang False (bertentangan dengan teks), dan 2 yang Not Given (masuk akal tetapi tidak disebut).\n2. Untuk setiap pernyataan, tulis kutipan teks yang menjadi buktinya (untuk True/False) atau catat "tidak ada informasi" (untuk Not Given).\n3. Tukar dengan teman atau kerjakan lagi esok hari tanpa melihat kunci, lalu periksa: apakah kamu bisa membedakan False dari Not Given?',
    ai_rubric_criteria:
      'Daftar periksa mandiri: (a) setiap pernyataan True/False punya kutipan bukti; (b) pernyataan False benar-benar bertentangan, bukan sekadar tidak disebut; (c) pernyataan Not Given benar-benar tidak punya informasi; (d) pernyataan memakai parafrase, bukan menyalin teks; (e) minimal satu pernyataan memakai kata mutlak atau kuantitas sebagai jebakan.',
  },
  drill: {
    time_limit_seconds: 1200,
    passages: [passage1, passage2, passage3],
    questions: [
      tfng(1, 'The walking bus began with more routes than it had two years later.', 'False', 'Paragraf B: mulai dengan tiga rute dan pada tahun kedua menjadi sembilan rute. Jadi di awal rutenya lebih sedikit, bukan lebih banyak.'),
      tfng(2, 'The proportion of pupils walking to school more than tripled during the study period.', 'True', 'Paragraf C: 12% naik menjadi 46%. 46 dibagi 12 sekitar 3,8, jadi lebih dari tiga kali lipat.'),
      tfng(3, 'The researchers found that car traffic had moved to the streets near the school.', 'False', 'Paragraf C: peneliti mencari bukti bahwa lalu lintas berpindah ke jalan sekitar "but they found none". Teks bertentangan langsung.'),
      tfng(4, 'Most of the children who joined the scheme came from low-income families.', 'Not Given', 'Teks tidak menyebut latar ekonomi keluarga anak-anak di mana pun.'),
      tfng(5, 'Retired residents are among the volunteers.', 'True', 'Paragraf B: "The volunteers include parents and retired residents".'),
      tfng(6, 'The coordinator works full time.', 'False', 'Paragraf B: koordinator bekerja "twelve hours a week", bukan penuh waktu.'),
      tfng(7, 'The scheme will be introduced in other towns next year.', 'Not Given', 'Teks tidak membahas rencana memperluas program ke kota lain. Rencana yang disebut hanya menindaklanjuti murid yang sama (paragraf F).'),
      tfng(8, 'Fewer children took part in the scheme in winter than at other times of year.', 'True', 'Paragraf F: "participation in winter dropped by about a fifth".'),
      tfng(9, 'The researchers say the walking bus would succeed in any neighbourhood.', 'False', 'Paragraf F: peneliti berhati-hati untuk tidak mengklaim bahwa program ini akan berhasil di mana-mana; paling berhasil di lingkungan yang padat.'),
      tfng(10, 'Children who joined the scheme achieved better exam results.', 'Not Given', 'Paragraf D hanya menyebut guru melaporkan murid lebih waspada (bukan diukur dengan tes). Tidak ada informasi hasil ujian.'),
      g(11, {
        question_type: 'MCQ_SINGLE',
        prompt: 'What do the researchers say about the teachers\' reports that pupils arrived more alert?',
        options: [
          'The reports were confirmed by tests.',
          'The reports come from teachers, were not measured by a test, and make the finding encouraging rather than proven.',
          'The reports prove that walking improves learning.',
          'The reports were ignored in the study.',
        ],
        correct_answers: ['The reports come from teachers, were not measured by a test, and make the finding encouraging rather than proven.'],
        explanation_id: 'Paragraf D: kesan itu berasal dari laporan guru, tidak diukur dengan tes, sehingga dinilai "encouraging rather than proven".',
      }),
      g(12, {
        question_type: 'MCQ_SINGLE',
        prompt: 'How did the school respond to parents\' worries about safety?',
        options: [
          'It stopped the scheme in winter.',
          'It hired paid supervisors.',
          'It required safety training for volunteers and published the route plans online.',
          'It limited the scheme to children under seven.',
        ],
        correct_answers: ['It required safety training for volunteers and published the route plans online.'],
        explanation_id: 'Paragraf E: sekolah mewajibkan pelatihan keselamatan bagi relawan dan menerbitkan rencana rute secara daring.',
      }),
      g(13, {
        question_type: 'SHORT_ANSWER',
        prompt: 'Who funds the coordinator? (Maximum TWO words)',
        correct_answers: ['the council', 'council'],
        max_words: 2,
        explanation_id: 'Paragraf B: "The council provided ... and funds a coordinator".',
      }),
      g(14, {
        question_type: 'FILL_IN_BLANK',
        prompt: 'The researchers plan to follow the same pupils for a further ___ years. (ONE word)',
        correct_answers: ['three', '3'],
        max_words: 1,
        explanation_id: 'Paragraf F: "follow the same pupils for a further three years".',
      }),
      g(15, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Which paragraph contains each piece of information? (Paragraphs A-F)',
        matching: {
          left: [
            'The number of cars outside the school fell by about a third.',
            'Some parents had doubts about safety.',
            'The scheme works best in compact neighbourhoods.',
            'Pupils took more steps each day.',
          ],
          right: ['A', 'B', 'C', 'D', 'E', 'F'],
          allow_reuse: false,
        },
        points: 4,
        correct_answers: [2, 4, 5, 3],
        explanation_id: 'Mobil berkurang sepertiga: C. Orang tua ragu soal keselamatan: E. Berhasil di lingkungan padat: F. Langkah harian bertambah: D.',
      }),
      ynng(16, 'The writer believes that taking notes by hand can help people remember ideas.', 'Yes', 'Paragraf 2: "That effort of choosing, I believe, is exactly what helps ideas stay in the mind." Penulis menyatakan keyakinannya.'),
      ynng(17, 'The writer thinks schools should stop teaching typing.', 'No', 'Paragraf 2: "no sensible teacher should deny pupils the chance to learn it" menolak gagasan itu.'),
      ynng(18, 'The writer states that employers prefer applicants with neat handwriting.', 'Not Given', 'Penulis tidak membahas preferensi pemberi kerja.'),
      ynng(19, 'The writer is certain that the studies prove his argument.', 'No', 'Paragraf 2: studi itu "involve too few students to be conclusive", jadi penulis tidak menganggapnya pasti.'),
      ynng(20, 'The writer thinks that a short daily handwriting session is sufficient.', 'Yes', 'Paragraf 3: "ten minutes a day would be enough to keep the skill alive". Penulis menganggap sesi singkat sudah cukup.'),
      ynng(21, 'The writer believes that children should learn handwriting before they learn to type.', 'Not Given', 'Penulis mendukung keduanya, tetapi tidak pernah membahas mana yang harus diajarkan lebih dulu.'),
      g(22, { question_type: 'TFNG', passage_no: 3, prompt: 'The garden was created on a site that had previously been used for parking.', correct_answers: ['True'], explanation_id: 'Paragraf 1: taman dibuka "on land that used to be a car park". Pernyataan adalah parafrase kalimat itu.' }),
      g(23, { question_type: 'TFNG', passage_no: 3, prompt: 'A full-time student pays £45 a year for a full plot.', correct_answers: ['False'], explanation_id: 'Bagian "Plots and fees": mahasiswa penuh waktu "pay half the normal fee", jadi bukan £45.' }),
      g(24, { question_type: 'TFNG', passage_no: 3, prompt: 'Members receive a new gate code four times a year.', correct_answers: ['True'], explanation_id: 'Bagian "Opening hours": kode diganti "every three months" dan dikirim ke anggota. Setiap tiga bulan sama dengan empat kali setahun.' }),
      g(25, { question_type: 'TFNG', passage_no: 3, prompt: 'Children under twelve are not allowed to enter the garden.', correct_answers: ['Not Given'], explanation_id: 'Teks hanya mengatur bahwa pengunjung harus didampingi anggota. Tidak ada informasi tentang batas usia.' }),
      g(26, { question_type: 'TFNG', passage_no: 3, prompt: 'Gloves can be borrowed from the green shed.', correct_answers: ['False'], explanation_id: 'Bagian "Tools and water": yang bisa dipinjam adalah spades, forks, dan watering cans, sedangkan "Members must bring their own gloves".' }),
      g(27, { question_type: 'TFNG', passage_no: 3, prompt: 'Most members choose to grow vegetables rather than flowers.', correct_answers: ['Not Given'], explanation_id: 'Teks menyebut apa saja yang boleh ditanam, tetapi tidak menyebut tanaman mana yang paling banyak dipilih anggota.' }),
      g(28, {
        question_type: 'MCQ_SINGLE',
        passage_no: 3,
        prompt: 'When are members allowed to use a hosepipe?',
        options: [
          'At any time between 7 a.m. and sunset.',
          'Only between 9 a.m. and 6 p.m.',
          'Only before 9 a.m. and after 6 p.m.',
          'Only in April and September.',
        ],
        correct_answers: ['Only before 9 a.m. and after 6 p.m.'],
        explanation_id: 'Bagian "Tools and water": "Hosepipes may be used before 9 a.m. and after 6 p.m. only". Pukul 7 a.m. sampai sunset adalah jam masuk taman.',
      }),
      g(29, {
        question_type: 'SHORT_ANSWER',
        passage_no: 3,
        prompt: 'Where can members leave vegetables that they do not need? (Maximum THREE words)',
        correct_answers: ['the sharing box', 'sharing box'],
        max_words: 3,
        explanation_id: 'Bagian "What you may grow": "surplus vegetables may be left in the sharing box by the gate".',
      }),
      g(30, {
        question_type: 'FILL_IN_BLANK',
        passage_no: 3,
        prompt: 'After a written warning, a member has ___ weeks to improve the plot. (ONE word)',
        correct_answers: ['four', '4'],
        max_words: 1,
        explanation_id: 'Bagian "Keeping your plot": anggota "has four weeks to improve it".',
      }),
    ],
  },
};

export default sub;
