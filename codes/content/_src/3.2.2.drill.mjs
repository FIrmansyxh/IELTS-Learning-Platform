const P = 'Q-RD322-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'READING', passage_no: 1, ...rest });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, correct_answers: answers, max_words, explanation_id });
const tfng = (n, prompt, answer, explanation_id) =>
  g(n, { question_type: 'TFNG', prompt, correct_answers: [answer], explanation_id });

const passage = `## Libraries in a Digital Age

[A] When e-books and search engines became widespread, many commentators predicted the end of the public library. Two decades later, libraries have not disappeared, but what they do has changed considerably. Their story is less one of decline than of adaptation.

[B] The most visible change concerns the collections themselves. Lending figures for printed books have fallen in many places, but digital lending has grown steadily. In one regional network, e-books accounted for about 5% of all loans ten years ago and now account for 22%. Librarians report that they spend as much time choosing digital subscriptions as they once spent buying books.

[C] Libraries have also rethought how their buildings are used. Rather than rows of shelves, many now offer study rooms, cafés and "makerspaces" equipped with 3D printers and sewing machines. One city library reported that its visitor numbers rose by a quarter after it was redesigned, and its managers attribute much of the increase to the new study areas.

[D] Staff members have taken on new roles as well. They run language classes, help jobseekers write applications, and teach older residents how to use smartphones and online banking. Because of this work, some librarians describe themselves as guides to information rather than keepers of books.

[E] The picture is not entirely positive. Funding cuts have forced councils to shorten opening hours, and in some rural areas a branch now opens only two days a week. Critics warn that the people most affected are those without internet access at home, who depend on libraries for computers and who often cannot visit during the few hours that remain.

[F] Looking ahead, some councils are testing combined centres in which a library shares a building with a post office or a health clinic. Supporters argue that such centres save money and bring more people through the door. Opponents fear that libraries will lose their identity if they become one service among many.`;

const headings = [
  'A shift from lending books to providing space',
  'Reduced access because of funding limits',
  'The growth of digital lending',
  'Teaching and support for local people',
  'Combining libraries with other services',
  'The history of public libraries',
  'A decline in the number of readers',
  'New technology for children',
];

const passage2 = `## Holbrook's Repair Café

[A] In most households, a broken toaster or a torn jacket goes straight into the bin. In the town of Holbrook, a growing number of residents now take such items to the repair café instead. The café is a free event held on the first Saturday of every month in the community hall, where volunteers with practical skills help visitors mend their belongings.

[B] The idea came from Nora Field, a retired engineer, who was shocked by the number of working appliances she saw at the local recycling centre. She started in 2018 with four volunteers and a single table. The café now has 26 volunteers, including electricians, tailors and a bicycle mechanic, and it regularly attracts more than a hundred visitors in one morning.

[C] Visitors do not simply hand over an item and collect it later. They sit beside the volunteer and take part in the repair, so that they can deal with a similar problem themselves next time. Organisers say this is the main purpose of the café: a mended kettle matters less than the knowledge that its owner takes home.

[D] The results are recorded carefully. Every item is weighed and logged, and last year volunteers fixed 62% of the 1,480 objects brought in, keeping about three tonnes of material out of landfill. Small electrical goods such as lamps and kettles were the most common items, followed by clothing.

[E] Some repairs cannot be done. Many modern products are glued rather than screwed together, and spare parts are often impossible to buy or cost more than a new product. Volunteers are particularly frustrated by printers and mobile phones, which they succeed in fixing less than a third of the time.

[F] The café costs little to run, because the hall is provided free by the council and tools are donated by a local hardware shop. Visitors pay nothing, although most leave a few coins in a jar by the door, and this money is spent on spare parts and insurance. The organisers now hope to open a second café in the neighbouring village of Marsh End, but they will need at least ten new volunteers before they can do so.`;

const headings2 = [
  'Why some items cannot be mended',
  'Funding and plans for expansion',
  'A fall in the number of volunteers',
  'How the project began and grew',
  'Measuring what has been achieved',
  'Complaints from local shops',
  'Learning by repairing together',
  'Rules for visitors with electrical goods',
];

