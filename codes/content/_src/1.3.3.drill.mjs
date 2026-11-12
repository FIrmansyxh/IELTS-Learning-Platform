const P = 'Q-GR119-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'GRAMMAR', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 1,
    module_code: '1.3',
    module_category: 'GRAMMAR',
    sub_module_title: 'Simple Future (will, shall, be going to): Aktif, Pasif, & Kalimat Nominal',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis surat pendek (sekitar 90 sampai 110 kata) dalam bahasa Inggris kepada seorang teman yang akan berkunjung ke kotamu minggu depan.\n\nDalam suratmu:\n- sebutkan satu rencana yang sudah kamu putuskan dengan be going to (mis. "I am going to take two days off")\n- tulis minimal dua kalimat aktif dengan will untuk janji atau tawaran (mis. "I will pick you up ...")\n- tulis minimal satu kalimat pasif dengan will be + V3 (mis. "Dinner will be served ...")\n- tulis minimal satu kalimat nominal dengan will be + kata sifat, kata benda, atau keterangan tempat (mis. "The weather will be warm")\n- pakai satu time clause dengan when, as soon as, atau before yang diikuti present simple, bukan will',
    ai_rubric_criteria:
      'Grammatical Range and Accuracy: sesudah will selalu bentuk dasar (tidak "will goes", "will to go", "will going", "is will"); pasif memakai will be + V3 yang benar; kalimat nominal memakai will be + complement (tidak "will happy"); be going to memakai am/is/are yang sesuai subjek; time clause sesudah when/as soon as/before memakai present simple, bukan will. Task Achievement: kelima unsur yang diminta (be going to, dua will aktif, satu pasif, satu nominal, satu time clause) tercakup. Coherence: surat runtut dengan pembuka dan penutup yang wajar. Lexical Resource: kosakata sesuai dan penanda waktu masa depan dipakai tepat.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Dina ___ the debate club next semester.', ['will joins', 'will join', 'will joining', 'will to join'], 'will join', 'Sesudah will, kata kerja selalu bentuk dasar (V1) untuk subjek apa pun: will join. Tidak ada tambahan -s, -ing, atau to.'),
      mcq(2, 'The manager ___ the meeting, so please come as planned.', ['will not cancels', 'will not cancel', 'will not cancelled', 'not will cancel'], 'will not cancel', 'Negatif aktif: S + will + not + V1. Kata "not" berada sesudah will, dan kata kerja tetap bentuk dasar: will not cancel.'),
      mcq(3, 'A new team leader ___ by the staff next Friday.', ['will be chose', 'will be chosen', 'will chosen', 'will be choose'], 'will be chosen', 'Ketua tim dipilih (dikenai tindakan), jadi pola pasif: will + be + V3. V3 dari choose adalah chosen, bukan chose (V2).'),
      mcq(4, 'Don\'t worry. The doctor ___ at nine o\'clock.', ['will there', 'will be there', 'is will be there', 'will is there'], 'will be there', 'Kalimat ini nominal karena tidak ada kata kerja aksi; "there" adalah keterangan tempat. Polanya will + be + complement: will be there. Will tidak didahului is dan tidak diikuti is.'),
      mcq(5, 'Take this medicine and you ___ tomorrow.', ['will better', 'will be better', 'will being better', 'are will better'], 'will be better', '"Better" adalah kata sifat, bukan kata kerja, jadi wajib ada be sesudah will: will be better.'),
      mcq(6, '___ the results be announced next week?', ['Will', 'Do', 'Are', 'Is'], 'Will', 'Kalimat tanya pasif Simple Future: Will + S + be + V3? Kata "be" sesudah subjek menunjukkan bahwa kata bantu di depan harus will.'),
      mcq(7, 'A: "Will Rani come to the workshop?" B: "No, she ___."', ['won\'t', 'willn\'t', 'doesn\'t', 'isn\'t'], 'won\'t', 'Jawaban singkat mengulang kata bantu dari pertanyaan. Pertanyaannya memakai will, jadi jawaban negatifnya won\'t (singkatan will not). Bentuk "willn\'t" tidak ada.'),
      mcq(8, 'These boxes look heavy. ___ I carry one for you?', ['Shall', 'Does', 'Do', 'Am'], 'Shall', 'Untuk menawarkan bantuan dengan subjek I, dipakai Shall I + V1? Do I, Does I, dan Am I tidak membentuk tawaran yang benar di sini.'),
      mcq(9, 'Look at those dark clouds! It ___ rain.', ['is going to', 'will to', 'going to', 'is go to'], 'is going to', 'Ada bukti yang terlihat sekarang (awan gelap), jadi dipakai be going to. Rumusnya is + going to + V1. Tiga pilihan lain salah bentuk: will tidak diikuti to, dan going to wajib didahului be.'),
      mcq(10, 'A: "The phone is ringing." B: "OK, ___ it."', ['I\'ll answer', 'I\'ll answering', 'I will to answer', 'I am answer'], 'I\'ll answer', 'Keputusan spontan yang dibuat saat berbicara memakai will (disingkat \'ll) + V1: I\'ll answer. Pilihan lain salah bentuk karena sesudah will tidak ada -ing atau to.'),
      mcq(11, 'I will call you when I ___ at the station.', ['arrive', 'will arrive', 'am going to arrive', 'arriving'], 'arrive', 'Sesudah when dalam time clause dipakai present simple walaupun maksudnya masa depan: when I arrive. Will hanya ada di bagian kalimat utama.'),
      mcq(12, 'If it ___ tomorrow, we will cancel the picnic.', ['rains', 'will rain', 'will rains', 'raining'], 'rains', 'Sesudah if dipakai present simple, bukan will. Subjek it membutuhkan akhiran -s: rains. Will berada di bagian hasil: we will cancel.'),
      mcq(13, 'Which sentence is a correct nominal (non-verbal) sentence?', ['She will happy with the result.', 'She will be happy with the result.', 'She will is happy with the result.', 'She be will happy with the result.'], 'She will be happy with the result.', 'Kalimat nominal masa depan: S + will + be + complement. "Happy" adalah kata sifat, jadi perlu be sesudah will. Be tidak berubah menjadi is dan tidak boleh mendahului will.'),
      fill(14, 'Lengkapi dengan satu kata: The package will ___ delivered tomorrow morning.', ['be'], 'Paket diantar (pasif), jadi polanya will + be + V3: will be delivered. Tanpa be, kalimat pasif tidak lengkap.'),
      fill(15, 'Lengkapi dengan V3 dari "send": The invitations will be ___ next Monday.', ['sent'], 'Pasif Simple Future memakai will be + V3. V3 dari send adalah sent (send, sent, sent), bukan send atau sended.'),
      fill(16, 'Tulis singkatan satu kata dari will not: Don\'t worry, I ___ forget your birthday.', ['won\'t', 'won’t'], 'Singkatan will not adalah won\'t. Bentuknya tidak beraturan: bukan "willn\'t".'),
      fill(17, 'Lengkapi dengan bentuk yang tepat: She will call you as soon as she ___ her class. (finish / finishes / will finish)', ['finishes'], 'Sesudah as soon as dipakai present simple, bukan will. Subjek she membutuhkan akhiran -es: finishes.'),
      fill(18, 'Lengkapi dengan bentuk yang tepat: The staff will not ___ late tomorrow. (be / is / are)', ['be'], '"Late" adalah kata sifat, jadi kalimat ini nominal: will + not + be + complement. Sesudah will, be tidak berubah menjadi is atau are.'),
      fill(19, 'Lengkapi dengan Shall atau Will untuk membuat ajakan: ___ we start the meeting now?', ['Shall'], 'Ajakan atau saran dengan subjek we memakai Shall we + V1? Will we...? hanya menanyakan apakah sesuatu akan terjadi, bukan mengajak.'),
      fill(20, 'Lengkapi dengan am, is, atau are: My sister ___ going to study in Bandung next year.', ['is'], 'Pada be going to, be mengikuti subjek. "My sister" sama dengan she, jadi dipakai is: is going to study.'),
      g(21, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat pasif Simple Future yang benar.',
        explanation_id: 'Pasif Simple Future: S + will + be + V3 + keterangan waktu. Urutannya: The report will be sent tomorrow.',
        segments: ['The report', 'will', 'be', 'sent', 'tomorrow.'],
      }),
      g(22, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat tanya nominal yang benar.',
        explanation_id: 'Tanya nominal: Will + S + be + complement? Will pindah ke depan subjek, sedangkan be tetap sesudah subjek: Will the shop be open next Sunday?',
        segments: ['Will', 'the shop', 'be', 'open', 'next Sunday?'],
      }),
      g(23, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat aktif negatif yang benar.',
        explanation_id: 'Negatif aktif: S + will + not + V1 + objek. Not selalu berada tepat sesudah will: They will not attend the seminar.',
        segments: ['They', 'will', 'not', 'attend', 'the seminar.'],
      }),
      g(24, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi pertanyaan WH yang benar.',
        explanation_id: 'Tanya WH: kata tanya + will + S + V1? Will berada di antara kata tanya dan subjek: What time will the train leave?',
        segments: ['What time', 'will', 'the train', 'leave?'],
      }),
      g(25, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah.',
        explanation_id: 'Sesudah will, kata kerja selalu bentuk dasar walaupun subjeknya she. Yang benar: She will go, bukan will goes.',
        tokens: ['She', 'will', 'goes', 'to', 'Jakarta', 'next', 'week.'],
        correct_answers: [2],
      }),
      g(26, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang tidak seharusnya ada.',
        explanation_id: 'Will langsung mengikuti subjek dan tidak butuh is di depannya. Yang benar: He will come to the office tomorrow.',
        tokens: ['He', 'is', 'will', 'come', 'to', 'the', 'office', 'tomorrow.'],
        correct_answers: [1],
      }),
      g(27, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang tidak seharusnya ada.',
        explanation_id: 'Sesudah when dipakai present simple, jadi will yang kedua harus dibuang: I will call you when I arrive. Will yang pertama benar karena berada di kalimat utama.',
        tokens: ['I', 'will', 'call', 'you', 'when', 'I', 'will', 'arrive.'],
        correct_answers: [6],
      }),
      g(28, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap kalimat dengan polanya.',
        explanation_id: '"Will be announced" = will + be + V3 (pasif, pemenang diumumkan). "Will be hungry" = will + be + kata sifat (nominal). "Will announce" = will + V1 (aktif, panitia mengumumkan).',
        points: 3,
        matching: {
          left: ['The winner will be announced tonight.', 'The guests will be hungry after the trip.', 'The committee will announce the winner tonight.'],
          right: ['Verbal pasif: will + be + V3', 'Nominal: will + be + complement', 'Verbal aktif: will + V1', 'Be going to + V1'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(29, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan setiap kalimat dengan fungsinya.',
        explanation_id: '"I\'ll help you" adalah tawaran yang muncul saat berbicara (will). "We are going to move... we have already signed" adalah rencana yang sudah diputuskan (be going to). "Shall we...?" adalah ajakan atau saran (shall dengan we).',
        points: 3,
        matching: {
          left: ['I\'ll help you with those bags.', 'We are going to move house next month; we have already signed the contract.', 'Shall we take a short break?'],
          right: ['Tawaran spontan (will)', 'Rencana yang sudah diputuskan (be going to)', 'Ajakan atau saran (shall)', 'Jadwal tetap (Present Simple)'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(30, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih SEMUA kalimat yang benar.',
        explanation_id: 'Tiga kalimat benar: "will start" (aktif, will + V1), "will be announced" (pasif, will + be + V3), dan "will not be late" (nominal negatif). "Will to send" salah karena sesudah will tidak ada to. "Will be join" salah karena kata kerja aksi aktif tidak memakai be.',
        points: 2,
        options: ['The class will start at eight tomorrow.', 'I will to send the file tonight.', 'The winners will be announced next week.', 'She will be join us later.', 'We will not be late.'],
        correct_answers: ['The class will start at eight tomorrow.', 'The winners will be announced next week.', 'We will not be late.'],
      }),
    ],
  },
};

export default sub;
