const P = 'Q-WR331-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'WRITING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 3,
    module_code: '3.3',
    module_category: 'WRITING',
    sub_module_title: 'Task 1 Academic: Analisis Tren Grafik, Perubahan Peta, & Diagram Proses',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Data (fiktif untuk latihan): persentase rumah tangga dengan internet di tiga negara.\n- Negara A: 2000 = 40%, 2010 = 75%, 2020 = 90%\n- Negara B: 2000 = 10%, 2010 = 50%, 2020 = 75%\n- Negara C: 2000 = 5%, 2010 = 15%, 2020 = 35%\n\nTulis dalam bahasa Inggris (sekitar 120 sampai 150 kata):\n1. Introduction: parafrase soal (satu sampai dua kalimat).\n2. Overview: dua fitur utama TANPA angka detail.\n3. Satu paragraf detail yang membandingkan Negara A dan B dengan data.\n\nGunakan Simple Past, minimal tiga kata kerja tren berbeda (rose, grew, climbed...), preposisi by/to/from...to yang benar, dan satu perbandingan (whereas / higher than).',
    ai_rubric_criteria:
      'Task Achievement: introduction memarafrase soal, overview jelas tanpa angka detail dan menyebut fitur utama (semua naik; A tertinggi; B tercepat), detail akurat terhadap data. Coherence: tiga paragraf teratur, penghubung tepat. Lexical Resource: variasi kata tren dan perbandingan, tanpa pengulangan. Grammar: Simple Past konsisten, preposisi by/to/at/from...to tepat, tidak ada opini atau penjelasan sebab di luar data.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'How many words are required for IELTS Writing Task 1, and about how long should you spend?', ['At least 150 words, about 20 minutes', 'At least 250 words, about 20 minutes', 'At least 150 words, about 40 minutes', 'At least 100 words, about 10 minutes'], 'At least 150 words, about 20 minutes', 'Task 1 minimal 150 kata dalam sekitar 20 menit. 250 kata adalah syarat Task 2.'),
      mcq(2, 'Which paragraph structure is recommended for Task 1 Academic?', ['Introduction, Overview, Detail 1, Detail 2', 'Introduction, Opinion, Conclusion', 'Detail, Detail, Conclusion', 'Background, Advantages, Disadvantages'], 'Introduction, Overview, Detail 1, Detail 2', 'Struktur empat paragraf: introduction, overview, dua paragraf detail.'),
      mcq(3, 'What is the MOST serious mistake in Task 1 Academic?', ['Using synonyms', 'Writing no overview', 'Writing 170 words', 'Using the passive'], 'Writing no overview', 'Tanpa overview, Task Achievement umumnya tertahan di sekitar band 5.'),
      mcq(4, 'Which sentence is the best OVERVIEW?', ['In 2020, 90% of households in Country A had internet.', 'Overall, internet access rose in all three countries, with Country A the highest throughout.', 'I think the internet is very useful.', 'Country A rose from 40% to 90%, and B rose from 10% to 75%.'], 'Overall, internet access rose in all three countries, with Country A the highest throughout.', 'Overview menyebut tren besar tanpa angka detail dan tanpa opini.'),
      mcq(5, 'Which verb means a VERY SHARP rise?', ['edge up', 'soar', 'remain steady', 'level off'], 'soar', 'Soar, surge, dan rocket menyatakan kenaikan sangat tajam.'),
      mcq(6, 'Sales rose ___ 20% ___ 35% between 2000 and 2010.', ['from / to', 'by / to', 'at / by', 'to / from'], 'from / to', '"From ... to ..." menyatakan titik awal dan akhir. "By" menyatakan besarnya perubahan.'),
      mcq(7, 'The figure increased ___ 15% (the change was 15 percentage points).', ['by', 'to', 'at', 'from'], 'by', '"By" menyatakan besarnya perubahan; "to" menyatakan level yang dicapai.'),
      mcq(8, 'Which tense should be used for a graph covering 1995 to 2015?', ['Simple Past', 'Simple Present', 'Future simple', 'Present Perfect Continuous'], 'Simple Past', 'Periode yang sudah selesai di masa lampau memakai Simple Past.'),
      mcq(9, 'Which sentence is CORRECT?', ['The number was increased in 2005.', 'The number increased in 2005.', 'The number has been increase in 2005.', 'The number is increase in 2005.'], 'The number increased in 2005.', '"Increase" adalah kata kerja intransitive, sehingga tidak dipasifkan.'),
      mcq(10, 'A process diagram is best described using...', ['Simple Past', 'Simple Present passive with sequence words', 'Future tense', 'Conditionals'], 'Simple Present passive with sequence words', 'Proses umumnya memakai pasif present simple dan penanda urutan seperti First, Then, Finally.'),
      mcq(11, 'Which is a sequence word for a process?', ['Subsequently', 'Whereas', 'Despite', 'Although'], 'Subsequently', 'Subsequently berarti setelah itu. Whereas dan although menyatakan kontras.'),
      mcq(12, 'In a map task, "the farm was converted into a housing estate" describes...', ['a change', 'a trend', 'an opinion', 'a prediction'], 'a change', 'Was converted into menyatakan perubahan fungsi lahan antara dua peta.'),
      fill(13, 'Lengkapi: The figure peaked ___ 80% in 2015. (at / in)', ['at'], '"Peak at" dipakai dengan level puncak.'),
      fill(14, 'Lengkapi: There was a sharp ___ in sales. (rise / rises)', ['rise'], '"There was a sharp rise" memakai kata benda tunggal setelah adjektiva.'),
      fill(15, 'Lengkapi: Prices ___ between 30 and 50 (they went up and down). (fluctuated / fluctuate)', ['fluctuated'], 'Periode lampau memakai Simple Past: fluctuated between.'),
      fill(16, 'Lengkapi dengan kata penghubung kontras: Country A rose, ___ Country C fell.', ['whereas', 'while'], 'Whereas/while membandingkan dua hal yang berlawanan dalam satu kalimat.'),
      fill(17, 'Lengkapi: 25% can be written as a ___ of the total.', ['quarter'], '25% = a quarter; 50% = a half; 75% = three quarters.'),
      g(18, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat overview yang benar.',
        explanation_id: 'Overview: Overall, + fitur utama tanpa angka detail.',
        segments: ['Overall,', 'internet access', 'rose in', 'all three', 'countries.'],
      }),
      g(19, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Tahun 2005 adalah masa lampau, jadi Simple Past: rose. Task 1 tidak mencampur tense tanpa alasan.',
        tokens: ['Sales', 'rises', 'sharply', 'in', '2005.'],
        correct_answers: [1],
      }),
      g(20, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kata tren dengan maknanya.',
        explanation_id: 'Plummet = turun sangat tajam; plateau = mendatar; fluctuate = naik-turun.',
        points: 3,
        matching: {
          left: ['plummet', 'level off', 'fluctuate'],
          right: ['turun sangat tajam', 'mendatar / stabil', 'naik-turun', 'naik tajam'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(21, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA hal yang SEBAIKNYA ada dalam Task 1 Academic.',
        explanation_id: 'Overview dan data pendukung diperlukan. Opini pribadi dan penjelasan sebab yang tidak ada di data tidak diperlukan.',
        points: 2,
        options: ['An overview of the main trends', 'The writer\'s personal opinion', 'Accurate data to support key features', 'An explanation of why the trend happened'],
        correct_answers: ['An overview of the main trends', 'Accurate data to support key features'],
      }),
    ],
  },
};

export default sub;
