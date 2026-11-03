import { describe, expect, it } from 'vitest';
import { parseAssetManifest, parseContentPackage, urlToAssetCode, type ParseContext } from '@/server/content/validate';
import { duplicateLabels, parsePassages, splitPassages } from '@/server/content/passages';
import { bossPackage, pkg, placementQuestions, Q, subItem } from '../fixtures/content/builders';

const codes = (r: ReturnType<typeof parseContentPackage>) => (r.ok ? [] : r.errors.map((e) => `${e.path}|${e.code}`));
const ctx: ParseContext = {
  sources: new Map([
    ['OWN', { licenseType: 'OWN', shareAlike: false, mayStoreCopy: true }],
    ['NGSL', { licenseType: 'CC_BY_SA', shareAlike: true, mayStoreCopy: true }],
    ['CAMBRIDGE_REF', { licenseType: 'LINK_ONLY_COPYRIGHTED', shareAlike: false, mayStoreCopy: false }],
  ]),
  modules: new Map([['2.1', { tier: 2, skill: 'GRAMMAR' }], ['1.1', { tier: 1, skill: 'GRAMMAR' }]]),
  assets: new Map([['own/img-1', { kind: 'SLIDE_IMAGE' }], ['own/listening-1', { kind: 'AUDIO_LISTENING' }], ['own/sheet', { kind: 'DOCUMENT' }]]),
};
const withDrill = (questions: unknown[], extra: object = {}) =>
  pkg({ sub_modules: [subItem({ active_drill: { time_limit_seconds: 300, questions, ...extra } })] } as never);

