const P = 'Q-GR113-';
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
    sub_module_title: 'Past Simple vs. Present Perfect',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis paragraf pendek (sekitar 90 sampai 110 kata) dalam bahasa Inggris tentang sebuah pengalaman perjalanan atau kegiatan yang pernah kamu lakukan.\n\nDalam paragrafmu:\n- buka dengan satu kalimat Present Perfect tentang pengalaman umum (mis. "I have visited ... several times" atau "I have never ...")\n- ceritakan satu kejadian spesifik dengan Simple Past (minimal 4 kalimat dengan penanda waktu seperti last year, two weeks ago, in 2022)\n- tutup dengan satu kalimat Present Perfect yang memakai "since" atau "for" tentang perasaan atau keadaanmu sampai sekarang',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: Present Perfect memakai has/have + V3 yang benar (tidak "have went", "have saw"); Simple Past memakai V2 yang benar, negatif/tanya dengan did + V1; waktu spesifik tidak dicampur dengan Present Perfect; since/for dipakai tepat. Task Achievement: ketiga bagian (pembukaan Perfect, cerita Past, penutup since/for) tercakup. Coherence: perpindahan dari pengalaman umum ke detail cerita terasa wajar. Lexical Resource: kosakata sesuai.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'I ___ my keys yesterday, so I came home late.', ['lost', 'have lost', 'lose', 'was losing'], 'lost', '"Yesterday" adalah waktu lampau yang spesifik, jadi Simple Past: lost.'),
      mcq(2, 'She ___ in Medan since 2018.', ['lived', 'has lived', 'lives', 'is living'], 'has lived', '"Since 2018" menyatakan keadaan yang dimulai di masa lampau dan berlanjut sampai sekarang: Present Perfect (has lived).'),
      mcq(3, '___ you ever tried durian?', ['Did', 'Have', 'Do', 'Are'], 'Have', 'Pertanyaan pengalaman hidup dengan "ever" memakai Present Perfect: Have you ever + V3?'),
      mcq(4, 'They ___ the report yet.', ['didn\'t finish', 'haven\'t finished', 'don\'t finish', 'hasn\'t finished'], 'haven\'t finished', '"Yet" dipakai pada kalimat negatif Present Perfect. Subjek they memakai have: haven\'t + V3.'),
      mcq(5, 'When ___ you arrive in Jakarta?', ['did', 'have', 'do', 'are'], 'did', 'Pertanyaan "when" menanyakan waktu spesifik, sehingga memakai Simple Past: When did you arrive?'),
      mcq(6, 'I ___ to Bali twice, and I want to go again.', ['went', 'have been', 'go', 'was going'], 'have been', 'Pengalaman dengan jumlah kali, tanpa waktu spesifik = Present Perfect. "Have been to" berarti pernah ke suatu tempat dan sudah kembali.'),
      mcq(7, 'Which sentence is CORRECT?', ['I have seen him yesterday.', 'I saw him yesterday.', 'I have saw him yesterday.', 'I did saw him yesterday.'], 'I saw him yesterday.', 'Waktu spesifik "yesterday" tidak boleh dipakai dengan Present Perfect. Simple Past: saw.'),
      mcq(8, 'Which sentence means the person still lives in Bali?', ['I lived in Bali for five years.', 'I have lived in Bali for five years.', 'I was living in Bali five years ago.', 'I live in Bali five years ago.'], 'I have lived in Bali for five years.', 'Present Perfect + for menunjukkan keadaan yang berlanjut sampai sekarang. Simple Past + for menunjukkan keadaan yang sudah berakhir.'),
      fill(9, 'Lengkapi dengan V3 dari "write": She has ___ three essays this week.', ['written'], 'Present Perfect = has + V3. V3 dari write adalah written (write, wrote, written).'),
      fill(10, 'Lengkapi dengan V2 dari "buy": I ___ this laptop two years ago.', ['bought'], '"Two years ago" menunjukkan waktu lampau yang spesifik = Simple Past. V2 dari buy adalah bought.'),
      fill(11, 'Lengkapi dengan since atau for: I have studied English ___ six years.', ['for'], '"For" diikuti durasi (six years); "since" diikuti titik waktu (2019, Monday).'),
      fill(12, 'Lengkapi dengan since atau for: She has worked here ___ 2020.', ['since'], '"Since" diikuti titik waktu awal (2020). "For" diikuti lamanya waktu.'),
      fill(13, 'Lengkapi dengan V3 dari "eat": Have you ___ lunch yet?', ['eaten'], 'Present Perfect tanya: Have + S + V3. V3 dari eat adalah eaten (eat, ate, eaten).'),
      fill(14, 'Lengkapi dengan bentuk yang benar (bukan bentuk lampau): Did you ___ to the party last night?', ['go'], 'Setelah did, kata kerja kembali ke bentuk dasar: go (bukan went).'),
      g(15, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi pertanyaan Present Perfect yang benar.',
        explanation_id: 'Tanya Present Perfect: Have/Has + subjek + (ever) + V3 + objek.',
        segments: ['Have', 'you', 'ever', 'visited', 'Singapore?'],
      }),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat Simple Past negatif yang benar.',
        explanation_id: 'Negatif Simple Past: S + did not + V1 + keterangan waktu.',
        segments: ['She', 'did not', 'call', 'me', 'last night.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Setelah have wajib V3. V3 dari go adalah gone (atau been untuk "pernah ke"), bukan went.',
        tokens: ['I', 'have', 'went', 'to', 'Bali', 'twice.'],
        correct_answers: [2],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Setelah didn\'t kata kerja kembali ke bentuk dasar: go, bukan went.',
        tokens: ['He', 'didn\'t', 'went', 'to', 'school', 'yesterday.'],
        correct_answers: [2],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kalimat dengan penjelasan tense yang tepat.',
        explanation_id: '"Last week" = waktu spesifik = Simple Past. "Never" = pengalaman (Present Perfect). "Since 2019" = durasi sampai sekarang (Present Perfect).',
        points: 3,
        matching: {
          left: ['I visited Yogyakarta last week.', 'I have never eaten sushi.', 'She has worked here since 2019.'],
          right: ['Simple Past: waktu spesifik', 'Present Perfect: pengalaman', 'Present Perfect: durasi', 'Simple Past: kebiasaan lampau'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'Present Perfect tidak dipakai dengan waktu spesifik (last year, ago). "I have never been..." dan "She did not arrive..." benar.',
        points: 2,
        options: ['I have visited Japan last year.', 'I have never been to Japan.', 'She did not arrive on time yesterday.', 'He has finished the report two days ago.'],
        correct_answers: ['I have never been to Japan.', 'She did not arrive on time yesterday.'],
      }),
    ],
  },
};

export default sub;
