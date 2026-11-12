const P = 'Q-GR115-';
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
    sub_module_title: 'Adjectives & Adverbs: Jenis, Posisi, & Akhiran Pembentuk Kata (Suffix)',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis paragraf singkat (sekitar 80 sampai 100 kata) dalam bahasa Inggris yang menggambarkan tempat favoritmu di kotamu (misalnya taman, kafe, atau pasar) dan apa yang biasanya kamu lakukan di sana.\n\nDalam paragrafmu:\n- pakai setidaknya 5 adjective, termasuk satu frasa dengan dua adjective berurutan sebelum noun (mis. a small old cafe)\n- pakai setidaknya 3 adverb dari jenis yang berbeda (mis. frequency: usually; manner: quietly; degree: extremely)\n- pakai satu adjective -ed atau -ing dengan benar (mis. relaxed, relaxing)\n- pakai satu bentuk comparative atau superlative (mis. cheaper than, the most peaceful)\n- pakai setidaknya satu noun berakhiran suffix (mis. happiness, friendship, entertainment)',
    ai_rubric_criteria:
      'Grammatical Accuracy: adjective dipakai untuk noun dan adverb untuk verb/adjective (bukan "sings beautiful"), adjective -ed/-ing tepat, urutan adjective sebelum noun benar, posisi adverb frequency benar, comparative/superlative benar (tanpa "more cheaper"). Lexical Resource: bentuk kata (word formation) dan suffix tepat, adjective bervariasi (tidak hanya good/nice). Task Achievement: semua unsur yang diminta muncul. Coherence: paragraf runtut dan mudah diikuti.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, '___ books on the shelf over there are mine.', ['This', 'That', 'These', 'Those'], 'Those', '"Books" jamak dan letaknya jauh (over there), jadi memakai "those". "This/that" hanya untuk noun tunggal, dan "these" untuk benda yang dekat.'),
      mcq(2, 'The number of tourists in Bali ___ every year.', ['increase', 'increases', 'are increasing', 'have increased'], 'increases', 'Subjek kalimat adalah "the number" (satu angka), sehingga verb harus singular: increases. Tiga pilihan lain berbentuk plural.'),
      mcq(3, 'A number of students ___ late for class this morning.', ['was', 'were', 'is', 'has'], 'were', '"A number of" berarti "beberapa", sehingga verb mengikuti noun jamak "students": were.'),
      mcq(4, 'The lecture was so ___ that half of the audience fell asleep.', ['bored', 'boring', 'boredom', 'bore'], 'boring', 'Kuliah itu adalah penyebab rasa bosan, jadi memakai bentuk -ing. "Bored" dipakai untuk orang yang merasakan bosan.'),
      mcq(5, 'She speaks English very ___.', ['good', 'well', 'nice', 'fluent'], 'well', 'Kata yang diterangkan adalah verb "speaks", jadi dibutuhkan adverb. Adverb dari "good" adalah "well". Good, nice, dan fluent adalah adjective.'),
      mcq(6, 'Which phrase has the correct adjective order?', ['a wooden old beautiful table', 'a beautiful old wooden table', 'an old beautiful wooden table', 'a beautiful wooden old table'], 'a beautiful old wooden table', 'Urutan adjective: opinion (beautiful), lalu age (old), lalu material (wooden), baru noun.'),
      mcq(7, 'He was so tired that he could ___ keep his eyes open.', ['hard', 'hardly', 'harder', 'hardest'], 'hardly', '"Hardly" berarti "hampir tidak": ia hampir tidak bisa membuka mata. "Hard" berarti keras atau sulit dan tidak cocok di posisi ini.'),
      mcq(8, 'This exercise is ___ than the previous one.', ['more easy', 'easier', 'easiest', 'more easier'], 'easier', 'Adjective dua suku kata berakhiran -y membentuk comparative dengan -ier: easy -> easier. "More easier" memakai dua penanda sekaligus, dan "easiest" adalah superlative.'),
      mcq(9, 'Which word is a NOUN?', ['happy', 'happily', 'happiness', 'happier'], 'happiness', 'Suffix -ness mengubah adjective menjadi noun: happy -> happiness. "Happily" adverb, "happier" comparative adjective.'),
      mcq(10, 'Which word is an ADJECTIVE, not an adverb?', ['quickly', 'friendly', 'slowly', 'carefully'], 'friendly', '"Friendly" berasal dari noun "friend" + -ly dan berfungsi sebagai adjective (a friendly teacher). Tiga kata lain adalah adverb yang dibentuk dari adjective + -ly.'),
      fill(11, 'Lengkapi: My sister is ___ in Korean dramas, so she watches them every night. (interested / interesting)', ['interested'], 'Kakak adalah orang yang merasakan ketertarikan, jadi memakai bentuk -ed: interested in. "Interesting" dipakai untuk hal yang menarik.'),
      fill(12, 'Ubah adjective "happy" menjadi adverb: The children played ___ in the garden.', ['happily'], 'Kata yang diterangkan adalah verb "played", jadi dibutuhkan adverb. Konsonan + y berubah menjadi -ily: happy -> happily.'),
      fill(13, 'Lengkapi dengan bentuk comparative dari "bad": The traffic today is ___ than yesterday.', ['worse'], '"Bad" punya bentuk comparative tak beraturan: bad -> worse -> the worst. Bentuk "badder" atau "more bad" tidak ada.'),
      fill(14, 'Lengkapi dengan bentuk noun dari "announce": The manager made an important ___ this morning.', ['announcement'], 'Sesudah "an important" dibutuhkan noun. Suffix -ment mengubah verb menjadi noun: announce -> announcement.'),
      fill(15, 'Lengkapi: He drives too ___ on the highway. (fast / fastly)', ['fast'], '"Fast" adalah adjective sekaligus adverb, sehingga bentuknya tidak berubah. Kata "fastly" tidak ada dalam bahasa Inggris baku.'),
      fill(16, 'Lengkapi dengan bentuk adverb dari "basic": The two plans are ___ the same.', ['basically'], 'Adjective berakhiran -ic membentuk adverb dengan -ally: basic -> basically.'),
      g(17, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar.',
        explanation_id: 'Sesudah subjek dan verb, frasa noun disusun: a + opinion (beautiful) + age (old) + material (wooden) + noun (table).',
        segments: ['She', 'bought', 'a', 'beautiful', 'old', 'wooden', 'table.'],
      }),
      g(18, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar.',
        explanation_id: '"Enough" diletakkan sesudah adjective yang diterangkannya: big enough, bukan enough big. Pola: subjek + be + adjective + enough + keterangan.',
        segments: ['The room', 'is not', 'big', 'enough', 'for us.'],
      }),
      g(19, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Kata yang diterangkan adalah verb "sings", jadi dibutuhkan adverb: beautifully. "Beautiful" adalah adjective dan hanya menerangkan noun.',
        tokens: ['She', 'sings', 'very', 'beautiful', 'in', 'the', 'choir.'],
        correct_answers: [3],
      }),
      g(20, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Pembicara adalah orang yang merasakan bosan, jadi memakai bentuk -ed: bored with. "Boring" berarti membosankan.',
        tokens: ['I', 'am', 'very', 'boring', 'with', 'this', 'long', 'movie.'],
        correct_answers: [3],
      }),
      g(21, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: '"Cheap" hanya satu suku kata, jadi comparative-nya cukup "cheaper". Kata "more" harus dibuang karena tidak boleh ada dua penanda comparative.',
        tokens: ['This', 'phone', 'is', 'more', 'cheaper', 'than', 'mine.'],
        correct_answers: [3],
      }),
      g(22, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: '"Smells" di sini adalah kata kerja penghubung (seperti be) yang menghubungkan subjek dengan sifatnya, jadi diikuti adjective: delicious, bukan adverb "deliciously".',
        tokens: ['The', 'soup', 'smells', 'deliciously', 'today.'],
        correct_answers: [3],
      }),
      g(23, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap kata dengan kelas katanya (lihat suffix-nya).',
        explanation_id: 'Suffix -hood membentuk noun (childhood), -ous membentuk adjective (dangerous), dan adjective + -ly membentuk adverb (quickly).',
        points: 3,
        matching: {
          left: ['childhood', 'dangerous', 'quickly'],
          right: ['noun', 'adjective', 'adverb', 'verb'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(24, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap adverb dengan jenisnya.',
        explanation_id: 'Yesterday menjawab "kapan" (time), carefully menjawab "bagaimana" (manner), rarely menjawab "seberapa sering" (frequency), dan extremely menjawab "seberapa" (degree).',
        points: 4,
        matching: {
          left: ['yesterday', 'carefully', 'rarely', 'extremely'],
          right: ['time', 'manner', 'frequency', 'degree', 'place'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2, 3],
      }),
      g(25, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kata yang merupakan adjective.',
        explanation_id: 'Friendly dan lovely berakhiran -ly tetapi tetap adjective (a friendly neighbour, a lovely day). Hopeless adalah adjective bersuffix -less. "Quickly" adalah adverb.',
        points: 3,
        options: ['friendly', 'lovely', 'quickly', 'hopeless'],
        correct_answers: ['friendly', 'lovely', 'hopeless'],
      }),
      g(26, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kata yang merupakan noun.',
        explanation_id: 'Suffix -ship (friendship), -ment (government), dan -age (marriage) membentuk noun. "Effective" bersuffix -ive, jadi adjective.',
        points: 3,
        options: ['friendship', 'government', 'effective', 'marriage'],
        correct_answers: ['friendship', 'government', 'marriage'],
      }),
      mcq(27, 'Mount Everest is ___ mountain in the world.', ['higher', 'the highest', 'the most high', 'highest than'], 'the highest', 'Membandingkan satu hal dengan semua yang lain (in the world) memakai superlative. "High" satu suku kata, jadi the + highest, bukan "the most high".'),
      mcq(28, 'He is not ___ to drive a car.', ['enough old', 'old enough', 'too old enough', 'enough older'], 'old enough', '"Enough" selalu diletakkan sesudah adjective: old enough. Susunan "enough old" adalah terjemahan langsung dari "cukup tua" dan salah.'),
      fill(29, 'Lengkapi dengan bentuk adjective dari "danger": Swimming in this river is ___.', ['dangerous'], 'Sesudah "is" dibutuhkan adjective untuk menerangkan subjek. Suffix -ous mengubah noun menjadi adjective: danger -> dangerous.'),
      fill(30, 'Lengkapi: The team finished the project ___ and won an award. (successful / successfully)', ['successfully'], 'Kata yang diterangkan adalah verb "finished", jadi dibutuhkan adverb: successfully. "Successful" adalah adjective dan hanya menerangkan noun.'),
    ],
  },
};

export default sub;
