const P = 'Q-GR112-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'GRAMMAR', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words: 1 });

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.3',
    module_category: 'GRAMMAR',
    sub_module_title: 'Present Simple vs. Present Continuous',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis paragraf pendek (sekitar 80 sampai 100 kata) dalam bahasa Inggris tentang dirimu.\n\nDalam paragrafmu:\n- jelaskan rutinitas harianmu (Present Simple, minimal 4 kalimat dengan adverbia frekuensi seperti usually, often, never)\n- ceritakan apa yang sedang kamu lakukan akhir-akhir ini atau saat ini (Present Continuous, minimal 3 kalimat dengan penanda seperti these days, at the moment, this month)\n- gunakan setidaknya satu kalimat negatif dan satu kata kerja state (know, like, want, need)',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: Present Simple dipakai untuk kebiasaan dengan -s/-es yang benar pada he/she/it; Present Continuous dipakai untuk situasi sekarang/sementara dengan am/is/are + V-ing yang benar; tidak ada bentuk campuran seperti "am go" atau "is work"; kata kerja state tidak memakai -ing. Task Achievement: kedua bagian (rutinitas dan situasi sekarang) tercakup, minimal satu kalimat negatif. Lexical Resource dan Coherence: kosakata sesuai dan kalimat terhubung wajar.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'My brother ___ in a hospital. He is a nurse.', ['works', 'work', 'is work', 'working'], 'works', 'Pekerjaan tetap = Present Simple. Subjek he/she/it menambah -s pada kata kerja: works.'),
      mcq(2, 'Look! The baby ___ on the sofa.', ['sleeps', 'is sleeping', 'sleep', 'does sleeping'], 'is sleeping', '"Look!" menandai kejadian yang sedang berlangsung sekarang, jadi Present Continuous: is + V-ing.'),
      mcq(3, 'She ___ like spicy food.', ['don\'t', 'doesn\'t', 'isn\'t', 'not'], 'doesn\'t', 'Subjek she memakai does. Negatif Present Simple: does not (doesn\'t) + V1.'),
      mcq(4, '___ your parents live in Jakarta?', ['Do', 'Does', 'Are', 'Is'], 'Do', 'Subjek jamak (your parents) memakai do. Tanya Present Simple: Do/Does + S + V1.'),
      mcq(5, 'I ___ the answer to your question.', ['am knowing', 'know', 'knowing', 'am know'], 'know', '"Know" adalah kata kerja state (keadaan pikiran) sehingga tidak dipakai dalam bentuk -ing.'),
      mcq(6, 'Pilih kalimat dengan posisi adverbia yang benar.', ['She is always late for class.', 'She always is late for class.', 'Always she is late for class.', 'She is late always for class.'], 'She is always late for class.', 'Adverbia frekuensi diletakkan SESUDAH to be (is always) dan SEBELUM kata kerja biasa (always arrives).'),
      mcq(7, 'The number of online shoppers ___ steadily this year. (tren yang sedang berlangsung)', ['increases', 'is increasing', 'increase', 'are increasing'], 'is increasing', 'Perubahan atau tren yang sedang berlangsung memakai Present Continuous. Subjek "the number" tunggal, jadi is increasing.'),
      mcq(8, 'Which sentence describes a TEMPORARY situation?', ['I live with my parents.', 'I am living with my cousin this month.', 'I lived with my aunt.', 'I will live with my uncle.'], 'I am living with my cousin this month.', 'Situasi sementara ("this month") memakai Present Continuous. Present Simple menyatakan keadaan permanen.'),
      fill(9, 'Lengkapi dengan bentuk yang benar dari "go": He ___ to the gym every morning.', ['goes'], 'Kebiasaan + subjek he: go + es = goes (kata kerja berakhiran -o mendapat -es).'),
      fill(10, 'Lengkapi dengan bentuk yang benar dari "play": The children are ___ football in the park right now.', ['playing'], '"Right now" = Present Continuous: are + V-ing. Kata kerja berakhiran vokal + y cukup ditambah -ing: playing.'),
      fill(11, 'Lengkapi dengan bentuk yang benar dari "run": She is ___ in the park at the moment.', ['running'], 'Suku kata tunggal dengan pola konsonan-vokal-konsonan menggandakan konsonan akhir sebelum -ing: run -> running.'),
      fill(12, 'Lengkapi dengan bentuk yang benar dari "study": My sister ___ medicine at a university in Bandung.', ['studies'], 'Konsonan + y berubah menjadi -ies untuk he/she/it: study -> studies.'),
      g(13, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi pertanyaan yang benar.',
        explanation_id: 'Tanya Present Simple: Does + subjek + V1 + keterangan. Setelah does, kata kerja kembali ke bentuk dasar (play, bukan plays).',
        segments: ['Does', 'your brother', 'play', 'tennis', 'on Sundays?'],
      }),
      g(14, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat negatif Present Continuous yang benar.',
        explanation_id: 'Negatif Present Continuous: S + am/is/are + not + V-ing + keterangan.',
        segments: ['She', 'is not', 'watching', 'TV', 'at the moment.'],
      }),
      g(15, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Subjek she membutuhkan doesn\'t, bukan don\'t.',
        tokens: ['She', 'don\'t', 'like', 'coffee', 'in', 'the', 'morning.'],
        correct_answers: [1],
      }),
      g(16, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: '"Know" adalah kata kerja state; tidak dipakai dalam bentuk -ing. Seharusnya: I know your brother very well.',
        tokens: ['I', 'am', 'knowing', 'your', 'brother', 'very', 'well.'],
        correct_answers: [2],
      }),
      g(17, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kalimat dengan fungsi tense-nya.',
        explanation_id: 'Fakta umum = Present Simple; "Look! It is raining" = sedang terjadi = Present Continuous; "this month" = situasi sementara = Present Continuous.',
        points: 3,
        matching: {
          left: ['Water boils at 100 degrees Celsius.', 'Look! It is raining.', 'I am staying with my aunt this month.'],
          right: ['Present Simple: fakta umum', 'Present Continuous: sedang terjadi', 'Present Continuous: situasi sementara', 'Present Simple: jadwal'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(18, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'Like dan want adalah kata kerja state sehingga tidak berbentuk -ing. "Have" bermakna memiliki (state) tetap Simple, tetapi bermakna makan (aksi) boleh Continuous: is having lunch.',
        points: 2,
        options: ['I am liking this song.', 'She has a new laptop.', 'They are wanting more time.', 'He is having lunch now.'],
        correct_answers: ['She has a new laptop.', 'He is having lunch now.'],
      }),
      mcq(19, 'The train to Bandung ___ at 8.15 every morning.', ['leaves', 'leave', 'is leave', 'leaving'], 'leaves', 'Jadwal tetap memakai Present Simple. Subjek "the train" (it) menambah -s: leaves.'),
      mcq(20, 'He ___ his keys! It is so annoying.', ['is always losing', 'always is losing', 'always lose', 'is always lose'], 'is always losing', 'Keluhan tentang kebiasaan yang mengganggu memakai Present Continuous + always: is always losing.'),
      mcq(21, 'Pilih pertanyaan yang benar.', ['Do you are ready?', 'Are you ready?', 'Does you ready?', 'Do you ready?'], 'Are you ready?', 'To be tidak memakai do/does. Untuk bertanya, cukup balik posisi: Are + you + complement?'),
      mcq(22, 'We ___ the manager tomorrow at 10. Everything is already arranged.', ['are meeting', 'meets', 'are meet', 'meeting'], 'are meeting', 'Rencana dekat yang sudah diatur memakai Present Continuous: are + V-ing dengan keterangan waktu.'),
      mcq(23, 'How often ___ he visit his grandparents?', ['do', 'does', 'is', 'are'], 'does', 'Tanya Present Simple dengan subjek he memakai does: How often does he + V1?'),
      mcq(24, 'Which sentence is CORRECT?', ['I am agree with you.', 'I agree with you.', 'I agreeing with you.', 'I agrees with you.'], 'I agree with you.', '"Agree" sudah kata kerja, jadi tidak ditambah am. Subjek I memakai V1 tanpa -s.'),
      mcq(25, 'I ___ it is a good idea. (pendapat)', ['am thinking', 'think', 'thinking', 'am think'], 'think', '"Think" bermakna pendapat adalah kata kerja state, jadi memakai Present Simple: I think.'),
      fill(26, 'Lengkapi dengan bentuk yang benar dari "write": I am ___ an email to my landlord right now.', ['writing'], 'Kata kerja berakhiran -e kehilangan e sebelum -ing: write -> writing.'),
      fill(27, 'Lengkapi dengan bentuk yang benar dari "watch": My father ___ the news every evening.', ['watches'], 'Kebiasaan + subjek he. Kata kerja berakhiran -ch mendapat -es: watch -> watches.'),
      fill(28, 'Lengkapi dengan bentuk yang benar dari "have": She ___ two brothers and a sister.', ['has'], 'Kepemilikan = Present Simple. Bentuk he/she/it dari have tidak beraturan: has.'),
      fill(29, 'Lengkapi dengan bentuk yang benar dari "lie": The cat is ___ on the sofa at the moment.', ['lying'], 'Kata kerja berakhiran -ie berubah menjadi -ying: lie -> lying.'),
      g(30, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Setelah doesn\'t kata kerja kembali ke bentuk dasar: like, bukan likes.',
        tokens: ['He', 'doesn\'t', 'likes', 'spicy', 'food', 'at', 'all.'],
        correct_answers: [2],
      }),
    ],
  },
};

export default sub;
