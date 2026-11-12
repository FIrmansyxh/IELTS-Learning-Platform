const P = 'Q-VC121-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'VOCAB', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.4',
    module_category: 'VOCAB',
    sub_module_title: '1.000 Kata Inti (Oxford A1-A2) dalam Konteks Kalimat',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis paragraf pendek (sekitar 80 sampai 100 kata) dalam bahasa Inggris tentang hari liburmu yang biasa.\n\nWajib memakai:\n- minimal 6 kata dari topik yang dipelajari (keluarga, rumah, makanan, belanja, perjalanan, kesehatan)\n- minimal 4 kolokasi yang benar (mis. take a shower, make a mistake, do the shopping, have breakfast, go for a walk)\n- satu pasangan yang sering tertukar dipakai dengan tepat (say/tell, borrow/lend, make/do)\n- tidak memakai kata terjemahan langsung yang salah (mis. "do a mistake", "make homework")',
    ai_rubric_criteria:
      'Lexical Resource: kosakata dasar tepat dan bervariasi, kolokasi benar (make/do/have/take/go), pasangan say/tell dan borrow/lend dipakai benar, tidak ada false friends. Grammatical Accuracy: kalimat utuh dengan tense sesuai. Task Achievement: semua elemen (6 kata topik, 4 kolokasi, satu pasangan) muncul. Coherence: paragraf teratur.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which sentence is correct?', ['I make my homework every evening.', 'I do my homework every evening.', 'I have my homework every evening.', 'I take my homework every evening.'], 'I do my homework every evening.', 'Kolokasi tetap: do homework. Make dipakai untuk membuat sesuatu seperti a cake atau a mistake.'),
      mcq(2, 'Which sentence is correct?', ['She made a mistake.', 'She did a mistake.', 'She took a mistake.', 'She had a mistake.'], 'She made a mistake.', 'Kolokasi tetap: make a mistake.'),
      mcq(3, 'Can I ___ your pen for a minute?', ['borrow', 'lend', 'give back', 'take away'], 'borrow', '"Borrow" = meminjam dari orang lain; "lend" = meminjamkan kepada orang lain.'),
      mcq(4, 'He ___ me a funny story yesterday.', ['said', 'told', 'spoke', 'talked'], 'told', '"Tell" diikuti orang (tell me a story); "say" diikuti ucapan.'),
      mcq(5, 'The film was really ___, so we laughed a lot.', ['funny', 'fun', 'fine', 'funnily'], 'funny', '"Funny" = lucu. "Fun" = menyenangkan (untuk pengalaman atau acara).'),
      mcq(6, 'In English, "actual" means...', ['real or true', 'latest', 'sensitive', 'attractive'], 'real or true', '"Actual" berarti sebenarnya atau nyata (false friend dengan "aktual").'),
      mcq(7, 'Choose the correct word: She is a very ___ person who makes good decisions.', ['sensible', 'sensitive', 'sensational', 'sensual'], 'sensible', '"Sensible" = bijaksana atau masuk akal. "Sensitive" berarti peka atau mudah tersinggung.'),
      mcq(8, 'Which noun is UNCOUNTABLE?', ['furniture', 'chair', 'table', 'shelf'], 'furniture', '"Furniture" uncountable: some furniture, a piece of furniture.'),
      mcq(9, 'Which word means "tagihan di restoran"?', ['bill', 'receipt', 'discount', 'change'], 'bill', '"Bill" = tagihan; "receipt" = struk bukti bayar; "change" = uang kembalian.'),
      mcq(10, 'What is the adjective form of "danger"?', ['dangerous', 'dangerously', 'endanger', 'dangering'], 'dangerous', 'Danger (noun), endanger (verb), dangerous (adjective), dangerously (adverb).'),
      fill(11, 'Lengkapi: I usually ___ a shower before breakfast.', ['take', 'have'], 'Kolokasi: take a shower atau have a shower.'),
      fill(12, 'Lengkapi: We need to ___ the shopping this afternoon.', ['do'], 'Kolokasi tetap: do the shopping.'),
      fill(13, 'Lengkapi: It is raining ___, so take an umbrella. (lawan dari "light")', ['heavily', 'hard'], 'Heavily atau hard menjelaskan hujan deras; kolokasi heavy rain atau rain heavily.'),
      fill(14, 'Lengkapi: Could we have the ___, please? (di akhir makan di restoran)', ['bill', 'check'], 'Di restoran kita meminta bill (Inggris Britania) atau check (Amerika).'),
      fill(15, 'Lengkapi: She is ___ of her son because he won the prize. (bangga)', ['proud'], 'Proud of = bangga akan.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar.',
        explanation_id: 'Pola: subjek + take a shower + before + have breakfast.',
        segments: ['I usually', 'take a shower', 'before I', 'have breakfast.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Kolokasi tetap: make a mistake, bukan do a mistake.',
        tokens: ['I', 'do', 'a', 'mistake', 'in', 'my', 'test.'],
        correct_answers: [1],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Information adalah uncountable: tidak berbentuk jamak. Seharusnya: some information.',
        tokens: ['She', 'gave', 'me', 'some', 'informations', 'about', 'the', 'trip.'],
        correct_answers: [4],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kata dengan artinya.',
        explanation_id: 'Cousin = sepupu; receipt = struk; neighbour = tetangga.',
        points: 3,
        matching: {
          left: ['cousin', 'receipt', 'neighbour'],
          right: ['sepupu', 'struk belanja', 'tetangga', 'saudara kandung'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA cara belajar kata baru yang paling efektif.',
        explanation_id: 'Belajar dalam kalimat dan mengulang berjarak adalah dua cara yang paling efektif. Menghafal terjemahan tanpa konteks tidak bertahan lama.',
        points: 2,
        options: ['Learn each word in a sentence with its collocations', 'Memorise a long list of translations only once', 'Review the words after 1, 3 and 7 days', 'Never use the new words in your own sentences'],
        correct_answers: ['Learn each word in a sentence with its collocations', 'Review the words after 1, 3 and 7 days'],
      }),
      mcq(21, 'I ___ a strange noise outside last night.', ['listened', 'heard', 'watched', 'looked'], 'heard', '"Hear" = mendengar tanpa sengaja (pasif). "Listen" = mendengarkan dengan sengaja dan butuh "to".'),
      mcq(22, 'She ___ three languages: Indonesian, English and Japanese.', ['talks', 'says', 'speaks', 'tells'], 'speaks', '"Speak" dipakai untuk bahasa: speak English. "Talk" berarti mengobrol.'),
      mcq(23, 'We usually ___ TV after dinner.', ['look', 'see', 'watch', 'hear'], 'watch', '"Watch" = menonton sesuatu yang bergerak atau berlangsung: watch TV.'),
      mcq(24, 'In English, "fabric" means...', ['a factory', 'cloth or material', 'a machine', 'a shop'], 'cloth or material', '"Fabric" berarti kain (false friend dengan "pabrik", yang dalam bahasa Inggris adalah factory).'),
      mcq(25, 'In English, "eventually" means...', ['possibly', 'in the end', 'sometimes', 'immediately'], 'in the end', '"Eventually" berarti akhirnya, setelah waktu yang lama (false friend).'),
      mcq(26, 'She drives very ___. She has never had an accident.', ['careful', 'carefully', 'care', 'careless'], 'carefully', 'Yang menjelaskan kata kerja (drives) adalah adverb: carefully. "Careful" adalah adjective.'),
      g(27, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Kolokasi tetap: take medicine, bukan eat medicine.',
        tokens: ['I', 'eat', 'medicine', 'when', 'I', 'have', 'a', 'fever.'],
        correct_answers: [1],
      }),
      fill(28, 'Lengkapi dengan satu kata: She goes to work ___ bus every day.', ['by'], 'Kolokasi: go by bus (tanpa artikel).'),
      fill(29, 'Lengkapi: There was ___ traffic this morning, so I was late. (lawan dari "light")', ['heavy'], 'Kolokasi tetap: heavy traffic (bukan strong traffic atau big traffic).'),
      fill(30, 'Lengkapi: It was difficult, but she finally ___ a decision.', ['made', 'took', 'reached'], 'Kolokasi utama: make a decision (bentuk lampau: made). Bukan "did a decision".'),
    ],
  },
};

export default sub;
