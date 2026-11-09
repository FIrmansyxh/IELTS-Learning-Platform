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
    ],
  },
};

export default sub;