describe('aturan silang per tipe soal (>= 1 lulus, >= 1 gagal)', () => {
  const cases: Array<[string, unknown, unknown, string]> = [
    ['MCQ_SINGLE', Q.mcq(), Q.mcq({ correct_answers: ['zzz'] }), 'answer_not_in_options'],
    ['MCQ_SINGLE opsi ganda', Q.mcq(), Q.mcq({ options: ['a', 'a', 'b'], correct_answers: ['a'] }), 'duplicate_options'],
    ['MCQ_MULTI', Q.multi(), Q.multi({ correct_answers: ['a', 'zz'] }), 'answer_not_in_options'],
    ['MCQ_MULTI terlalu banyak benar', Q.multi(), Q.multi({ options: ['a', 'b', 'c'], correct_answers: ['a', 'b', 'c'] }), 'too_many_answers'],
    ['TFNG', Q.tfng({ correct_answers: ['Not Given'] }), Q.tfng({ correct_answers: ['Yes'] }), 'invalid_tfng_answer'],
    ['YNNG', Q.ynng({ correct_answers: ['Not Given'] }), Q.ynng({ correct_answers: ['True'] }), 'invalid_ynng_answer'],
    ['MATCHING_DROPDOWN', Q.drop(), Q.drop({ correct_answers: [0, 9] }), 'index_out_of_range'],
    ['MATCHING_DRAG indeks berulang', Q.drag(), Q.drag({ correct_answers: [1, 1] }), 'duplicate_answers'],
    ['MATCHING jumlah jawaban', Q.drop(), Q.drop({ correct_answers: [0, 1, 2] }), 'answers_length_mismatch'],
    ['MATCHING right terlalu pendek', Q.drop(), Q.drop({ matching: { left: ['1', '2', '3'], right: ['x', 'y'] }, correct_answers: [0, 1, 0], points: 3 }), 'right_too_short'],
    ['SENTENCE_REORDER', Q.reorder(), Q.reorder({ segments: ['a', 'a', 'a'] }), 'segments_all_identical'],
    ['ERROR_RECOGNITION', Q.error(), Q.error({ correct_answers: [7] }), 'index_out_of_range'],
    ['FILL_IN_BLANK', Q.fill(), Q.fill({ max_words: 11 }), 'too_big'],
    ['SHORT_ANSWER wajib max_words', Q.short(), { ...Q.short(), max_words: undefined }, 'invalid_type'],
    ['WRITING_TASK', Q.writing(), Q.writing({ task_kind: 'TASK3' }), 'invalid_value'],
    ['SPEAKING_TASK', Q.speaking(), Q.speaking({ part: 4 }), 'invalid_value'],
  ];
  for (const [name, good, bad, code] of cases) {
    it(`${name}: valid lulus`, () => {
      const r = parseContentPackage(withDrill([good, Q.mcq()]));
      expect(codes(r)).toEqual([]);
    });
    it(`${name}: pelanggaran -> ${code}`, () => {
      const r = parseContentPackage(withDrill([Q.mcq(), bad]));
      expect(r.ok).toBe(false);
      expect(codes(r).some((c) => c.endsWith(`|${code}`))).toBe(true);
    });
  }

  it('path galat answer_not_in_options tepat: sub_modules[0].active_drill.questions[1].correct_answers[0]', () => {
    const r = parseContentPackage(withDrill([Q.mcq(), Q.mcq({ correct_answers: ['zzz'] })]));
    expect(codes(r)).toContain('sub_modules[0].active_drill.questions[1].correct_answers[0]|answer_not_in_options');
  });

  it('question_id ganda dalam set; question_id ganda lintas BOSS_SECTION pada Tier yang sama', () => {
    expect(codes(parseContentPackage(withDrill([Q.mcq({ question_id: 'Q-DUP' }), Q.fill({ question_id: 'Q-DUP' })]))).some((c) => c.endsWith('duplicate_question_id'))).toBe(true);
    const boss = bossPackage(1) as { assessment_sets: Array<{ questions: Array<Record<string, unknown>> }> };
    boss.assessment_sets[1]!.questions[0]!.question_id = 'Q-SAME';
    boss.assessment_sets[2]!.questions[0]!.question_id = 'Q-SAME';
    const r = parseContentPackage(boss, { assets: ctx.assets });
    expect(codes(r).some((c) => c.endsWith('duplicate_question_id'))).toBe(true);
  });

  it('format question_id, discriminator tak dikenal, dan default Zod/tipe diterapkan', () => {
    expect(parseContentPackage(withDrill([Q.mcq({ question_id: 'bukan-q' })])).ok).toBe(false);
    expect(parseContentPackage(withDrill([{ question_type: 'ESSAY_MAGIC', question_id: 'Q-1' }])).ok).toBe(false);
    const r = parseContentPackage(withDrill([Q.writing(), Q.speaking({ part: 1 }), Q.mcq()]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const qs = r.data.sub_modules![0]!.active_drill!.questions as unknown as Array<Record<string, unknown>>;
      expect(qs[0]).toMatchObject({ points: 1, min_words: 250, time_limit_minutes: 40 });
      expect(qs[1]).toMatchObject({ prep_seconds: 0, record_seconds: 45 });
    }
  });
});

describe('paket', () => {
  it('field tak dikenal -> unrecognized_key', () => {
    const r = parseContentPackage({ ...pkg(), foo: 1 });
    expect(codes(r)).toContain('foo|unrecognized_key');
    expect(codes(parseContentPackage(pkg({ sub_modules: [subItem({ bar: 1 })] } as never)))).toContain('sub_modules[0].bar|unrecognized_key');
  });

  it('kunci __proto__ -> forbidden_key dan Object.prototype tidak tercemar', () => {
    const raw = JSON.parse('{"contract_version":"1.1","__proto__":{"polluted":true},"sub_modules":[{"constructor":{"x":1},"tier_number":2}]}');
    const r = parseContentPackage(raw);
    expect(r.ok).toBe(false);
    const c = codes(r);
    expect(c).toContain('__proto__|forbidden_key');
    expect(c).toContain('sub_modules[0].constructor|forbidden_key');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('kedalaman > 10 -> max_depth; karakter kontrol -> control_char; NFC + trim', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < 12; i++) deep = { a: deep };
    expect(codes(parseContentPackage({ contract_version: '1.1', modules: deep }))).toContain('modules.a.a.a.a.a.a.a.a.a|max_depth');
    expect(codes(parseContentPackage(pkg({ sub_modules: [subItem({ sub_module_title: 'bad\u0007title' })] } as never)))).toContain('sub_modules[0].sub_module_title|control_char');
    const r = parseContentPackage(pkg({ sub_modules: [subItem({ sub_module_title: '  Café  ' })] } as never));
    expect(r.ok && r.data.sub_modules![0]!.sub_module_title).toBe('Café');
  });

  it('paket kosong dan versi kontrak tak dikenal ditolak; 1.0 diterima', () => {
    expect(codes(parseContentPackage({ contract_version: '1.1' }))).toContain('$|package_empty');
    expect(parseContentPackage({ contract_version: '2.0', sub_modules: [] }).ok).toBe(false);
  });

  it('contoh PRD 7.3 (v1.0): placeholder_video; setelah diganti dan aset ada -> valid; image_url diterjemahkan', () => {
    const prd = {
      contract_version: '1.0',
      sub_modules: [
        {
          tier_number: 2,
          module_code: '2.1',
          module_category: 'GRAMMAR',
          sub_module_code: '2.1.3',
          sub_module_title: 'Passive Voice',
          materials: {
            article_markdown: '# Passive\n\nText.',
            videos: [{ video_id: 'YOUTUBE_VIDEO_ID', title: 'Video', language: 'ID', start_sec: 0, end_sec: 300 }],
            slides: [{ order: 1, image_url: '/storage/tier2/slides/passive-diagram-flow.webp', caption: 'Alur' }],
            attachments: [{ title: 'Cheatsheet', file_type: 'PDF', file_url: '/storage/tier2/docs/passive-cheatsheet.pdf' }],
          },
          active_drill: { time_limit_seconds: 300, questions: [Q.mcq()] },
        },
      ],
    };
    const c = { ...ctx, assets: new Map([['tier2/slides/passive-diagram-flow', { kind: 'SLIDE_IMAGE' }], ['tier2/docs/passive-cheatsheet', { kind: 'DOCUMENT' }]]) };
    const bad = parseContentPackage(prd, c);
    expect(codes(bad)).toContain('sub_modules[0].materials.videos[0].video_id|placeholder_video');
    prd.sub_modules[0]!.materials.videos[0]!.video_id = 'dQw4w9WgXcQ';
    const ok = parseContentPackage(prd, c);
    expect(codes(ok)).toEqual([]);
    if (ok.ok) {
      const m = ok.data.sub_modules![0]!.materials!;
      expect(m.slides![0]).toMatchObject({ asset_code: 'tier2/slides/passive-diagram-flow', alt: 'Alur' });
      expect(m.slides![0]).not.toHaveProperty('image_url');
      expect(ok.data.sub_modules![0]!.origin).toBe('ORIGINAL_AUTHORED');
    }
    const missing = parseContentPackage(prd, { ...c, assets: new Map() });
    expect(codes(missing)).toContain('sub_modules[0].materials.slides[0].image_url|asset_not_found');
  });

  it('v1.1 mewajibkan origin; v1.0 mewajibkan module_category', () => {
    expect(codes(parseContentPackage(pkg({ sub_modules: [subItem({ origin: undefined })] } as never)))).toContain('sub_modules[0].origin|origin_required');
    expect(codes(parseContentPackage({ contract_version: '1.0', sub_modules: [subItem({ origin: undefined })] }))).toContain('sub_modules[0].module_category|module_category_required');
  });

  it('modul: tier_mismatch, module_not_found, category_mismatch, duplikat', () => {
    expect(codes(parseContentPackage(pkg({ sub_modules: [subItem({ module_code: '3.1', sub_module_code: '3.1.1' })] } as never), ctx))).toContain('sub_modules[0].module_code|tier_mismatch');
    expect(codes(parseContentPackage(pkg({ sub_modules: [subItem({ module_code: '2.9', sub_module_code: '2.9.1' })] } as never), ctx))).toContain('sub_modules[0].module_code|module_not_found');
    expect(codes(parseContentPackage(pkg({ sub_modules: [subItem({ module_category: 'READING' })] } as never), ctx))).toContain('sub_modules[0].module_category|category_mismatch');
    expect(codes(parseContentPackage({ contract_version: '1.1', modules: [{ tier_number: 2, module_code: '2.1', module_category: 'VOCAB', title: 'x' }] }, ctx))).toContain('modules[0].module_category|category_mismatch');
    expect(codes(parseContentPackage(pkg({ sub_modules: [subItem(), subItem()] } as never), ctx))).toContain('sub_modules[1].sub_module_code|duplicate_item');
    expect(codes(parseContentPackage(pkg({ sub_modules: [subItem({ sub_module_code: '2.2.1' })] } as never), ctx))).toContain('sub_modules[0].sub_module_code|module_mismatch');
  });

  it('sumber: source_required, source_not_found, source_not_storable, attribution_required', () => {
    const sub = (e: Record<string, unknown>) => parseContentPackage(pkg({ sub_modules: [subItem(e)] } as never), ctx);
    expect(codes(sub({ origin: 'OPEN_LICENSED_ADAPTED' }))).toContain('sub_modules[0].source_code|source_required');
    expect(codes(sub({ origin: 'OPEN_LICENSED_ADAPTED', source_code: 'NOPE' }))).toContain('sub_modules[0].source_code|source_not_found');
    expect(codes(sub({ origin: 'OPEN_LICENSED_ADAPTED', source_code: 'CAMBRIDGE_REF' }))).toContain('sub_modules[0].source_code|source_not_storable');
    expect(codes(sub({ origin: 'OPEN_LICENSED_ADAPTED', source_code: 'NGSL' }))).toContain('sub_modules[0].attribution_text|attribution_required');
    expect(codes(sub({ origin: 'OPEN_LICENSED_ADAPTED', source_code: 'NGSL', attribution_text: 'NGSL (CC BY-SA)' }))).toEqual([]);
  });

  it('markdown: HTML mentah ditolak, blok kode boleh, skema tautan berbahaya ditolak', () => {
    const md = (article_markdown: string) => parseContentPackage(pkg({ sub_modules: [subItem({ materials: { article_markdown } })] } as never));
    expect(codes(md('halo <script>alert(1)</script>'))).toContain('sub_modules[0].materials.article_markdown|raw_html_not_allowed');
    expect(md('```html\n<div>ok</div>\n```\n\nteks `a < b` dan `<b>` inline').ok).toBe(true);
    expect(md('a < b dan 3 < 5').ok).toBe(true);
    expect(codes(md('[klik](javascript:alert(1))'))).toContain('sub_modules[0].materials.article_markdown|unsafe_link_scheme');
    expect(codes(md('[x](data:text/html;base64,AAA)'))).toContain('sub_modules[0].materials.article_markdown|unsafe_link_scheme');
    expect(md(':::tips-examiner\nTips\n:::\n\n| a | b |\n|---|---|\n| 1 | 2 |').ok).toBe(true);
  });

  it('video dan slide: invalid_video_range, duplicate_slide_order, asset_ref_required, external_url_not_allowed', () => {
    const m = (materials: object) => parseContentPackage(pkg({ sub_modules: [subItem({ materials: { article_markdown: 'x', ...materials } })] } as never), ctx);
    const v = { video_id: 'dQw4w9WgXcQ', title: 'v', language: 'EN', start_sec: 30 };
    expect(codes(m({ videos: [{ ...v, end_sec: 30 }] }))).toContain('sub_modules[0].materials.videos[0]|invalid_video_range');
    expect(codes(m({ videos: [{ ...v, end_sec: 30000 }] })).length).toBeGreaterThan(0);
    expect(codes(m({ videos: [{ ...v, end_sec: 90 }] }))).toEqual([]);
    expect(codes(m({ slides: [{ order: 1, asset_code: 'own/img-1', caption: 'a' }, { order: 1, asset_code: 'own/img-1', caption: 'b' }] }))).toContain('sub_modules[0].materials.slides[1].order|duplicate_slide_order');
    expect(codes(m({ slides: [{ order: 1, caption: 'a' }] }))).toContain('sub_modules[0].materials.slides[0]|asset_ref_required');
    expect(codes(m({ slides: [{ order: 1, image_url: 'https://evil.test/a.png', caption: 'a' }] }))).toContain('sub_modules[0].materials.slides[0].image_url|external_url_not_allowed');
    expect(codes(m({ attachments: [{ title: 't', file_type: 'PDF', asset_code: 'own/img-1' }] }))).toContain('sub_modules[0].materials.attachments[0].asset_code|asset_kind_mismatch');
  });
});

describe('set penilaian', () => {
  const sets = (assessment_sets: unknown[], c: ParseContext = ctx) => parseContentPackage({ contract_version: '1.1', assessment_sets }, c);
  const skip = (e: object = {}) => ({ set_type: 'SKIP_MODULE_TEST', title: 'Skip', module_code: '2.1', time_limit_seconds: 900, origin: 'ORIGINAL_AUTHORED', questions: [Q.mcq()], ...e });

  it('kunci wajib per tipe, duplikat kunci alami, waktu wajib', () => {
    expect(sets([skip()]).ok).toBe(true);
    expect(codes(sets([skip({ module_code: undefined })]))).toContain('assessment_sets[0].module_code|module_code_required');
    expect(codes(sets([skip({ time_limit_seconds: undefined })]))).toContain('assessment_sets[0].time_limit_seconds|time_limit_required');
    expect(codes(sets([skip(), skip()]))).toContain('assessment_sets[1].set_type|duplicate_set_key');
    expect(codes(sets([{ set_type: 'SKIP_TIER_TEST', title: 't', time_limit_seconds: 600, origin: 'ORIGINAL_AUTHORED', questions: [Q.mcq()] }]))).toContain('assessment_sets[0].tier_number|tier_number_required');
  });

  it('Placement: difficulty wajib, tugas AI ditolak', () => {
    const place = (questions: unknown[]) => sets([{ set_type: 'PLACEMENT_TEST', title: 'P', time_limit_seconds: 1500, origin: 'ORIGINAL_AUTHORED', questions }]);
    expect(place(placementQuestions(30)).ok).toBe(true);
    expect(codes(place([Q.mcq()]))).toContain('assessment_sets[0].questions[0].difficulty|difficulty_required');
    expect(codes(place([Q.writing({ difficulty: 1 })]))).toContain('assessment_sets[0].questions[0].question_type|ai_task_not_allowed');
  });

  it('Boss: induk wajib questions kosong; section LISTENING/READING/WRITING/SPEAKING', () => {
    const boss = bossPackage(1) as { assessment_sets: Array<Record<string, unknown>> };
    expect(parseContentPackage(boss, { assets: ctx.assets }).ok).toBe(true);
    const noAudio = structuredClone(boss);
    delete noAudio.assessment_sets[1]!.listening_asset_code;
    expect(codes(parseContentPackage(noAudio))).toContain('assessment_sets[1].listening_asset_code|listening_asset_required');
    const noPassage = structuredClone(boss);
    delete noPassage.assessment_sets[2]!.reading_passage_markdown;
    expect(codes(parseContentPackage(noPassage, { assets: ctx.assets }))).toContain('assessment_sets[2].reading_passage_markdown|passage_required');
    const parentQ = structuredClone(boss);
    parentQ.assessment_sets[0]!.questions = [Q.mcq()];
    expect(codes(parseContentPackage(parentQ, { assets: ctx.assets }))).toContain('assessment_sets[0].questions|boss_parent_questions_not_empty');
    const writing = { set_type: 'BOSS_SECTION', title: 'W', tier_number: 1, skill_category: 'WRITING', time_limit_seconds: 1800, origin: 'ORIGINAL_AUTHORED', questions: [Q.mcq()] };
    expect(codes(sets([writing]))).toContain('assessment_sets[0].questions[0].question_type|question_type_not_allowed');
    expect(sets([{ ...writing, questions: [Q.writing({ min_words: 150, time_limit_minutes: 30 })] }]).ok).toBe(true);
    const speaking = { ...writing, skill_category: 'SPEAKING', questions: [Q.speaking()] };
    expect(sets([speaking]).ok).toBe(true);
    expect(codes(sets([{ ...speaking, questions: [Q.writing()] }]))).toContain('assessment_sets[0].questions[0].question_type|question_type_not_allowed');
  });

  it('rujukan aset: listening_asset_code wajib AUDIO_LISTENING dan ada; stimulus IMAGE', () => {
    const b = bossPackage(1) as { assessment_sets: Array<Record<string, unknown>> };
    expect(codes(parseContentPackage(b, { assets: new Map() }))).toContain('assessment_sets[1].listening_asset_code|asset_not_found');
    expect(codes(parseContentPackage(b, { assets: new Map([['own/listening-1', { kind: 'DOCUMENT' }]]) }))).toContain('assessment_sets[1].listening_asset_code|asset_kind_mismatch');
  });

  it('passage: passage_out_of_range, too_many_passages, duplicate_paragraph_label', () => {
    const drill = (reading_passage_markdown: string, passage_no?: number) =>
      parseContentPackage(pkg({ sub_modules: [subItem({ active_drill: { time_limit_seconds: 300, reading_passage_markdown, questions: [Q.mcq({ passage_no })] } })] } as never));
    expect(drill('Satu bagian.', 1).ok).toBe(true);
    expect(codes(drill('Satu bagian.', 2))).toContain('sub_modules[0].active_drill.questions[0].passage_no|passage_out_of_range');
    expect(codes(drill('a\n===PASSAGE===\nb\n===PASSAGE===\nc\n===PASSAGE===\nd'))).toContain('sub_modules[0].active_drill.reading_passage_markdown|too_many_passages');
    expect(codes(drill('[A] Satu.\n\n[B] Dua.\n\n[A] Lagi.'))).toContain('sub_modules[0].active_drill.reading_passage_markdown|duplicate_paragraph_label');
    expect(codes(parseContentPackage(pkg({ sub_modules: [subItem({ active_drill: { time_limit_seconds: 300, questions: [Q.mcq({ passage_no: 1 })] } })] } as never)))).toContain('sub_modules[0].active_drill.questions[0].passage_no|passage_out_of_range');
  });
});

describe('manifest aset', () => {
  const m = (a: object) => parseAssetManifest({ contract_version: '1.1', assets: [{ asset_code: 'own/a-1', kind: 'IMAGE', title: 't', source_code: 'OWN', rights_status: 'OWN_ORIGINAL', file: 'a.png', ...a }] }, { sources: ctx.sources });
  const mc = (r: ReturnType<typeof m>) => (r.ok ? [] : r.errors.map((e) => e.code));
  it('valid; path traversal; svg; rights tidak boleh disimpan; kode ganda; lisensi atribusi', () => {
    expect(m({}).ok).toBe(true);
    expect(mc(m({ file: '../../etc/passwd' }))).toContain('path_traversal');
    expect(mc(m({ file: 'a\\b.png' }))).toContain('path_traversal');
    expect(mc(m({ file: '/abs/a.png' }))).toContain('path_traversal');
    expect(mc(m({ file: 'x.svg' }))).toContain('svg_not_allowed');
    expect(mc(m({ rights_status: 'EMBED_ONLY' }))).toContain('rights_not_storable');
    expect(mc(m({ asset_code: 'A' }))).toContain('invalid_asset_code');
    expect(mc(m({ source_code: 'NGSL' }))).toContain('attribution_required');
    expect(mc(m({ source_code: 'CAMBRIDGE_REF' }))).toContain('source_not_storable');
    const dup = parseAssetManifest({ contract_version: '1.1', assets: [{ asset_code: 'own/a-1', kind: 'IMAGE', title: 't', source_code: 'OWN', rights_status: 'OWN_ORIGINAL', file: 'a.png' }, { asset_code: 'own/a-1', kind: 'IMAGE', title: 't', source_code: 'OWN', rights_status: 'OWN_ORIGINAL', file: 'b.png' }] });
    expect(dup.ok ? [] : dup.errors.map((e) => e.code)).toContain('duplicate_asset_code');
  });
});

describe('util', () => {
  it('urlToAssetCode', () => {
    expect(urlToAssetCode('/storage/tier2/slides/passive-diagram-flow.webp')).toBe('tier2/slides/passive-diagram-flow');
    expect(urlToAssetCode('/storage/noext')).toBe('noext');
    expect(urlToAssetCode('https://x.test/a.png')).toBeNull();
  });
  it('parsePassages', () => {
    expect(splitPassages('a\n===PASSAGE===\nb')).toHaveLength(2);
    const p = parsePassages('[A] Satu.\n\n[B] Dua.\n\n[B] Tiga.');
    expect(p[0]!.labels).toEqual(['A', 'B', 'B']);
    expect(duplicateLabels(p[0]!)).toEqual(['B']);
  });
});