const fill2 = (n, prompt, answers, explanation_id, max_words = 1) => ({ ...fill(n, prompt, answers, explanation_id, max_words), passage_no: 2 });
const tfng2 = (n, prompt, answer, explanation_id) => ({ ...tfng(n, prompt, answer, explanation_id), passage_no: 2 });

const sub = {
  meta: {
    tier_number: 3,
    module_code: '3.2',
    module_category: 'READING',
    sub_module_title: 'Strategi Matching Headings, Matching Information, & Summary Completion',
  },
  mini_task: {
    task_type: 'SELF_CHECK',
    prompt:
      'Latihan mandiri (tanpa penilaian AI). Ambil satu artikel berbahasa Inggris dengan 4 sampai 6 paragraf.\n1. Tanpa membaca isi paragraf secara rinci, baca kalimat pertama dan terakhir tiap paragraf, lalu tulis ide utamanya sebagai judul 3 sampai 6 kata.\n2. Buat 3 pernyataan gaya Matching Information (mis. "an example of...", "a reason for...", "a statistic about...") lalu tulis paragraf yang memuatnya.\n3. Tulis ringkasan 3 kalimat tentang artikel itu, kosongkan 4 kata kunci (satu kata tiap celah), lalu isi ulang besok tanpa melihat teks dan periksa dengan teks aslinya.',
    ai_rubric_criteria:
      'Daftar periksa mandiri: (a) setiap judul mewakili seluruh paragraf, bukan satu detail; (b) judul tidak sekadar menyalin kata dari paragraf; (c) pernyataan Matching Information memakai parafrase; (d) celah ringkasan diisi dengan kata persis dari teks dan memenuhi batas kata; (e) kalimat ringkasan tetap benar secara tata bahasa setelah diisi.',
  },
  drill: {
    time_limit_seconds: 1200,
    passages: [passage, passage2],
    questions: [
      g(1, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Choose the correct heading for each paragraph (B-F) from the list of headings. There are more headings than paragraphs.',
        matching: {
          left: ['Paragraph B', 'Paragraph C', 'Paragraph D', 'Paragraph E', 'Paragraph F'],
          right: headings,
          allow_reuse: false,
        },
        points: 5,
        correct_answers: [2, 0, 3, 1, 4],
        explanation_id: 'B: pinjaman digital naik (The growth of digital lending). C: ruang menggantikan rak (A shift from lending books to providing space). D: kelas bahasa, bantuan pelamar kerja (Teaching and support). E: pemangkasan dana dan jam buka (Reduced access because of funding limits). F: pusat gabungan (Combining libraries with other services). Tiga judul lain adalah pengecoh.',
      }),
      g(2, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Which paragraph contains the following information? (Paragraphs A-F)',
        matching: {
          left: [
            'an example of a service for older people',
            'a statistic about growth in digital borrowing',
            'a warning about people without internet access at home',
            'the opinions of people who support a new kind of centre',
          ],
          right: ['A', 'B', 'C', 'D', 'E', 'F'],
          allow_reuse: false,
        },
        points: 4,
        correct_answers: [3, 1, 4, 5],
        explanation_id: 'Layanan untuk lansia (smartphone dan perbankan daring): D. Statistik 5% ke 22%: B. Peringatan tentang orang tanpa internet di rumah: E. Pendukung pusat gabungan: F.',
      }),
      fill(3, 'Many commentators predicted the end of the public ___ after e-books became widespread. (ONE WORD)', ['library'], 'Paragraf A: "predicted the end of the public library".'),
      fill(4, 'Some libraries now have study rooms, cafes and ___ with 3D printers. (ONE WORD)', ['makerspaces', 'makerspace'], 'Paragraf C: "makerspaces equipped with 3D printers and sewing machines".'),
      fill(5, 'Visitor numbers at one city library rose by a ___ after its redesign. (ONE WORD)', ['quarter'], 'Paragraf C: "rose by a quarter after it was redesigned".'),
      fill(6, 'Library staff help jobseekers write ___. (ONE WORD)', ['applications'], 'Paragraf D: "help jobseekers write applications".'),
      fill(7, 'In some rural areas, a branch now opens only ___ days a week. (ONE WORD OR A NUMBER)', ['two', '2'], 'Paragraf E: "opens only two days a week".'),
      g(8, {
        question_type: 'SHORT_ANSWER',
        prompt: 'Besides a post office, what else might share a building with a library? (Maximum TWO words)',
        correct_answers: ['health clinic', 'clinic'],
        max_words: 2,
        explanation_id: 'Paragraf F: "a library shares a building with a post office or a health clinic".',
      }),
      g(9, {
        question_type: 'MCQ_SINGLE',
        prompt: 'How do some librarians describe their role today?',
        options: ['As guides to information', 'As salespeople for e-books', 'As teachers of every subject', 'As managers of cafes'],
        correct_answers: ['As guides to information'],
        explanation_id: 'Paragraf D: "some librarians describe themselves as guides to information rather than keepers of books".',
      }),
      g(10, {
        question_type: 'MCQ_MULTI',
        prompt: 'Which TWO problems are mentioned in paragraph E?',
        options: [
          'Councils have shortened opening hours.',
          'Libraries have run out of digital subscriptions.',
          'People without internet at home may be affected most.',
          'Staff have refused to teach older residents.',
        ],
        points: 2,
        correct_answers: ['Councils have shortened opening hours.', 'People without internet at home may be affected most.'],
        explanation_id: 'Paragraf E menyebut jam buka dipersingkat dan bahwa orang tanpa internet di rumah paling terdampak. Dua opsi lain tidak ada di teks.',
      }),
      tfng(11, 'E-book loans have completely replaced printed book loans in the regional network.', 'False', 'Paragraf B: e-book 22% dari semua pinjaman, sehingga buku cetak masih dipinjam. "Completely" bertentangan dengan teks.'),
      tfng(12, 'All councils have decided to combine libraries with other services.', 'False', 'Paragraf F: hanya "some councils are testing" pusat gabungan; kata "All" bertentangan.'),
      tfng(13, 'Library staff are paid more than they were ten years ago.', 'Not Given', 'Teks tidak membahas gaji staf.'),
      fill(14, 'In one regional network, e-books now account for ___% of all loans. (A NUMBER)', ['22'], 'Paragraf B: e-book "now account for 22%". Angka 5% adalah angka sepuluh tahun lalu.'),
      tfng(15, 'Managers at one city library believe that the new study areas explain much of the rise in visitor numbers.', 'True', 'Paragraf C: "its managers attribute much of the increase to the new study areas".'),
      tfng(16, 'Makerspaces are more popular with teenagers than with adults.', 'Not Given', 'Paragraf C hanya menyebut makerspace dan isinya. Tidak ada informasi tentang kelompok usia penggunanya.'),
      g(17, {
        question_type: 'MCQ_SINGLE',
        prompt: 'What do opponents of combined centres fear?',
        options: ['Libraries will lose their identity', 'The centres will cost more money', 'Fewer people will come through the door', 'Post offices will have to close'],
        correct_answers: ['Libraries will lose their identity'],
        explanation_id: 'Paragraf F: "Opponents fear that libraries will lose their identity". Hemat biaya dan lebih banyak pengunjung adalah argumen pendukung.',
      }),
      g(18, {
        question_type: 'MATCHING_DROPDOWN',
        passage_no: 2,
        prompt: 'Choose the correct heading for each paragraph (B-F) from the list of headings. There are more headings than paragraphs.',
        matching: {
          left: ['Paragraph B', 'Paragraph C', 'Paragraph D', 'Paragraph E', 'Paragraph F'],
          right: headings2,
          allow_reuse: false,
        },
        points: 5,
        correct_answers: [3, 6, 4, 0, 1],
        explanation_id: 'B: asal ide dan pertumbuhan relawan (How the project began and grew). C: pengunjung ikut memperbaiki supaya bisa sendiri (Learning by repairing together). D: barang ditimbang dan dicatat (Measuring what has been achieved). E: lem dan suku cadang (Why some items cannot be mended). F: biaya dan kafe kedua (Funding and plans for expansion). Tiga judul lain adalah pengecoh.',
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        passage_no: 2,
        prompt: 'Which paragraph contains the following information? (Paragraphs A-F)',
        matching: {
          left: [
            'the kinds of objects that are brought in most often',
            'details of where and when the event takes place',
            'what made the founder decide to start the café',
            'a condition that must be met before a new café can open',
          ],
          right: ['A', 'B', 'C', 'D', 'E', 'F'],
          allow_reuse: false,
        },
        points: 4,
        correct_answers: [3, 0, 1, 5],
        explanation_id: 'Barang yang paling sering dibawa (lampu, ketel, pakaian): D. Tempat dan waktu acara: A. Pendiri terkejut melihat barang di pusat daur ulang: B. Perlu sepuluh relawan baru sebelum kafe kedua dibuka: F.',
      }),
      fill2(20, 'The repair café takes place once a month in the community ___. (ONE WORD)', ['hall'], 'Paragraf A: acara diadakan "in the community hall".'),
      fill2(21, 'Before she retired, Nora Field worked as an ___. (ONE WORD)', ['engineer'], 'Paragraf B: "Nora Field, a retired engineer".'),
      fill2(22, 'Last year the café kept about three ___ of material out of landfill. (ONE WORD)', ['tonnes', 'tonne', 'tons'], 'Paragraf D: "keeping about three tonnes of material out of landfill".'),
      fill2(23, 'Many modern products are ___ together instead of being screwed. (ONE WORD)', ['glued'], 'Paragraf E: "Many modern products are glued rather than screwed together".'),
      fill2(24, 'The money from visitors is spent on spare parts and ___. (ONE WORD)', ['insurance'], 'Paragraf F: "this money is spent on spare parts and insurance".'),
      g(25, {
        question_type: 'SHORT_ANSWER',
        passage_no: 2,
        prompt: 'Which organisation provides the hall free of charge? (Maximum TWO words)',
        correct_answers: ['the council', 'council'],
        max_words: 2,
        explanation_id: 'Paragraf F: "the hall is provided free by the council".',
      }),
      g(26, {
        question_type: 'MCQ_SINGLE',
        passage_no: 2,
        prompt: 'According to the organisers, what is the main purpose of the café?',
        options: ['To teach people to repair things themselves', 'To repair as many items as possible', 'To collect items for the recycling centre', 'To raise money for the council'],
        correct_answers: ['To teach people to repair things themselves'],
        explanation_id: 'Paragraf C: pengunjung ikut memperbaiki supaya bisa mengatasi masalah serupa sendiri, dan "this is the main purpose of the café".',
      }),
      g(27, {
        question_type: 'MCQ_MULTI',
        passage_no: 2,
        prompt: 'Which TWO products do the volunteers find especially hard to repair?',
        options: ['Printers', 'Lamps', 'Mobile phones', 'Kettles'],
        points: 2,
        correct_answers: ['Printers', 'Mobile phones'],
        explanation_id: 'Paragraf E: relawan frustrasi dengan "printers and mobile phones". Lamps dan kettles di paragraf D adalah barang yang paling sering dibawa, bukan yang paling sulit.',
      }),
      tfng2(28, 'The repair café is held every Saturday.', 'False', 'Paragraf A: acara diadakan "on the first Saturday of every month", jadi sebulan sekali, bukan setiap Sabtu.'),
      tfng2(29, 'Volunteers managed to repair more than half of the items brought in last year.', 'True', 'Paragraf D: relawan memperbaiki 62% dari 1.480 barang, yaitu lebih dari separuh.'),
      tfng2(30, 'Nora Field still repairs items at the café herself.', 'Not Given', 'Paragraf B hanya menyebut bahwa ide dan awal kafe berasal dari Nora Field. Teks tidak menyebut apakah ia masih ikut memperbaiki barang.'),
    ],
  },
};

export default sub;
