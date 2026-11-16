const P = 'Q-GR111-';
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
    sub_module_title: 'Nouns, Pronouns, Articles (a/an/the), & Plurals',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis surat singkat (sekitar 80 sampai 100 kata) kepada temanmu tentang barang-barang yang kamu butuhkan untuk pindah ke apartemen baru.\n\nDalam suratmu:\n- sebutkan setidaknya 4 barang countable dalam bentuk jamak yang benar (mis. chairs, boxes)\n- sebutkan setidaknya 2 kata uncountable dengan benar (mis. furniture, advice, equipment) tanpa -s dan tanpa a/an\n- pakai artikel a/an/the dengan benar (kenalkan benda dengan a/an, lalu rujuk lagi dengan the)\n- pakai pronoun (it, them, we, our, mine) agar tidak mengulang kata benda yang sama',
    ai_rubric_criteria:
      'Grammatical Accuracy: bentuk jamak benar (boxes, shelves, children), kata uncountable tidak dijamakkan dan tidak memakai a/an, artikel a/an/the/tanpa artikel tepat, pronoun merujuk jelas dan bentuknya benar (its/it\'s, their/there). Task Achievement: semua unsur yang diminta (jamak, uncountable, artikel, pronoun) muncul. Coherence dan Lexical Resource: surat teratur dan kosakata sesuai.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which word is UNCOUNTABLE?', ['advice', 'idea', 'book', 'student'], 'advice', '"Advice" tidak memiliki bentuk jamak dan tidak memakai a/an langsung. Gunakan "a piece of advice".'),
      mcq(2, 'The plural of "city" is...', ['citys', 'cities', 'cityes', 'city'], 'cities', 'Konsonan + y berubah menjadi -ies untuk bentuk jamak: city -> cities.'),
      mcq(3, 'The plural of "child" is...', ['childs', 'childes', 'children', 'childrens'], 'children', 'Plural tak beraturan: child -> children.'),
      mcq(4, 'She gave me some useful ___ about the course.', ['informations', 'information', 'an information', 'informations\''], 'information', '"Information" uncountable: tidak berbentuk jamak, tidak memakai a/an.'),
      mcq(5, 'He is ___ honest man.', ['a', 'an', 'the', 'no article'], 'an', 'Aturan a/an berdasarkan bunyi. "Honest" dimulai bunyi vokal (huruf h tidak dibaca), jadi "an".'),
      mcq(6, 'I bought a jacket and a hat. ___ jacket was expensive.', ['A', 'The', 'An', 'No article'], 'The', 'Jacket sudah disebut sebelumnya (spesifik), jadi memakai "the".'),
      mcq(7, '___ people in my country are very friendly.', ['A', 'An', 'The', 'Peoples'], 'The', '"The people in my country" spesifik. "People" sudah jamak sehingga tidak ditambah -s dan tidak memakai a/an.'),
      mcq(8, 'We don\'t have ___ time. Let\'s hurry!', ['many', 'much', 'a few', 'fewer'], 'much', '"Time" uncountable. "Much" dipakai dengan uncountable pada kalimat negatif.'),
      mcq(9, 'There are too ___ cars in the city centre.', ['much', 'many', 'little', 'less'], 'many', '"Cars" countable jamak, sehingga memakai "many".'),
      mcq(10, 'This bag is not mine. It is ___.', ['her', 'she', 'hers', 'herself'], 'hers', 'Possessive pronoun (hers) menggantikan "her bag" dan berdiri sendiri tanpa kata benda.'),
      fill(11, 'Lengkapi: The company launched a new product, and ___ price is very low. (it / its / it\'s)', ['its'], '"Its" adalah possessive adjective (milik it). "It\'s" berarti it is / it has.'),
      fill(12, 'Lengkapi dengan bentuk jamak dari "box": We packed three ___ yesterday.', ['boxes'], 'Kata berakhiran -x memakai -es: box -> boxes.'),
      fill(13, 'Lengkapi dengan bentuk jamak dari "knife": Be careful with those sharp ___.', ['knives'], 'Banyak kata berakhiran -fe berubah menjadi -ves: knife -> knives.'),
      fill(14, 'Lengkapi dengan artikel yang tepat (a / an / the): I need ___ umbrella because it is raining.', ['an'], '"Umbrella" dimulai bunyi vokal /ʌ/, sehingga memakai "an".'),
      fill(15, 'Lengkapi dengan a / an / the: She is ___ best student in our class.', ['the'], 'Superlative (best) memakai "the".'),
      fill(16, 'Lengkapi dengan pronoun refleksif: He taught ___ to play the guitar.', ['himself'], 'Subjek dan objek sama (he - himself), sehingga memakai reflexive pronoun.'),
      g(17, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat yang benar.',
        explanation_id: 'Urutan: subjek + kata kerja + quantifier + kata benda uncountable + keterangan. "A lot of" bisa dipakai dengan uncountable seperti "advice".',
        segments: ['She', 'gave', 'me', 'a lot of', 'advice.'],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: '"Advice" uncountable: tidak berbentuk jamak. Seharusnya "some advice".',
        tokens: ['He', 'gave', 'me', 'some', 'advices', 'yesterday.'],
        correct_answers: [4],
      }),
      g(19, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Setelah angka lebih dari satu, kata benda countable wajib jamak: three books.',
        tokens: ['I', 'bought', 'three', 'book', 'at', 'the', 'market.'],
        correct_answers: [3],
      }),
      g(20, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kata dengan jenisnya.',
        explanation_id: 'Furniture dan information uncountable; children bentuk jamak tak beraturan; its possessive adjective.',
        points: 3,
        matching: {
          left: ['furniture', 'children', 'its'],
          right: ['kata benda uncountable', 'jamak tak beraturan', 'possessive adjective', 'pronoun subjek'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(21, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kata yang uncountable.',
        explanation_id: 'Information, equipment, dan homework uncountable. "Idea" countable (an idea, ideas).',
        points: 3,
        options: ['information', 'idea', 'equipment', 'homework'],
        correct_answers: ['information', 'equipment', 'homework'],
      }),
      mcq(22, 'The dentist checked all of my ___.', ['tooths', 'teeth', 'teeths', 'toothes'], 'teeth', 'Plural tak beraturan: tooth -> teeth. Tidak ditambah -s lagi.'),
      mcq(23, 'France is ___ European country.', ['a', 'an', 'the', 'no article'], 'a', 'Aturan a/an berdasarkan bunyi. "European" dimulai bunyi /j/ (konsonan), jadi "a".'),
      mcq(24, 'I usually go to work ___.', ['by bus', 'by a bus', 'by the bus', 'with bus'], 'by bus', 'Transportasi dengan "by" tidak memakai artikel: by bus, by train, by car.'),
      mcq(25, '___ Nile is the longest river in Africa.', ['A', 'An', 'The', 'No article'], 'The', 'Nama sungai, samudra, dan pegunungan memakai "the": the Nile, the Pacific, the Alps.'),
      mcq(26, 'There is very ___ milk in the fridge, so we cannot make a cake.', ['few', 'little', 'many', 'a few'], 'little', '"Milk" uncountable, dan maknanya hampir tidak ada (negatif), jadi "little". Few/a few/many hanya untuk countable.'),
      g(27, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: '"People" countable jamak, jadi memakai "many" (atau "a lot of"), bukan "much".',
        tokens: ['There', 'are', 'much', 'people', 'in', 'the', 'park', 'today.'],
        correct_answers: [2],
      }),
      fill(28, 'Lengkapi dengan bentuk jamak dari "country": She has visited five ___ in Asia.', ['countries'], 'Konsonan + y berubah menjadi -ies: country -> countries.'),
      fill(29, 'Lengkapi: The students left ___ books at home. (their / there / they\'re)', ['their'], '"Their" adalah possessive adjective (milik they). "There" berarti di sana/ada, "they\'re" berarti they are.'),
      fill(30, 'Lengkapi dengan fewer atau less: We should use ___ plastic to protect the environment.', ['less'], '"Plastic" di sini uncountable, jadi memakai "less". "Fewer" dipakai dengan countable jamak (fewer bags).'),
      mcq(31, 'Everyone in my class ___ the new teacher.', ['like', 'likes', 'are liking', 'have liked'], 'likes', 'Indefinite pronoun (everyone, someone, nobody) sebagai subjek selalu memakai kata kerja tunggal: likes.'),
      mcq(32, 'I have two brothers. One lives in Jakarta, and ___ lives in Medan.', ['another', 'other', 'the other', 'others'], 'the other', 'Hanya ada dua, jadi sisanya sudah tertentu: "the other". "Another" dipakai bila masih ada kemungkinan lain.'),
      mcq(33, 'The number of tourists ___ every year.', ['increase', 'increases', 'are increasing', 'have increased'], 'increases', '"The number of ..." berarti jumlah (satu angka), sehingga kata kerjanya tunggal: increases. "A number of ..." memakai kata kerja jamak.'),
      mcq(34, 'Some students walk to school; ___ go by bus.', ['other', 'another', 'others', 'the other'], 'others', '"Others" berdiri sendiri tanpa kata benda dan berarti "yang lain" (jamak, belum tertentu). "Other" harus diikuti kata benda jamak.'),
      fill(35, 'Lengkapi dengan this, that, these, atau those: Look at ___ birds over there in the sky.', ['those'], '"Birds" jamak dan letaknya jauh (over there), jadi memakai "those".'),
    ],
  },
};

export default sub;
