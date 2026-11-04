import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assessmentSets, auditLog, contentAssets, contentRevisions } from '@/db/schema';
import { closeDb, getDb } from '@/server/db';
import { runImport, validatePackage, contextFromDb } from '@/server/content/import-service';
import { FsStorageDriver } from '@/server/storage';
import { Q, placementQuestions } from '../fixtures/content/builders';

const db = getDb();
let storageRoot: string;
let storage: FsStorageDriver;
const dirs: string[] = [];

beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), 'store-'));
  storage = new FsStorageDriver(storageRoot);
  process.env.ASSETS_DIR = storageRoot;
});
afterAll(async () => {
  await closeDb();
  for (const d of [...dirs, storageRoot]) await rm(d, { recursive: true, force: true });
});

async function resetContent() {
  await db.execute(sql`DELETE FROM assessment_sets`);
  await db.execute(sql`DELETE FROM learning_materials`);
  await db.execute(sql`DELETE FROM content_revisions`);
  await db.execute(sql`DELETE FROM content_assets`);
  await db.execute(sql`UPDATE sub_modules SET status = 'DRAFT', content_version = 1`);
  await db.execute(sql`UPDATE modules SET status = 'DRAFT'`);
}
beforeEach(resetContent);

const png = (color: string) => sharp({ create: { width: 16, height: 16, channels: 3, background: color } }).png().toBuffer();
function wav(seconds: number) {
  const rate = 8000, data = Buffer.alloc(rate * seconds), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate, 28);
  h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

interface PackageOpts {
  noDrill?: boolean;
  placementSize?: number;
  withBoss?: boolean;
  editQuestion?: string;
  skipVideo?: boolean;
}
async function makePackage(o: PackageOpts = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'content-'));
  dirs.push(dir);
  await mkdir(path.join(dir, 'assets'), { recursive: true });
  await writeFile(path.join(dir, 'assets', 'slide1.png'), await png('#336699'));
  await writeFile(path.join(dir, 'assets', 'sheet.pdf'), PDF);
  await writeFile(path.join(dir, 'assets', 'listen.wav'), wav(2));
  const manifest = {
    contract_version: '1.1',
    assets: [
      { asset_code: 'own/slide-1', kind: 'SLIDE_IMAGE', title: 'Slide 1', source_code: 'OWN', rights_status: 'OWN_ORIGINAL', file: 'slide1.png' },
      { asset_code: 'own/sheet-1', kind: 'DOCUMENT', title: 'Cheatsheet', source_code: 'OWN', rights_status: 'OWN_ORIGINAL', file: 'sheet.pdf' },
      { asset_code: 'own/listening-1', kind: 'AUDIO_LISTENING', title: 'Audio', source_code: 'OWN', rights_status: 'OWN_ORIGINAL', file: 'listen.wav' },
    ],
  };
  const sub = {
    tier_number: 2,
    module_code: '2.1',
    sub_module_code: '2.1.3',
    sub_module_title: 'Passive Voice untuk Deskripsi Proses & Laporan Ilmiah',
    origin: 'ORIGINAL_AUTHORED',
    materials: {
      article_markdown: '# Passive\n\nThe report **was written**.',
      videos: o.skipVideo ? [] : [{ video_id: 'dQw4w9WgXcQ', title: 'Passive', language: 'EN', start_sec: 10, end_sec: 200 }],
      slides: [{ order: 1, asset_code: 'own/slide-1', caption: 'Alur' }],
      attachments: [{ title: 'Cheatsheet', file_type: 'PDF', asset_code: 'own/sheet-1' }],
      mini_task: { task_type: 'AI_SHORT_WRITING', prompt: 'Tulis 3 kalimat pasif.', ai_rubric_criteria: 'Gramatika' },
    },
    ...(o.noDrill ? {} : { active_drill: { time_limit_seconds: 300, questions: [Q.mcq({ question_id: 'Q-D1', prompt: o.editQuestion ?? 'Pilih.' }), Q.fill({ question_id: 'Q-D2' })] } }),
  };
  const sets: unknown[] = [
    { set_type: 'SKIP_MODULE_TEST', title: 'Skip 2.1', module_code: '2.1', time_limit_seconds: 900, origin: 'ORIGINAL_AUTHORED', questions: [Q.mcq({ question_id: 'Q-S1' }), Q.tfng({ question_id: 'Q-S2' })] },
    { set_type: 'PLACEMENT_TEST', title: 'Placement', time_limit_seconds: 1500, origin: 'ORIGINAL_AUTHORED', questions: placementQuestions(o.placementSize ?? 30).map((q, i) => ({ ...q, question_id: `Q-P${i}` })) },
  ];
  if (o.withBoss) {
    sets.push(
      { set_type: 'TIER_BOSS_EXAM', title: 'Boss Tier 1', tier_number: 1, origin: 'ORIGINAL_AUTHORED', questions: [] },
      { set_type: 'BOSS_SECTION', title: 'Listening', tier_number: 1, skill_category: 'LISTENING', time_limit_seconds: 600, listening_asset_code: 'own/listening-1', origin: 'ORIGINAL_AUTHORED', questions: [Q.mcq({ skill: 'LISTENING', question_id: 'Q-B1', section_no: 1 })] },
      { set_type: 'BOSS_SECTION', title: 'Reading', tier_number: 1, skill_category: 'READING', time_limit_seconds: 900, reading_passage_markdown: 'Passage.', origin: 'ORIGINAL_AUTHORED', questions: [Q.mcq({ skill: 'READING', question_id: 'Q-B2', passage_no: 1 })] },
    );
  }
  await writeFile(path.join(dir, 'content.json'), JSON.stringify({ contract_version: '1.1', sub_modules: [sub], assessment_sets: sets }));
  await writeFile(path.join(dir, 'assets.manifest.json'), JSON.stringify(manifest));
  return dir;
}

