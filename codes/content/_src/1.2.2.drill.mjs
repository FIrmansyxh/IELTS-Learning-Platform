const P = 'Q-VC122-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'VOCAB', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.2',
    module_category: 'VOCAB',
    sub_module_title: 'Fonetik Dasar, Bunyi Vokal Panjang/Pendek, & Word Stress',
  },
  mini_task: {
    task_type: 'AI_SHORT_SPEAKING',
    prompt:
      'Rekam dirimu mengucapkan hal berikut dalam bahasa Inggris (total sekitar 60 detik):\n1. Pasangan minimal, dengan jeda singkat: ship / sheep, live / leave, full / fool, bit / beat.\n2. Kata dengan tekanan berbeda: table, decide, information, photograph, photographer, economy, economic.\n3. Tiga kalimat ini dengan tekanan pada kata isi: "I want to go to the station to buy a ticket." / "She works in a bank." / "He watched a film yesterday."\n4. Bicara bebas 20 sampai 30 detik tentang rutinitas harianmu, dengan menjelaskan bunyi akhir (-s, -ed) yang jelas.',
    ai_rubric_criteria:
      'Pronunciation: pasangan minimal dibedakan (panjang vs pendek), tekanan kata benar (taBLE salah, TAble benar; deCIDE; inforMAtion; phoTOgrapher; ecoNOMic), kata isi ditekan dan kata fungsi ringan, bunyi akhir -s dan -ed terdengar. Fluency and Coherence: bicara bebas lancar tanpa jeda panjang. Grammatical Accuracy: tense dan plural tepat. Lexical Resource: kosakata rutinitas tepat.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which word contains the long vowel /iː/?', ['sheep', 'ship', 'sit', 'bit'], 'sheep', '"Sheep" memakai /iː/ (panjang); ship, sit, dan bit memakai /ɪ/ (pendek).'),
      mcq(2, 'Where is the stress in the verb "decide"?', ['On the second syllable', 'On the first syllable', 'On both syllables equally', 'There is no stress'], 'On the second syllable', 'Verb dua suku kata umumnya ditekan pada suku kedua: de-CIDE.'),
      mcq(3, 'Where is the stress in the noun "table"?', ['On the first syllable', 'On the second syllable', 'On both syllables equally', 'There is no stress'], 'On the first syllable', 'Noun dua suku kata umumnya ditekan pada suku pertama: TA-ble.'),
      mcq(4, 'Which syllable is stressed in "information"?', ['The third', 'The first', 'The second', 'The fourth'], 'The third', 'Akhiran -tion menarik tekanan ke suku kata tepat sebelumnya: infor-MA-tion.'),
      mcq(5, 'How is the -ed ending pronounced in "worked"?', ['/t/', '/d/', '/ɪd/', 'It is not pronounced'], '/t/', 'Setelah bunyi tak bersuara (/k/), -ed dibaca /t/: worked = /wɜːkt/.'),
      mcq(6, 'Which word begins with the sound /θ/?', ['think', 'tin', 'sink', 'dink'], 'think', '"Think" diawali /θ/ (lidah di antara gigi). Banyak pelajar mengucapkannya seperti /t/.'),
      mcq(7, 'What is the most common vowel sound in unstressed syllables in English?', ['The schwa /ə/', 'The long /iː/', 'The diphthong /aɪ/', 'The short /æ/'], 'The schwa /ə/', 'Schwa /ə/ adalah bunyi paling umum, muncul di suku kata tanpa tekanan (about, teacher).'),
      mcq(8, 'What intonation do yes/no questions usually have?', ['Rising', 'Falling', 'Flat', 'Falling then rising'], 'Rising', 'Pertanyaan yes/no biasanya naik di akhir; pertanyaan WH biasanya turun.'),
      mcq(9, 'Which pair shows a different stress for noun and verb?', ['PRESent (noun) / preSENT (verb)', 'TAble / TAble', 'HAPpy / HAPpy', 'TEAcher / TEAcher'], 'PRESent (noun) / preSENT (verb)', 'Beberapa kata berubah tekanan menurut kelas kata: noun di awal, verb di akhir.'),
      mcq(10, 'Which is a minimal pair that differs only in vowel length?', ['ship / sheep', 'cat / dog', 'table / chair', 'happy / sad'], 'ship / sheep', 'Ship /ʃɪp/ dan sheep /ʃiːp/ hanya berbeda panjang vokal.'),
      fill(11, 'Lengkapi: In "photograph", the stress is on the ___ syllable. (first / second / third)', ['first', '1st'], 'PHO-to-graph: tekanan pada suku pertama. Pada "photographer" tekanan pindah ke suku kedua.'),
      fill(12, 'Lengkapi: The word "dogs" ends with the sound /___/, not /s/.', ['z'], 'Setelah bunyi bersuara (/g/), akhiran -s dibaca /z/: dogs = /dɒgz/.'),
      fill(13, 'Lengkapi: A two-syllable verb is usually stressed on the ___ syllable.', ['second', '2nd'], 'Verb dua suku kata umumnya ditekan pada suku kedua (re-LAX, de-CIDE).'),
      fill(14, 'Lengkapi: Content words are stressed, whereas ___ words (a, the, of) are usually weak.', ['function'], 'Kata fungsi (artikel, preposisi, auxiliary) diucapkan lemah dan cepat.'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi aturan sentence stress yang benar.',
        explanation_id: 'Kata isi ditekan, kata fungsi biasanya lemah.',
        segments: ['Content words', 'are stressed,', 'while function words', 'are usually weak.'],
      }),
      g(16, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah dalam pernyataan tentang tekanan.',
        explanation_id: 'Verb "decide" ditekan pada suku kedua (de-CIDE), bukan pertama.',
        tokens: ['In', '"decide",', 'the', 'stress', 'is', 'on', 'the', 'first', 'syllable.'],
        correct_answers: [7],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik bagian yang salah dalam pernyataan tentang bunyi.',
        explanation_id: '"Think" dimulai dengan /θ/ (lidah di antara gigi), bukan /t/.',
        tokens: ['We', 'say', '"think"', 'with', 'the', '/t/', 'sound.'],
        correct_answers: [5],
      }),
      g(18, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kata dengan suku kata yang ditekan.',
        explanation_id: 'TA-ble: pertama. de-CIDE: kedua. infor-MA-tion: ketiga.',
        points: 3,
        matching: {
          left: ['table', 'decide', 'information'],
          right: ['first syllable', 'second syllable', 'third syllable', 'fourth syllable'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(19, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA pasangan minimal yang berbeda panjang vokal.',
        explanation_id: 'Ship/sheep dan full/fool berbeda hanya panjang vokalnya. Pasangan lain berbeda total.',
        points: 2,
        options: ['ship / sheep', 'table / chair', 'full / fool', 'happy / sad'],
        correct_answers: ['ship / sheep', 'full / fool'],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA cara latihan pronunciation yang efektif.',
        explanation_id: 'Merekam diri dan shadowing melatih bunyi, tekanan, dan ritme. Menghilangkan bunyi akhir atau bicara secepat mungkin merusak kejelasan.',
        points: 2,
        options: ['Record yourself and compare with an audio dictionary', 'Practise shadowing short sentences', 'Skip the final consonants to sound faster', 'Speak as fast as possible'],
        correct_answers: ['Record yourself and compare with an audio dictionary', 'Practise shadowing short sentences'],
      }),
    ],
  },
};

export default sub;
