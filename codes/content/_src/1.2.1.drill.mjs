const P = 'Q-GR116-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'GRAMMAR', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });
const err = (n, tokens, index, explanation_id) =>
  g(n, { question_type: 'ERROR_RECOGNITION', prompt: 'Klik kata yang salah.', explanation_id, tokens, correct_answers: [index] });
const reorder = (n, segments, explanation_id) =>
  g(n, { question_type: 'SENTENCE_REORDER', prompt: 'Susun menjadi kalimat yang benar.', explanation_id, segments });

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.2',
    module_category: 'GRAMMAR',
    sub_module_title: 'Verbs: Bentuk Kata Kerja, Transitive/Intransitive, Linking Verb, & Auxiliary',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis paragraf singkat (sekitar 80 sampai 100 kata) dalam bahasa Inggris tentang seorang anggota keluargamu: siapa dia, seperti apa orangnya, dan apa yang biasa ia lakukan.\n\nDalam paragrafmu:\n- tulis setidaknya 2 kalimat nominal dengan be (mis. My mother is a nurse. She is patient.)\n- tulis setidaknya 2 kalimat dengan kata kerja transitive beserta objeknya, salah satunya dengan dua objek (mis. She gives me advice.)\n- pakai setidaknya 1 linking verb selain be dengan adjective (look, seem, feel, become, sound)\n- tulis setidaknya 1 kalimat negatif dengan do/does/did + V1\n- jangan menggabung be dengan V1 (hindari bentuk seperti "is work" atau "am agree")',
    ai_rubric_criteria:
      'Grammatical Accuracy: setiap kalimat punya kata kerja; kalimat nominal memakai be; tidak ada be + V1; negatif memakai do/does/did + V1; bentuk kata kerja (V1+s, V2, V3, V-ing) sesuai; linking verb diikuti adjective, bukan adverb; kata kerja transitive punya objek dan pola to/for benar. Task Achievement: semua unsur yang diminta muncul (kalimat nominal, transitive dengan satu dan dua objek, linking verb selain be, kalimat negatif). Coherence dan Lexical Resource: paragraf runtut dan kosakata sesuai topik keluarga.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which form is the past participle (V3) of "write"?', ['wrote', 'written', 'writing', 'writes'], 'written', 'Write adalah irregular verb: write (V1), wrote (V2), written (V3). V3 dipakai setelah have/has/had dan di kalimat pasif.'),
      mcq(2, 'Which sentence has a TRANSITIVE verb?', ['The baby is sleeping.', 'He arrived late.', 'She reads a book.', 'They live in Bandung.'], 'She reads a book.', 'Hanya "reads" yang punya objek (a book). Sleep, arrive, dan live tidak diikuti objek; "late" dan "in Bandung" adalah keterangan, bukan objek.'),
      mcq(3, 'Which sentence has an INTRANSITIVE verb?', ['She opened the door.', 'The door opened slowly.', 'He bought a ticket.', 'We need more time.'], 'The door opened slowly.', 'Pada "The door opened slowly" tidak ada objek; "slowly" adalah keterangan cara. Tiga kalimat lain punya objek (the door, a ticket, more time). Open bisa transitive maupun intransitive.'),
      mcq(4, 'The soup smells ___.', ['delicious', 'deliciously', 'deliciousness', 'more deliciously'], 'delicious', 'Smell di sini linking verb, sehingga diikuti adjective (delicious) yang menerangkan subjek, bukan adverb berakhiran -ly.'),
      mcq(5, 'My father gave a watch ___ me.', ['to', 'for', 'at', 'with'], 'to', 'Give berpasangan dengan "to" karena bendanya berpindah kepada penerima: give something to someone. "For" dipakai dengan buy, make, cook.'),
      mcq(6, 'My mother bought a new bag ___ me.', ['to', 'for', 'at', 'on'], 'for', 'Buy berpasangan dengan "for" karena sesuatu dilakukan untuk seseorang: buy something for someone.'),
      mcq(7, 'She ___ agree with your opinion.', ["isn't", "doesn't", "aren't", 'not'], "doesn't", 'Agree adalah kata kerja biasa, jadi negatifnya memakai does not + V1 untuk subjek she. Be tidak boleh diikuti V1, dan "not" saja tanpa auxiliary tidak cukup.'),
      mcq(8, 'Which sentence is correct?', ['She beautiful.', 'She is beautiful.', 'She does beautiful.', 'She be beautiful.'], 'She is beautiful.', 'Beautiful adalah adjective, bukan kata kerja, jadi kalimat ini nominal dan wajib memakai be yang sesuai subjek: she is.'),
      mcq(9, '___ your brother work in a bank?', ['Is', 'Does', 'Do', 'Are'], 'Does', 'Ada kata kerja biasa (work), jadi kalimat tanya memakai do/does. Subjek "your brother" tunggal orang ketiga, sehingga Does. "Is ... work" salah karena be tidak diikuti V1.'),
      mcq(10, 'We ___ the problem in the meeting yesterday.', ['discussed', 'discussed about', 'discussed on', 'were discuss'], 'discussed', 'Discuss adalah kata kerja transitive yang langsung diikuti objek, tanpa preposisi about atau on. "Were discuss" salah karena be tidak diikuti V1.'),
      mcq(11, 'In the sentence "Learning English takes time", the word "Learning" is a ...', ['gerund (V-ing sebagai noun)', 'past participle (V3)', 'bare infinitive (V1)', 'auxiliary verb'], 'gerund (V-ing sebagai noun)', 'Learning menduduki posisi subjek kalimat, jadi berfungsi sebagai kata benda. V-ing yang berfungsi sebagai kata benda disebut gerund. Kata kerja utamanya adalah takes.'),
      mcq(12, 'The teacher explained the rule ___.', ['us', 'to us', 'for we', 'we'], 'to us', 'Polanya explain + hal + to + orang. Explain tidak bisa langsung diikuti objek orang, dan setelah preposisi dipakai pronoun objek (us), bukan we.'),
      fill(13, 'Lengkapi dengan bentuk past tense (V2) dari buy: I ___ a new phone last week.', ['bought'], 'Buy adalah irregular verb: buy, bought, bought. "Last week" menandai Simple Past, jadi dipakai V2.'),
      fill(14, 'Lengkapi dengan bentuk past participle (V3) dari take: She has ___ the IELTS test twice.', ['taken'], 'Setelah has dipakai V3. Take adalah irregular verb: take, took, taken.'),
      fill(15, 'Lengkapi dengan bentuk V-ing dari stop: The bus is ___ in front of the school.', ['stopping'], 'Setelah be (is) dipakai V-ing untuk continuous. Stop berakhiran konsonan-vokal-konsonan, jadi huruf p digandakan: stopping.'),
      fill(16, 'Lengkapi: He ___ not like spicy food. (is / does / do)', ['does'], 'Like adalah kata kerja biasa, jadi negatifnya memakai do/does + not + V1. Subjek he memakai does. "Is not like" salah karena be tidak diikuti V1.'),
      fill(17, 'Lengkapi: They ___ not at home right now. (are / do / does)', ['are'], 'Tidak ada kata kerja aksi; predikatnya keterangan tempat (at home). Ini kalimat nominal, jadi memakai be: they are not.'),
      fill(18, 'Lengkapi: The music sounds ___. (beautiful / beautifully)', ['beautiful'], 'Sound adalah linking verb. Complement-nya harus adjective (beautiful) karena menerangkan subjek the music, bukan adverb.'),
      fill(19, 'Lengkapi: Why ___ you so quiet today? (are / do / does)', ['are'], 'Quiet adalah adjective, bukan kata kerja, jadi kalimat tanya ini nominal dan memakai be. Do dan did hanya dipakai bila ada kata kerja biasa.'),
      fill(20, 'Lengkapi: My sister ___ a lecturer, and she teaches biology. (is / does / do)', ['is'], 'A lecturer adalah noun yang menerangkan subjek (complement), jadi dipakai be: my sister is a lecturer. Do/does butuh kata kerja biasa sesudahnya.'),
      reorder(21, ['She', 'gave', 'me', 'a flower.'], 'Pola ditransitive: subjek + kata kerja + penerima (indirect object) + benda (direct object). Bila benda disebut lebih dulu, penerima butuh "to": She gave a flower to me.'),
      reorder(22, ['Does', 'your sister', 'work', 'in a hospital?'], 'Kalimat tanya dengan kata kerja biasa: Does + subjek + V1 + keterangan. Setelah does, kata kerja kembali ke V1 (work, bukan works).'),
      reorder(23, ['They', 'do not', 'understand', 'the question.'], 'Kalimat negatif dengan kata kerja biasa: subjek + do not + V1 + objek. Understand adalah kata kerja, jadi tidak memakai are not.'),
      err(24, ['She', 'looks', 'happily', 'today.'], 2, 'Look di sini linking verb, jadi harus diikuti adjective: She looks happy today. Adverb (happily) tidak bisa menjadi complement.'),
      err(25, ['She', "doesn't", 'likes', 'coffee.'], 2, 'Setelah does/doesn\'t kata kerja kembali ke V1: She doesn\'t like coffee. Tanda -s sudah dibawa oleh does.'),
      err(26, ['Did', 'you', 'went', 'to', 'school', 'yesterday?'], 2, 'Setelah did dipakai V1, bukan V2: Did you go to school yesterday? Tanda lampau sudah dibawa oleh did.'),
      err(27, ['We', 'discussed', 'about', 'the', 'plan', 'yesterday.'], 2, 'Discuss langsung diikuti objek tanpa preposisi: We discussed the plan yesterday. Kata "about" harus dibuang.'),
      err(28, ['She', 'has', 'wrote', 'three', 'letters', 'today.'], 2, 'Setelah has dipakai V3, bukan V2: She has written three letters today. Wrote adalah V2 dari write.'),
      g(29, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap kalimat dengan jenis kata kerjanya.',
        explanation_id: 'Reads punya satu objek (a book): monotransitive. Gives punya dua objek (me, a flower): ditransitive. Sits tidak punya objek maupun complement (on the sand hanya keterangan tempat): intransitive complete. Looks diikuti adjective happy yang menerangkan subjek: linking verb.',
        points: 4,
        matching: {
          left: ['She reads a book.', 'She gives me a flower.', 'She sits on the sand.', 'She looks happy.'],
          right: [
            'monotransitive (satu objek)',
            'ditransitive (dua objek)',
            'intransitive complete (tanpa objek dan tanpa complement)',
            'linking verb + complement',
            'auxiliary + V-ing',
          ],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2, 3],
      }),
      g(30, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang memakai linking verb.',
        explanation_id: 'Went (went bad), became, dan seems menghubungkan subjek dengan complement (bad, a doctor, reasonable), jadi ketiganya linking verb. Pada "She went to the market", went adalah kata kerja gerak biasa yang diikuti keterangan tempat, bukan complement.',
        points: 3,
        options: ['The milk went bad.', 'He became a doctor.', 'She went to the market.', 'The plan seems reasonable.'],
        correct_answers: ['The milk went bad.', 'He became a doctor.', 'The plan seems reasonable.'],
      }),
    ],
  },
};

export default sub;