const imp = (dir: string, opts: { publish?: boolean; dryRun?: boolean; allowPublishedOverwrite?: boolean } = {}) =>
  runImport(db, { dir, publish: opts.publish ?? false, dryRun: opts.dryRun ?? false, actorUserId: null, storage, allowPublishedOverwrite: opts.allowPublishedOverwrite });
const count = async (table: string) => Number((await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table}`))).rows[0]!.n);
const statusOf = async (code: string) => ((await db.execute(sql`SELECT status FROM sub_modules WHERE sub_module_code = ${code}`)).rows[0] as { status: string }).status;
const filesInStorage = async () => {
  if (!existsSync(storageRoot)) return 0;
  let n = 0;
  for (const d of await readdir(storageRoot)) n += (await readdir(path.join(storageRoot, d))).length;
  return n;
};

describe('content:validate', () => {
  it('paket valid: tanpa galat; hitungan sub-modul dan set sesuai', async () => {
    const dir = await makePackage({ withBoss: true });
    const r = await validatePackage(dir, await contextFromDb(db));
    expect(r.errors).toEqual([]);
    expect(r.pkg!.sub_modules).toHaveLength(1);
    expect(r.pkg!.assessment_sets).toHaveLength(5);
  });

  it('galat manifest/berkas dilaporkan dengan path dan kode', async () => {
    const dir = await makePackage();
    await writeFile(path.join(dir, 'assets', 'x.svg'), '<svg/>');
    const m = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dir, 'assets.manifest.json'), 'utf8'));
    m.assets.push({ asset_code: 'own/evil', kind: 'IMAGE', title: 'e', source_code: 'OWN', rights_status: 'OWN_ORIGINAL', file: '../../etc/passwd' });
    await writeFile(path.join(dir, 'assets.manifest.json'), JSON.stringify(m));
    const r = await validatePackage(dir, await contextFromDb(db));
    expect(r.errors.some((e) => e.code === 'path_traversal')).toBe(true);
  });
});

describe('content:import', () => {
  it('dry-run tidak menulis apa pun', async () => {
    const dir = await makePackage();
    const r = await imp(dir, { dryRun: true });
    expect(r.exitCode).toBe(0);
    expect(r.lines.join('\n')).toMatch(/DRY-RUN: modules \+0 ~0 =0 \| sub_modules \+0 ~1 =0 \| assessment_sets \+3 ~0 =0 \| assets \+3/);
    expect(await count('learning_materials')).toBe(0);
    expect(await count('assessment_sets')).toBe(0);
    expect(await count('content_assets')).toBe(0);
  });

  it('impor pertama: entitas DRAFT, revisi + audit CONTENT_IMPORTED_CLI; impor kedua: semua NOOP tanpa baris baru', async () => {
    const dir = await makePackage();
    const r1 = await imp(dir);
    expect(r1.exitCode, r1.lines.join('\n')).toBe(0);
    expect(r1.lines.at(-1)).toMatch(/^OK: modules \+0 ~0 =0 \| sub_modules \+0 ~1 =0 \| assessment_sets \+3 ~0 =0 \| assets \+3$/);
    expect(await statusOf('2.1.3')).toBe('DRAFT');
    const sets = await db.select().from(assessmentSets);
    expect(sets).toHaveLength(3);
    expect(sets.every((s) => s.status === 'DRAFT' && s.version === 1 && /^[0-9a-f]{64}$/.test(s.contentHash ?? ''))).toBe(true);
    expect(sets.find((s) => s.assessmentType === 'ACTIVE_DRILL')!.questionCount).toBe(2);
    expect(await count('content_revisions')).toBe(5); // sub-modul: v1 (lama) + v2 (baru); 3 set: v1
    expect((await db.select().from(auditLog).where(eq(auditLog.action, 'CONTENT_IMPORTED_CLI'))).length).toBeGreaterThan(0);
    const assets = await db.select().from(contentAssets);
    expect(assets).toHaveLength(4); // 3 berkas + 1 video
    const video = assets.find((a) => a.kind === 'VIDEO_EMBED')!;
    expect(video).toMatchObject({ rightsStatus: 'UNVERIFIED', storageBackend: 'EXTERNAL', externalRef: 'dQw4w9WgXcQ', externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    const file = assets.find((a) => a.assetCode === 'own/slide-1')!;
    expect(file.storageKey).toMatch(/^[0-9a-f]{2}\/[0-9a-f-]{36}\.png$/);
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await storage.exists(file.storageKey!)).toBe(true);
    const audio = assets.find((a) => a.assetCode === 'own/listening-1')!;
    expect(audio.durationSec).toBe(2);
    const lm = (await db.execute(sql`SELECT slides_json, videos_json FROM learning_materials`)).rows[0] as { slides_json: Array<{ asset_id: string }>; videos_json: Array<{ asset_id: string }> };
    expect(lm.slides_json[0]!.asset_id).toBe(file.id);
    expect(lm.videos_json[0]!.asset_id).toBe(video.id);

    const filesBefore = await filesInStorage();
    const r2 = await imp(dir);
    expect(r2.exitCode).toBe(0);
    expect(r2.lines.at(-1)).toBe('OK: modules +0 ~0 =0 | sub_modules +0 ~0 =1 | assessment_sets +0 ~0 =3 | assets +0');
    expect(await count('content_revisions')).toBe(5);
    expect(await count('content_assets')).toBe(4);
    expect(await filesInStorage()).toBe(filesBefore);
  });

  it('--publish dengan video UNVERIFIED: exit 2, tidak ada yang PUBLISHED/dibuat, penghalang memuat external_ref; berkas disalin dihapus', async () => {
    const dir = await makePackage();
    const filesBefore = await filesInStorage();
    const r = await imp(dir, { publish: true });
    expect(r.exitCode).toBe(2);
    expect(r.lines.join('\n')).toMatch(/ASSET_UNVERIFIED SUB_MODULE .*dQw4w9WgXcQ/);
    expect(await count('learning_materials')).toBe(0);
    expect(await count('assessment_sets')).toBe(0);
    expect(await count('content_assets')).toBe(0);
    expect(await filesInStorage()).toBe(filesBefore);
    expect(await statusOf('2.1.3')).toBe('DRAFT');
  });

  it('setelah aset terverifikasi: --publish sukses (exit 0) dan sub-modul/set/modul PUBLISHED; audit CONTENT_PUBLISHED', async () => {
    const dir = await makePackage({ withBoss: true });
    expect((await imp(dir)).exitCode).toBe(0);
    await db.execute(sql`UPDATE content_assets SET rights_status = 'OWN_ORIGINAL' WHERE kind = 'VIDEO_EMBED'`);
    const r = await imp(dir, { publish: true });
    expect(r.exitCode, r.lines.join('\n')).toBe(0);
    expect(await statusOf('2.1.3')).toBe('PUBLISHED');
    expect(((await db.execute(sql`SELECT status FROM modules WHERE module_code = '2.1'`)).rows[0] as { status: string }).status).toBe('PUBLISHED');
    const sets = await db.select().from(assessmentSets);
    expect(sets).toHaveLength(6);
    expect(sets.every((s) => s.status === 'PUBLISHED' && s.reviewedAt !== null && s.reviewedBy === null)).toBe(true);
    expect((await db.select().from(auditLog).where(eq(auditLog.action, 'CONTENT_PUBLISHED'))).length).toBeGreaterThanOrEqual(8);
    // Boss: anak dibuat dengan parent_set_id ke induk TIER_BOSS_EXAM
    const boss = sets.find((s) => s.assessmentType === 'TIER_BOSS_EXAM')!;
    expect(boss.timeLimitSeconds).toBe(1500);
    expect(sets.filter((s) => s.assessmentType === 'BOSS_SECTION').every((s) => s.parentSetId === boss.id)).toBe(true);
  });

  it('sub-modul tanpa active_drill: DRILL_NOT_PUBLISHED; Placement 24 soal: PLACEMENT_BANK_TOO_SMALL', async () => {
    const dir = await makePackage({ noDrill: true, placementSize: 24, skipVideo: true });
    const r = await imp(dir, { publish: true });
    expect(r.exitCode).toBe(2);
    const codes = (r.blockers ?? []).map((b) => b.code);
    expect(codes).toContain('DRILL_NOT_PUBLISHED');
    expect(codes).toContain('PLACEMENT_BANK_TOO_SMALL');
  });

  it('UPDATE pada set PUBLISHED: version +1, tetap PUBLISHED, snapshot lama tersimpan di content_revisions', async () => {
    const dir = await makePackage({ skipVideo: true });
    expect((await imp(dir, { publish: true })).exitCode).toBe(0);
    const before = (await db.select().from(assessmentSets).where(eq(assessmentSets.assessmentType, 'ACTIVE_DRILL')))[0]!;
    expect(before.status).toBe('PUBLISHED');
    const dir2 = await makePackage({ skipVideo: true, editQuestion: 'Pertanyaan yang diubah.' });
    // O-1: tanpa flag eksplisit impor CLI menolak menimpa entitas PUBLISHED; tidak ada yang berubah.
    const blocked = await imp(dir2);
    expect(blocked.exitCode).toBe(1);
    expect(blocked.lines.join('\n')).toContain('published_overwrite_blocked');
    expect((await imp(dir2, { dryRun: true })).exitCode).toBe(1);
    const still = (await db.select().from(assessmentSets).where(eq(assessmentSets.id, before.id)))[0]!;
    expect(still).toMatchObject({ version: 1, status: 'PUBLISHED', contentHash: before.contentHash });
    const r = await imp(dir2, { allowPublishedOverwrite: true });
    expect(r.exitCode, r.lines.join('\n')).toBe(0);
    expect(r.lines.at(-1)).toMatch(/assessment_sets \+0 ~1 =2/);
    const after = (await db.select().from(assessmentSets).where(eq(assessmentSets.id, before.id)))[0]!;
    expect(after).toMatchObject({ version: 2, status: 'PUBLISHED' });
    expect(after.contentHash).not.toBe(before.contentHash);
    const revs = await db.select().from(contentRevisions).where(eq(contentRevisions.entityId, before.id));
    expect(revs.map((x) => x.version).sort()).toEqual([1, 2]);
    expect(JSON.stringify(revs.find((x) => x.version === 1)!.snapshot)).toContain('Pilih.');
    expect(JSON.stringify(revs.find((x) => x.version === 2)!.snapshot)).toContain('Pertanyaan yang diubah.');
  });

  it('CHECK assessment_sets_scope_chk menolak ACTIVE_DRILL yang juga memiliki tier_id', async () => {
    const tierRow = (await db.execute(sql`SELECT id FROM tiers WHERE tier_number = 1`)).rows[0] as { id: string };
    const subRow = (await db.execute(sql`SELECT id FROM sub_modules LIMIT 1`)).rows[0] as { id: string };
    await expect(
      db.insert(assessmentSets).values({ assessmentType: 'ACTIVE_DRILL', title: 'x', subModuleId: subRow.id, tierId: tierRow.id, timeLimitSeconds: 60, origin: 'ORIGINAL_AUTHORED' }),
    ).rejects.toThrow();
  });

  it('asset_code_conflict dan duplicate_file; rollback penuh tanpa entitas/aset yatim', async () => {
    const dir = await makePackage({ skipVideo: true });
    expect((await imp(dir)).exitCode).toBe(0);
    // berkas lain dengan asset_code yang sama
    await writeFile(path.join(dir, 'assets', 'slide1.png'), await png('#aa0000'));
    const r = await imp(dir);
    expect(r.exitCode).toBe(1);
    expect(r.lines.join('\n')).toMatch(/asset_code_conflict/);
    // berkas identik di asset_code berbeda
    const dir2 = await makePackage({ skipVideo: true });
    await writeFile(path.join(dir2, 'assets', 'slide1.png'), await png('#336699'));
    const m = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dir2, 'assets.manifest.json'), 'utf8'));
    m.assets[0].asset_code = 'own/slide-copy';
    await writeFile(path.join(dir2, 'assets.manifest.json'), JSON.stringify(m));
    const r2 = await imp(dir2);
    expect(r2.exitCode).toBe(1);
    expect(r2.lines.join('\n')).toMatch(/duplicate_file/);
  });

  it('galat di tengah penerapan (induk Boss tidak ada): exit 1, rollback penuh, berkas hasil salinan dihapus', async () => {
    const dir = await makePackage({ skipVideo: true });
    const filesBefore = await filesInStorage();
    const content = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dir, 'content.json'), 'utf8'));
    content.assessment_sets.push({ set_type: 'BOSS_SECTION', title: 'Reading', tier_number: 3, skill_category: 'READING', time_limit_seconds: 900, reading_passage_markdown: 'P.', origin: 'ORIGINAL_AUTHORED', questions: [Q.mcq({ skill: 'READING', question_id: 'Q-X1' })] });
    await writeFile(path.join(dir, 'content.json'), JSON.stringify(content));
    const r = await imp(dir);
    expect(r.exitCode).toBe(1);
    expect(r.lines.join('\n')).toMatch(/boss_parent_missing/);
    expect(await count('assessment_sets')).toBe(0);
    expect(await count('content_assets')).toBe(0);
    expect(await count('learning_materials')).toBe(0);
    expect(await filesInStorage()).toBe(filesBefore);
  });
});

describe('CLI (proses terpisah)', () => {
  const run = (args: string[]) =>
    spawnSync('npx', ['tsx', 'scripts/content-import.ts', ...args], {
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_MIGRATOR_URL: process.env.TEST_DATABASE_URL },
      shell: true,
      encoding: 'utf8',
      timeout: 60_000,
    });

  it('validate: exit 0 untuk paket valid; exit 1 dengan baris "<path>: <kode>: <pesan>" untuk paket rusak', async () => {
    const dir = await makePackage();
    const ok = run(['validate', '--dir', `"${dir}"`]);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/OK: valid \| modules 0 \| sub_modules 1 \| drill 1 \| assessment_sets 2 \| assets 3/);
    const content = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dir, 'content.json'), 'utf8'));
    content.sub_modules[0].active_drill.questions[1] = Q.mcq({ question_id: 'Q-D2', correct_answers: ['zzz'] });
    await writeFile(path.join(dir, 'content.json'), JSON.stringify(content));
    const bad = run(['validate', '--dir', `"${dir}"`]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('sub_modules[0].active_drill.questions[1].correct_answers[0]: answer_not_in_options:');
    content.foo = 1;
    await writeFile(path.join(dir, 'content.json'), JSON.stringify(content));
    const unknown = run(['validate', '--dir', `"${dir}"`]);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('foo: unrecognized_key:');
  });

  it('import --dry-run dan argumen salah', async () => {
    const dir = await makePackage();
    const dry = run(['import', '--dir', `"${dir}"`, '--dry-run']);
    expect(dry.status, dry.stderr).toBe(0);
    expect(dry.stdout).toContain('DRY-RUN:');
    expect(run(['import']).status).toBe(1);
    expect(run(['validate', '--dir', '"tidak-ada-direktori"']).status).toBe(1);
  });
});
