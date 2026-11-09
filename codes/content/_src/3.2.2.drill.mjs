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
    passages: [passage],
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
    ],
  },
};

export default sub;
