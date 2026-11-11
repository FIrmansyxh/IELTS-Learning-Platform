const P = 'Q-VC411-';
const g = (n, rest) => ({ question_id: `${P}${String(n).padStart(3, '0')}`, skill: 'VOCAB', ...rest });
const mcq = (n, prompt, options, answer, explanation_id) =>
  g(n, { question_type: 'MCQ_SINGLE', prompt, explanation_id, options, correct_answers: [answer] });
const fill = (n, prompt, answers, explanation_id, max_words = 1) =>
  g(n, { question_type: 'FILL_IN_BLANK', prompt, explanation_id, correct_answers: answers, max_words });

const sub = {
  meta: {
    tier_number: 4,
    module_code: '4.1',
    module_category: 'VOCAB',
    sub_module_title: 'Penguasaan Academic Word List (AWL) & Kolokasi Topik Utama',
  },
  mini_task: {
    task_type: 'AI_SHORT_WRITING',
    prompt:
      'Tulis satu paragraf Writing Task 2 (sekitar 110 sampai 140 kata) dalam bahasa Inggris tentang: "Some people think the internet has had a negative effect on society. Discuss."\n\nWajib memakai:\n- minimal 6 kolokasi akademik yang benar (mis. pose a threat, have a significant impact on, a growing number of, draw a conclusion, raise awareness, take steps, play a vital role)\n- minimal 2 anggota word family yang berbeda dari satu akar (mis. benefit/beneficial, significant/significantly)\n- register formal tanpa slang\n- tidak ada statistik karangan',
    ai_rubric_criteria:
      'Lexical Resource: kolokasi akademik benar dan natural (conduct research, draw a conclusion, impact on), word family bervariasi, tidak ada kolokasi salah (do research, make a conclusion, impact to), register formal. Grammar: preposisi dan kelas kata tepat. Task Response: paragraf fokus pada satu ide dan dikembangkan. Coherence: penghubung tepat. Memaksakan kata sulit yang salah membatasi skor.',
  },
  drill: {
    time_limit_seconds: 900,
    questions: [
      mcq(1, 'Which collocation is correct?', ['conduct research', 'do research', 'make research', 'take research'], 'conduct research', 'Kolokasi akademik: conduct (atau carry out) research.'),
      mcq(2, 'Which collocation is correct?', ['draw a conclusion', 'make a conclusion', 'do a conclusion', 'take a conclusion'], 'draw a conclusion', 'Kolokasi tetap: draw a conclusion.'),
      mcq(3, 'Which preposition is correct? "The internet has had a major impact ___ society."', ['on', 'to', 'for', 'at'], 'on', 'Impact on + noun.'),
      mcq(4, 'Which adjective best collocates with "increase" in a formal essay?', ['significant', 'big', 'huge-ish', 'a lot'], 'significant', 'Significant increase adalah kolokasi akademik; big kurang formal.'),
      mcq(5, 'Choose the best word: Plastic waste ___ a serious threat to marine life.', ['poses', 'makes', 'does', 'gives'], 'poses', 'Kolokasi tetap: pose a threat.'),
      mcq(6, 'Which sentence is correct?', ['Cost is a key factor.', 'Cost is a key factors.', 'Cost are a key factor.', 'Cost is key factor.'], 'Cost is a key factor.', 'A key factor: tunggal dengan artikel a.'),
      mcq(7, 'What does "detrimental" mean?', ['harmful', 'useful', 'expensive', 'temporary'], 'harmful', '"Detrimental" berarti merugikan; lawan dari beneficial.'),
      mcq(8, 'Which word is the adjective form of "benefit"?', ['beneficial', 'beneficially', 'benefits', 'benefiting'], 'beneficial', 'Benefit (noun/verb), beneficial (adjective), beneficially (adverb).'),
      mcq(9, 'Which sentence is more formal and accurate?', ['A growing number of people have access to online education.', 'Lots of people can get to online education.', 'Many kids can get online school.', 'Online education is for everyone, you know.'], 'A growing number of people have access to online education.', '"A growing number of" dan "have access to" adalah kolokasi akademik; pilihan lain informal atau salah.'),
      mcq(10, 'Which verb means "to show clearly"?', ['demonstrate', 'ignore', 'assume', 'estimate'], 'demonstrate', '"Demonstrate" berarti memperlihatkan atau membuktikan dengan jelas.'),
      fill(11, 'Lengkapi: Schools must ___ the needs of all students. (kolokasi: memenuhi kebutuhan)', ['meet'], 'Kolokasi tetap: meet needs/demand/requirements.'),
      fill(12, 'Lengkapi: Education ___ a vital role in development. (kolokasi: berperan)', ['plays'], 'Kolokasi tetap: play a role.'),
      fill(13, 'Lengkapi dengan preposisi: Many people lack access ___ clean water.', ['to'], 'Access to + noun.'),
      fill(14, 'Lengkapi: There is a strong ___ between income and health. (hubungan statistik antara dua hal)', ['correlation', 'link', 'relationship', 'connection'], 'Correlation = hubungan statistik antara dua variabel; link, relationship, dan connection juga wajar.'),
      fill(15, 'Lengkapi dengan bentuk adverb dari "significant": Prices rose ___ last year.', ['significantly'], 'Setelah kata kerja diperlukan adverb: significantly.'),
      g(16, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat akademik yang benar.',
        explanation_id: 'Pola: subjek + pose + a serious threat + to + objek.',
        segments: ['Plastic waste', 'poses a serious threat', 'to marine', 'life.'],
      }),
      g(17, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (kolokasi).',
        explanation_id: 'Kolokasi akademik adalah "conduct research", bukan "do research".',
        tokens: ['Scientists', 'do', 'research', 'to', 'find', 'a', 'solution.'],
        correct_answers: [1],
      }),
      g(18, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (preposisi).',
        explanation_id: 'Kolokasi: impact on + noun, bukan impact to.',
        tokens: ['Technology', 'has', 'a', 'major', 'impact', 'to', 'society.'],
        correct_answers: [5],
      }),
      g(19, {
        question_type: 'MATCHING_DROPDOWN',
        prompt: 'Cocokkan kata dengan artinya.',
        explanation_id: 'Feasible = layak dilakukan; inevitable = tak terhindarkan; controversial = menimbulkan perdebatan.',
        points: 3,
        matching: {
          left: ['feasible', 'inevitable', 'controversial'],
          right: ['possible and practical', 'impossible to avoid', 'causing disagreement', 'very small'],
          allow_reuse: false,
        },
        correct_answers: [0, 1, 2],
      }),
      g(20, {
        question_type: 'MCQ_MULTI',
        prompt: 'Pilih DUA kolokasi yang benar.',
        explanation_id: 'Raise awareness dan take measures adalah kolokasi tetap. "Do a conclusion" dan "make research" salah.',
        points: 2,
        options: ['raise awareness', 'take measures', 'do a conclusion', 'make research'],
        correct_answers: ['raise awareness', 'take measures'],
      }),
      mcq(21, 'Which preposition is correct? "There is a growing demand ___ affordable housing."', ['for', 'to', 'on', 'of'], 'for', 'Kolokasi noun + preposition: demand for + noun.'),
      mcq(22, 'Which sentence is correct?', ['The research shows that exercise is beneficial.', 'The researches show that exercise is beneficial.', 'The research show that exercise is beneficial.', 'The researches shows that exercise is beneficial.'], 'The research shows that exercise is beneficial.', '"Research" uncountable: tanpa -s dan memakai kata kerja tunggal (shows).'),
      mcq(23, 'What does "fluctuate" mean?', ['to go up and down repeatedly', 'to rise steadily', 'to stay the same', 'to fall to zero'], 'to go up and down repeatedly', '"Fluctuate" berarti naik-turun, misalnya: Prices fluctuated over the decade.'),
      mcq(24, 'Choose the correct word form: "The team will ___ the data next week."', ['analyse', 'analysis', 'analytical', 'analytically'], 'analyse', 'Setelah "will" diperlukan kata kerja: analyse. Analysis = noun, analytical = adjective, analytically = adverb.'),
      mcq(25, 'Choose the best word: "The problem ___ from poor planning."', ['stems', 'poses', 'raises', 'conducts'], 'stems', '"Stem from" (atau derive from) berarti berasal dari.'),
      fill(26, 'Lengkapi dengan preposisi: Experts are still looking for a solution ___ the problem.', ['to', 'for'], 'Kolokasi yang lazim: a solution to + noun.'),
      fill(27, 'Lengkapi: Campaigns can ___ awareness of health issues. (kolokasi: meningkatkan kesadaran)', ['raise', 'increase', 'heighten'], 'Kolokasi tetap: raise awareness.'),
      fill(28, 'Lengkapi dengan bentuk noun dari kata kerja analyse: The ___ of the data took two weeks.', ['analysis'], 'Setelah "the" dan sebelum "of" diperlukan noun: analysis.'),
      g(29, {
        question_type: 'SENTENCE_REORDER',
        prompt: 'Susun menjadi kalimat akademik yang benar.',
        explanation_id: 'Pola: subjek + should + take steps + to ensure + objek (access to + noun).',
        segments: ['Governments should', 'take steps', 'to ensure', 'equal access to education.'],
      }),
      g(30, {
        question_type: 'ERROR_RECOGNITION',
        prompt: 'Klik kata yang salah (kolokasi).',
        explanation_id: 'Kolokasi tetap adalah "take action", jadi seharusnya "took action", bukan "made action".',
        tokens: ['The', 'government', 'made', 'action', 'to', 'reduce', 'pollution.'],
        correct_answers: [2],
      }),
    ],
  },
};

export default sub;
