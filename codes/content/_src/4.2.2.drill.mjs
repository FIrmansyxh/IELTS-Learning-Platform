const P = 'Q-WR422-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'WRITING', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 4,
    module_code: '4.2',
    module_category: 'WRITING',
    sub_module_title: 'Advanced Cohesion (Transisi Antar-Ide Tanpa Linking Words yang Kaku)',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis ulang paragraf mekanis berikut menjadi paragraf yang kohesif dalam bahasa Inggris (sekitar 100 sampai 130 kata) TANPA memakai Firstly, Secondly, Moreover, atau Furthermore.\n\nParagraf asli: "Firstly, many people drive cars. Moreover, cars cause pollution. Furthermore, pollution is bad for health. Secondly, cars cause traffic. Moreover, traffic wastes time. In conclusion, governments should reduce cars."\n\nWajib memakai: minimal 2 ringkasan noun (this trend, such measures, this problem), minimal 2 struktur kontras/sebab (While..., Although..., which..., leading to...), minimal 1 substitusi atau rujukan (others, the latter, it), serta rantai leksikal (pollution, emissions, air quality). Pastikan setiap this/it jelas merujuk pada apa.',
    ai_rubric_criteria:
      'Coherence and Cohesion: kohesi dibangun lewat rujukan, ringkasan noun, substitusi, lexical chain, dan struktur kalimat (bukan daftar penghubung); informasi mengalir lama ke baru; this/it jelas merujuk. Lexical Resource: sinonim dan kata terkait bervariasi. Grammar: struktur kontras dan sebab akurat, tanda baca (titik koma/koma) tepat. Task Achievement: makna paragraf asli dipertahankan dan kesimpulan jelas. Penggunaan Firstly/Secondly/Moreover berlebihan membatasi skor.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which version has more natural cohesion? (1) "Fewer people read newspapers. Moreover, fewer people buy magazines." (2) "Fewer people read newspapers. This trend extends to magazines."', ['Version 2', 'Version 1', 'Both are equally natural', 'Neither is acceptable'], 'Version 2', 'Ringkasan noun (This trend) menghubungkan ide secara halus tanpa penghubung yang dipaksakan.'),
      mcq(2, 'Which noun phrase best summarises the idea: "The government banned plastic bags. ___ reduced waste."', ['This measure', 'This is', 'It was', 'That thing'], 'This measure', '"This measure" adalah ringkasan noun yang jelas dan akademik.'),
      mcq(3, 'Why is "This is bad." a weak sentence in an essay?', ['"This" does not clearly refer to a specific idea', 'It is too long', 'It has a spelling mistake', 'It uses the wrong tense'], '"This" does not clearly refer to a specific idea', '"This" tanpa noun menimbulkan rujukan ambigu; gunakan "This trend is harmful."'),
      mcq(4, 'Which sentence uses structure instead of a linking word to show contrast?', ['While cars are convenient, they pollute.', 'Cars are convenient. However, they pollute.', 'Cars are convenient. On the other hand, they pollute.', 'Cars are convenient. But they pollute.'], 'While cars are convenient, they pollute.', 'Klausa dengan while menyatakan kontras lewat struktur kalimat, bukan penghubung antar-kalimat.'),
      mcq(5, 'Which is a lexical chain for the topic "pollution"?', ['pollution, emissions, smog, air quality', 'pollution, football, music, cooking', 'pollution, however, therefore, moreover', 'pollution, pollution, pollution, pollution'], 'pollution, emissions, smog, air quality', 'Rantai leksikal memakai sinonim dan kata terkait agar topik terhubung tanpa pengulangan.'),
      mcq(6, 'Which problem do Firstly, Secondly, Thirdly in every paragraph cause?', ['The essay looks mechanical and memorised', 'The essay becomes too formal', 'The essay becomes too short', 'The essay loses tense accuracy'], 'The essay looks mechanical and memorised', 'Penghubung berulang terlihat mekanis dan dihafal.'),
      mcq(7, 'What does "the latter" refer to in: "Cars and trains are popular. The latter is cheaper."?', ['trains', 'cars', 'both', 'neither'], 'trains', '"The latter" merujuk pada hal yang disebut terakhir: trains.'),
      mcq(8, 'Which punctuation mark can join two closely related clauses?', ['A semicolon', 'A question mark', 'An apostrophe', 'A hyphen'], 'A semicolon', 'Titik koma menghubungkan dua klausa lengkap yang berkaitan.'),
      mcq(9, 'Which sentence follows the given-new pattern best? (sentence 1: "Many cities have introduced congestion charges.")', ['These charges reduce traffic but raise costs for small businesses.', 'Pollution is a serious issue for everyone.', 'Many people like football.', 'Cities are big.'], 'These charges reduce traffic but raise costs for small businesses.', 'Kalimat kedua memulai dengan informasi lama (These charges) dari akhir kalimat pertama, lalu menambah informasi baru.'),
      mcq(10, 'What is the best way to check cohesion in your essay?', ['Underline all linking words and replace some with references, summarising nouns and structure', 'Add a linking word to every sentence', 'Remove all pronouns', 'Use the same word repeatedly'], 'Underline all linking words and replace some with references, summarising nouns and structure', 'Cara cepat memeriksa kohesi: kurangi penghubung berlebihan dan ganti dengan rujukan, ringkasan noun, dan struktur.'),
      fill(11, 'Lengkapi dengan ringkasan noun: Obesity is rising. This ___ places pressure on hospitals.', ['trend', 'issue', 'problem', 'phenomenon', 'development'], 'Trend, issue, problem, phenomenon, atau development adalah ringkasan noun yang cocok.'),
      fill(12, 'Lengkapi dengan kata substitusi: Some prefer cars; ___ prefer trains.', ['others'], 'Substitusi: some ... others.'),
      fill(13, 'Lengkapi dengan kata rujukan: ___ measures are controversial.', ['Such', 'such'], '"Such measures" merujuk pada jenis tindakan yang baru disebut.'),
      fill(14, 'Lengkapi dengan kata pengganti tindakan: Governments should act, and many have done ___.', ['so'], '"Do so" menggantikan tindakan yang sudah disebut.'),
      fill(15, 'Lengkapi dengan penghubung kontras: ___ cities offer jobs, housing is expensive.', ['Although', 'While', 'Whilst'], 'Although/while memperkenalkan kontras dalam satu kalimat.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang kohesif.',
        explanation_id: 'Pola: klausa kontras dengan while diikuti klausa utama.',
        segments: ['While cars', 'are convenient,', 'they contribute significantly', 'to air pollution.'],
      }),
      g(17, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat dengan ringkasan noun.',
        explanation_id: 'Pola: This + noun ringkasan + kata kerja + akibat.',
        segments: ['This trend', 'shows no sign', 'of', 'reversing.'],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang membuat rujukan ambigu.',
        explanation_id: '"This" berdiri sendiri tanpa noun sehingga tidak jelas merujuk apa; gunakan "This trend".',
        tokens: ['Prices', 'rose', 'sharply.', 'This', 'is', 'harmful.'],
        correct_answers: [3],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan alat kohesi dengan contohnya.',
        explanation_id: 'This trend = ringkasan noun; others = substitusi; While... = struktur kontras.',
        points: 3,
        matching: {
          left: ['summarising noun', 'substitution', 'contrast structure'],
          right: ['This trend shows no sign of reversing.', 'Some prefer cars; others prefer trains.', 'While cars are convenient, they pollute.', 'Firstly, cars are cheap.'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA cara membangun kohesi tanpa linking word.',
        explanation_id: 'Ringkasan noun dan lexical chain menghubungkan ide tanpa penghubung. Menambah Moreover di tiap kalimat dan mengulang kata sama merugikan.',
        points: 2,
        options: ['Use summarising nouns such as "this trend"', 'Use synonyms and related words (lexical chain)', 'Start every sentence with "Moreover"', 'Repeat the same word in every sentence'],
        correct_answers: ['Use summarising nouns such as "this trend"', 'Use synonyms and related words (lexical chain)'],
      }),
      mcq(21, 'What is the difference between cohesion and coherence?', ['Cohesion is the language that links sentences; coherence is the overall logic of the ideas', 'Cohesion is about spelling; coherence is about punctuation', 'Cohesion is for speaking; coherence is for writing', 'There is no difference between them'], 'Cohesion is the language that links sentences; coherence is the overall logic of the ideas', 'Cohesion = alat bahasa yang menautkan kalimat; coherence = logika dan kejelasan keseluruhan.'),
      mcq(22, 'Which option shows cause and effect through sentence structure rather than a linking word?', ['Prices rose, which reduced demand.', 'Prices rose. As a result, demand fell.', 'Prices rose. Therefore, demand fell.', 'Prices rose. Consequently, demand fell.'], 'Prices rose, which reduced demand.', 'Klausa dengan "which" menyatakan akibat lewat struktur kalimat, tanpa penghubung antarkalimat.'),
      mcq(23, 'What does "the former" refer to in: "Buses and taxis are both available. The former are far cheaper."?', ['buses', 'taxis', 'both buses and taxis', 'neither'], 'buses', '"The former" merujuk pada hal yang disebut pertama: buses.'),
      mcq(24, 'Which punctuation mark introduces an explanation or a list, as in "There are two main causes___ poverty and poor education"?', ['A colon', 'A semicolon', 'An apostrophe', 'A hyphen'], 'A colon', 'Titik dua memperkenalkan penjelasan atau daftar; titik koma menghubungkan dua klausa lengkap.'),
      mcq(25, 'Which sentence contains a comma splice?', ['Cars are convenient, public transport is cheaper.', 'Cars are convenient; public transport is cheaper.', 'Cars are convenient, but public transport is cheaper.', 'While cars are convenient, public transport is cheaper.'], 'Cars are convenient, public transport is cheaper.', 'Comma splice = dua kalimat utuh yang hanya disambung koma; perbaiki dengan titik koma atau konjungsi.'),
      fill(26, 'Lengkapi dengan ringkasan noun: The council banned cars in the centre. This ___ has reduced noise.', ['approach', 'policy', 'measure', 'strategy', 'decision', 'change', 'ban', 'move', 'step'], 'Approach, policy, atau measure merangkum tindakan pada kalimat sebelumnya.'),
      fill(27, 'Lengkapi dengan pronoun yang merujuk pada the policy: The policy was introduced in 2015. ___ has since been revised.', ['It', 'it'], 'Pronoun "It" merujuk kembali pada "the policy" sehingga kata itu tidak perlu diulang.'),
      fill(28, 'Lengkapi: Public transport is cheaper than driving, ___ makes it accessible to low-income workers.', ['which'], 'Klausa "which makes..." menyambungkan akibat ke kalimat sebelumnya tanpa penghubung tambahan.'),
      g(29, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat transisi antarparagraf yang benar.',
        explanation_id: 'Pola kontras halus: Despite + ringkasan noun (these benefits), + klausa utama.',
        segments: ['Despite these benefits,', 'critics point to', 'several', 'drawbacks.'],
      }),
      g(30, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik penghubung yang salah logika.',
        explanation_id: '"However" menyatakan kontras, padahal kalimat kedua menambah ide yang searah; gunakan "In addition" atau rujukan.',
        tokens: ['Public', 'transport', 'is', 'cheap.', 'However,', 'it', 'also', 'reduces', 'traffic.'],
        correct_answers: [4],
      }),
    ],
  },
};

export default sub;
