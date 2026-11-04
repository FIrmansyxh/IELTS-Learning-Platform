import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { asyncJobs, assessmentSets, attempts, auditLog, contentRevisions, importBatches, modules, subModules } from '@/db/schema';
import { closeDb, getDb } from '@/server/db';
import { config } from '@/server/config';
import { closeQueue } from '@/server/jobs/queue';
import { resetRateLimits } from '@/server/http/rate-limit';
import { runImportPublish, runImportValidate } from '@/server/import/jobs';
import { purgeImportBatches } from '@/server/import/purge';
import { recoverStuckBatches } from '@/server/import/service';
import { POST as createRoute, GET as listRoute } from '@/app/api/v1/admin/import-batches/route';
import { GET as batchGet } from '@/app/api/v1/admin/import-batches/[batch_id]/route';
import { GET as itemsGet } from '@/app/api/v1/admin/import-batches/[batch_id]/items/route';
import { GET as itemGet } from '@/app/api/v1/admin/import-batches/[batch_id]/items/[row_number]/route';
import { POST as publishPost } from '@/app/api/v1/admin/import-batches/[batch_id]/publish/route';
import { POST as cancelPost } from '@/app/api/v1/admin/import-batches/[batch_id]/cancel/route';
import { POST as rollbackPost } from '@/app/api/v1/admin/import-batches/[batch_id]/rollback/route';
import { GET as templateGet } from '@/app/api/v1/admin/import-templates/[kind]/route';
import { GET as contractGet } from '@/app/api/v1/admin/import-contract/route';
import { POST as assetUpload } from '@/app/api/v1/admin/assets/route';
import { PATCH as assetPatch } from '@/app/api/v1/admin/assets/[asset_id]/route';
import { jobHandlers } from '@/worker/registry';
import { adminSession, call, callMultipart, cleanupContentFixtures, learnerSession } from './helpers';

const db = getDb();
let admin: Awaited<ReturnType<typeof adminSession>>;

beforeAll(async () => {
  admin = await adminSession();
});
afterAll(async () => {
  await cleanupContentFixtures();
  await closeQueue();
  await closeDb();
});
beforeEach(async () => {
  resetRateLimits();
  await cleanupContentFixtures();
});

// ------------------------------------------------------------ fabrik paket
const mcq = (n: number, ans = 'is') => ({
  question_id: `Q-X${n}`,
  question_type: 'MCQ_SINGLE',
  skill: 'GRAMMAR',
  prompt: `Soal ${n}`,
  options: ['is', 'are', 'am'],
  correct_answers: [ans],
  explanation_id: 'Pembahasan.',
});
const MODULE = { tier_number: 1, module_code: '1.99', module_category: 'GRAMMAR', title: 'Modul uji impor' };
const sub = (n: number, extra: Record<string, unknown> = {}, qs = [mcq(n * 10 + 1), mcq(n * 10 + 2)]) => ({
  tier_number: 1,
  module_code: '1.99',
  sub_module_code: `1.99.${n}`,
  sub_module_title: `Sub uji ${n}`,
  origin: 'ORIGINAL_AUTHORED',
  active_drill: { time_limit_seconds: 300, questions: qs },
  ...extra,
});
const pkg = (subs: unknown[], extra: Record<string, unknown> = {}) => ({ contract_version: '1.1', modules: [MODULE], sub_modules: subs, ...extra });
const json = (o: unknown) => Buffer.from(JSON.stringify(o));

// ------------------------------------------------------------ helper HTTP
const upload = (format: 'JSON' | 'CSV', filename: string, data: Buffer, ip?: string) =>
  callMultipart(createRoute, '/api/v1/admin/import-batches', {
    fields: [['format', format], ...(format === 'CSV' ? ([['csv_kind', 'QUESTIONS']] as Array<[string, string]>) : [])],
    files: [{ filename, data }],
    cookie: admin.cookie,
    ip,
  });
const getB = (id: string) => call(batchGet, 'GET', `/api/v1/admin/import-batches/${id}`, { cookie: admin.cookie, params: { batch_id: id } });
const items = (id: string, qs = '') => call(itemsGet, 'GET', `/api/v1/admin/import-batches/${id}/items${qs}`, { cookie: admin.cookie, params: { batch_id: id } });
const pub = (id: string, body: unknown) => call(publishPost, 'POST', `/api/v1/admin/import-batches/${id}/publish`, { cookie: admin.cookie, params: { batch_id: id }, body });
const rollback = (id: string) => call(rollbackPost, 'POST', `/api/v1/admin/import-batches/${id}/rollback`, { cookie: admin.cookie, params: { batch_id: id } });
const cancel = (id: string) => call(cancelPost, 'POST', `/api/v1/admin/import-batches/${id}/cancel`, { cookie: admin.cookie, params: { batch_id: id } });

async function jobOf(batchId: string, kind: 'IMPORT_VALIDATE' | 'IMPORT_PUBLISH') {
  const rows = await db.select().from(asyncJobs).where(and(eq(asyncJobs.importBatchId, batchId), eq(asyncJobs.kind, kind)));
  return rows[rows.length - 1]!.id;
}
/** Unggah + jalankan job validasi (worker disimulasikan langsung). */
async function uploadValidated(format: 'JSON' | 'CSV', filename: string, data: Buffer) {
  const r = await upload(format, filename, data);
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  const id = r.json.data.id as string;
  await runImportValidate(id, await jobOf(id, 'IMPORT_VALIDATE'));
  return { id, upload: r.json.data, batch: (await getB(id)).json.data };
}
async function publishRun(id: string, body: { target_status: 'DRAFT' | 'PUBLISHED'; acknowledge_warnings?: boolean; confirm_reviewed?: boolean }) {
  const r = await pub(id, body);
  expect(r.status, JSON.stringify(r.json)).toBe(202);
  await runImportPublish(id, await jobOf(id, 'IMPORT_PUBLISH'));
  return (await getB(id)).json.data;
}
const subRow = async (code: string) => (await db.select().from(subModules).where(eq(subModules.subModuleCode, code)))[0];
const setRow = async (key: string) => {
  const [type, scope] = key.split(':') as [string, string];
  if (type !== 'ACTIVE_DRILL') throw new Error('hanya drill');
  const s = await subRow(scope);
  return s ? (await db.select().from(assessmentSets).where(eq(assessmentSets.subModuleId, s.id)))[0] : undefined;
};

const png = (c: string) => sharp({ create: { width: 16, height: 16, channels: 3, background: c } }).png().toBuffer();
async function uploadAsset(code: string, color: string, rights?: string) {
  const [own] = (await db.execute(sql`SELECT id FROM content_sources WHERE code='OWN'`)).rows as Array<{ id: string }>;
  const r = await callMultipart(assetUpload, '/api/v1/admin/assets', {
    fields: [['kind', 'SLIDE_IMAGE'], ['title', 'Slide'], ['source_id', own!.id], ['asset_code', code]],
    files: [{ filename: 'a.png', data: await png(color) }],
    cookie: admin.cookie,
  });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  if (rights) {
    const id = r.json.data.id;
    const p = await call(assetPatch, 'PATCH', `/api/v1/admin/assets/${id}`, { cookie: admin.cookie, params: { asset_id: id }, body: { rights_status: rights } });
    expect(p.status).toBe(200);
  }
  return r.json.data.id as string;
}

// ================================================================ I2
describe('SPEC-019 pemeriksaan sinkron unggah (I2)', () => {
  it('JSON valid -> 201 UPLOADED + job IMPORT_VALIDATE QUEUED + job pg-boss ada; setelah worker PREVIEW_READY', async () => {
    const subs = Array.from({ length: 20 }, (_, i) => sub(i + 1));
    const r = await upload('JSON', 'tier1-batch.json', json(pkg(subs)));
    expect(r.status).toBe(201);
    expect(r.json.data).toMatchObject({ status: 'UPLOADED', format: 'JSON', csv_kind: null, contract_version: '1.1', file_name: 'tier1-batch.json', summary: null });
    expect(r.json.data.job).toMatchObject({ kind: 'IMPORT_VALIDATE', status: 'QUEUED', queue_position: 1, attempt: 0 });
    const boss = (await db.execute(sql`SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'import-validate'`)).rows[0] as { n: number };
    expect(boss.n).toBeGreaterThanOrEqual(1);
    const id = r.json.data.id;
    await runImportValidate(id, r.json.data.job.id);
    const b = (await getB(id)).json.data;
    expect(b).toMatchObject({ status: 'PREVIEW_READY', total_items: 21, valid_items: 21, invalid_items: 0 });
    expect(b.job).toMatchObject({ status: 'SUCCEEDED' });
    expect(b.summary).toMatchObject({ warnings: 0, last_error: null });
    const l = await call(listRoute, 'GET', '/api/v1/admin/import-batches?status=PREVIEW_READY', { cookie: admin.cookie });
    expect(l.json.meta.total).toBe(1);
    const [a] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'IMPORT_UPLOADED'), eq(auditLog.entityId, id)));
    expect(a!.metadata).toMatchObject({ batch_id: id });
    // pengulangan job (worker mati lalu pg-boss mengulang) idempoten
    expect(await runImportValidate(id, r.json.data.job.id)).toBe('skipped');
  });

  it('5,1 MB -> 413; .xlsx/PK -> 415; bukan UTF-8 -> invalid_encoding; dua BOM -> double_bom; kontrol -> control_char', async () => {
    const big = await upload('JSON', 'big.json', Buffer.alloc(5.1 * 1_048_576, 0x20));
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe('PAYLOAD_TOO_LARGE');
    const x = await upload('JSON', 'data.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]));
    expect(x.status).toBe(415);
    expect(x.json.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    const asJson = await upload('JSON', 'data.json', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]));
    expect(asJson.status).toBe(415);
    const enc = await upload('JSON', 'a.json', Buffer.from([0x7b, 0xff, 0xfe, 0x7d]));
    expect(enc.status).toBe(400);
    expect(enc.json.error).toMatchObject({ code: 'IMPORT_FILE_INVALID' });
    expect(enc.json.error.details[0].code).toBe('invalid_encoding');
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const dbl = await upload('JSON', 'a.json', Buffer.concat([bom, bom, json(pkg([sub(1)]))]));
    expect(dbl.json.error.details[0].code).toBe('double_bom');
    const one = await upload('JSON', 'one-bom.json', Buffer.concat([bom, json(pkg([sub(1)]))]));
    expect(one.status).toBe(201);
    const ctl = await upload('JSON', 'c.json', Buffer.from('{"contract_version":"1.1"}\u0001'));
    expect(ctl.json.error.details[0].code).toBe('control_char');
    expect((await upload('JSON', 'x.json', Buffer.from('{bukan json'))).json.error.details[0].code).toBe('json_syntax');
  });

  it('__proto__ pada kedalaman berapa pun -> 400 forbidden_key, tanpa baris batch, ({}).x tetap undefined; depth 11; 2.001 item; versi kontrak', async () => {
    const proto = '{"contract_version":"1.1","modules":[{"a":{"b":{"__proto__":{"x":1}}}}]}';
    const r = await upload('JSON', 'p.json', Buffer.from(proto));
    expect(r.status).toBe(400);
    expect(r.json.error.details[0].code).toBe('forbidden_key');
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect((await db.select().from(importBatches)).length).toBe(0);
    expect((await upload('JSON', 'q.json', Buffer.from('{"contract_version":"1.1","constructor":{"prototype":{}}}'))).json.error.details[0].code).toBe('forbidden_key');
    const deep = '['.repeat(11) + ']'.repeat(11);
    expect((await upload('JSON', 'd.json', Buffer.from(`{"contract_version":"1.1","modules":${deep}}`))).json.error.details[0].code).toBe('depth_exceeded');
    const many = Array.from({ length: 2001 }, () => ({}));
    expect((await upload('JSON', 'm.json', json({ contract_version: '1.1', sub_modules: many }))).json.error.details[0].code).toBe('too_many_items');
    expect((await upload('JSON', 'v.json', json({ contract_version: '2.0' }))).json.error.details[0].code).toBe('contract_version_unsupported');
  });

  it('CSV: header salah -> csv_header_invalid; 5.001 baris -> too_many_rows; kolom/sel; csv_kind wajib/dilarang; multi berkas', async () => {
    const hdr = 'set_type,scope_code,question_id,question_type,skill,prompt,options,correct_answers,max_words,explanation_id';
    expect((await upload('CSV', 'a.csv', Buffer.from('a,b,c\n1,2,3\n'))).json.error.details[0].code).toBe('csv_header_invalid');
    const rows = Array.from({ length: 5001 }, (_, i) => `ACTIVE_DRILL,1.99.1,Q-R${i},TFNG,GRAMMAR,p,,True,,e`).join('\n');
    expect((await upload('CSV', 'b.csv', Buffer.from(`${hdr}\n${rows}\n`))).json.error.details[0].code).toBe('too_many_rows');
    const long = `${hdr}\nACTIVE_DRILL,1.99.1,Q-R1,TFNG,GRAMMAR,${'x'.repeat(5001)},,True,,e\n`;
    expect((await upload('CSV', 'c.csv', Buffer.from(long))).json.error.details[0].code).toBe('cell_too_long');
    const noKind = await callMultipart(createRoute, '/api/v1/admin/import-batches', { fields: [['format', 'CSV']], files: [{ filename: 'a.csv', data: Buffer.from(hdr + '\n') }], cookie: admin.cookie });
    expect(noKind.json.error.details[0].code).toBe('csv_kind_required');
    const extra = await callMultipart(createRoute, '/api/v1/admin/import-batches', { fields: [['format', 'JSON'], ['csv_kind', 'QUESTIONS']], files: [{ filename: 'a.json', data: json(pkg([sub(1)])) }], cookie: admin.cookie });
    expect(extra.json.error.details[0].code).toBe('csv_kind_not_allowed');
    const two = await callMultipart(createRoute, '/api/v1/admin/import-batches', {
      fields: [['format', 'JSON']],
      files: [{ filename: 'a.json', data: json(pkg([sub(1)])) }, { filename: 'b.json', data: json(pkg([sub(2)])) }],
      cookie: admin.cookie,
    });
    expect(two.json.error.details[0].code).toBe('multiple_files');
    const none = await callMultipart(createRoute, '/api/v1/admin/import-batches', { fields: [['format', 'JSON']], cookie: admin.cookie });
    expect(none.json.error.details[0].code).toBe('file_required');
  });

  it('nama berkas disanitasi; bukan multipart 415; learner 403; tanpa sesi 401', async () => {
    const r = await upload('JSON', '../../etc/pas swd;..json', json(pkg([sub(1)])));
    expect(r.status).toBe(201);
    expect(r.json.data.file_name).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(r.json.data.file_name).not.toContain('/');
    expect((await call(createRoute, 'POST', '/api/v1/admin/import-batches', { cookie: admin.cookie, body: {} })).status).toBe(415);
    const l = await learnerSession();
    const learner = await callMultipart(createRoute, '/api/v1/admin/import-batches', { fields: [['format', 'JSON']], files: [{ filename: 'a.json', data: json(pkg([sub(1)])) }], cookie: l.cookie });
    expect(learner.status).toBe(403);
    const anon = await callMultipart(createRoute, '/api/v1/admin/import-batches', { fields: [['format', 'JSON']], files: [{ filename: 'a.json', data: json(pkg([sub(1)])) }] });
    expect(anon.status).toBe(401);
  });

  it('duplikat batch 409 (PREVIEW_READY/PUBLISHED); IMPORT_IN_PROGRESS saat batch aktif; diterima lagi setelah CANCELLED; 11 unggahan/jam -> 429', async () => {
    const data = json(pkg([sub(1)]));
    const first = await uploadValidated('JSON', 'a.json', data);
    const dup = await upload('JSON', 'a2.json', data);
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('DUPLICATE_BATCH');
    expect(dup.json.error.details[0].message).toBe(first.id);
    expect((await cancel(first.id)).json.data.status).toBe('CANCELLED');
    const again = await upload('JSON', 'a3.json', data);
    expect(again.status).toBe(201);
    const busy = await upload('JSON', 'b.json', json(pkg([sub(2)])));
    expect(busy.status).toBe(409);
    expect(busy.json.error.code).toBe('IMPORT_IN_PROGRESS');
    // 429
    resetRateLimits();
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await upload('JSON', 'bad.json', Buffer.from('{x'), '10.77.0.1')).status;
    expect(last).toBe(429);
  });

  it('templat content-package diunduh lalu diunggah apa adanya lolos; templat CSV memiliki header; kind lain 404; kontrak JSON Schema', async () => {
    const t = await call(templateGet, 'GET', '/api/v1/admin/import-templates/content-package', { cookie: admin.cookie, params: { kind: 'content-package' } });
    expect(t.status).toBe(200);
    expect(t.headers.get('content-disposition')).toBe('attachment; filename="content-package.template.json"');
    const r = await uploadValidated('JSON', 'content-package.template.json', Buffer.from(JSON.stringify(t.json)));
    expect(r.batch).toMatchObject({ status: 'PREVIEW_READY', invalid_items: 0, total_items: 2 });
    const csv = await templateGet(new Request('http://localhost:3000/x', { headers: { cookie: admin.cookie, 'x-forwarded-for': '10.8.8.8' } }), { params: Promise.resolve({ kind: 'questions-csv' }) });
    expect(csv.headers.get('content-disposition')).toBe('attachment; filename="questions.template.csv"');
    expect((await csv.text()).split('\r\n')[0]).toContain('set_type,scope_code,question_id');
    expect((await call(templateGet, 'GET', '/x', { cookie: admin.cookie, params: { kind: 'lain' } })).status).toBe(404);
    const c = await call(contractGet, 'GET', '/api/v1/admin/import-contract', { cookie: admin.cookie });
    expect(c.json.data.contract_version).toBe('1.1');
    expect(c.json.data.json_schema.type).toBe('object');
  });
});

// ================================================================ I3 + I5
describe('SPEC-019 validasi, pratinjau, publikasi', () => {
  it('item galat: PREVIEW_READY, invalid_items=1, path/code tepat di items?status=INVALID; publish -> BATCH_HAS_ERRORS; item payload', async () => {
    const bad = sub(1, {}, [mcq(11), mcq(12, 'zzz')]);
    const { id, batch } = await uploadValidated('JSON', 'bad.json', json(pkg([bad, sub(2)])));
    expect(batch).toMatchObject({ status: 'PREVIEW_READY', invalid_items: 1, valid_items: 2, total_items: 3 });
    const inv = await items(id, '?status=INVALID');
    expect(inv.json.meta.total).toBe(1);
    expect(inv.json.data[0]).toMatchObject({ row_number: 2, entity_kind: 'SUB_MODULE', entity_code: '1.99.1', status: 'INVALID', action: null });
    expect(inv.json.data[0].errors[0]).toMatchObject({ path: 'sub_modules[0].active_drill.questions[1].correct_answers[0]', code: 'answer_not_in_options', severity: 'error' });
    const p = await pub(id, { target_status: 'DRAFT' });
    expect(p.status).toBe(409);
    expect(p.json.error.code).toBe('BATCH_HAS_ERRORS');
    const one = await call(itemGet, 'GET', `/x`, { cookie: admin.cookie, params: { batch_id: id, row_number: '3' } });
    expect(one.json.data.payload.sub_module_code).toBe('1.99.2');
    expect((await call(itemGet, 'GET', `/x`, { cookie: admin.cookie, params: { batch_id: id, row_number: '99' } })).status).toBe(404);
  });

  it('peringatan video_unverified: tanpa ack 409, dengan ack DRAFT 202 -> PUBLISHED; count = total; revisi/audit; NOOP tidak mengubah', async () => {
    const withVideo = sub(1, { materials: { article_markdown: '# Materi', videos: [{ video_id: 'dQw4w9WgXcQ', title: 'V', language: 'EN', start_sec: 0, end_sec: 60 }] } });
    const { id, batch } = await uploadValidated('JSON', 'v.json', json(pkg([withVideo, sub(2)])));
    expect(batch.summary.warnings).toBe(1);
    const noAck = await pub(id, { target_status: 'DRAFT' });
    expect(noAck.status).toBe(409);
    expect(noAck.json.error.code).toBe('WARNINGS_NOT_ACKNOWLEDGED');
    const it1 = await items(id);
    expect(it1.json.data.find((x: { entity_code: string }) => x.entity_code === '1.99.1').errors.map((e: { code: string }) => e.code)).toContain('video_unverified');

    const done = await publishRun(id, { target_status: 'DRAFT', acknowledge_warnings: true });
    expect(done).toMatchObject({ status: 'PUBLISHED', target_status: 'DRAFT', total_items: 3 });
    expect(done.created_count + done.updated_count + done.skipped_count).toBe(done.total_items);
    expect(done.created_count).toBe(3); // modul + 2 sub baru
    expect(done.published_at).toBeTruthy();
    expect((await subRow('1.99.1'))!.status).toBe('DRAFT');
    expect((await setRow('ACTIVE_DRILL:1.99.1'))!.questionCount).toBe(2);
    const revs = await db.select().from(contentRevisions).where(eq(contentRevisions.importBatchId, id));
    expect(revs.length).toBeGreaterThan(0);
    const [a] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'IMPORT_PUBLISHED'), eq(auditLog.entityId, id)));
    expect(a).toBeTruthy();
    const applied = await items(id, '?status=APPLIED');
    expect(applied.json.meta.total).toBe(3);
    // video baru dibuat UNVERIFIED
    const vid = (await db.execute(sql`SELECT rights_status FROM content_assets WHERE kind='VIDEO_EMBED' AND external_ref='dQw4w9WgXcQ'`)).rows as Array<{ rights_status: string }>;
    expect(vid[0]!.rights_status).toBe('UNVERIFIED');
    // pengulangan job publikasi (pg-boss) idempoten
    expect(await runImportPublish(id)).toBe('skipped');
    expect((await getB(id)).json.data.created_count).toBe(3);
  });

  it('PUBLISHED dengan aset UNVERIFIED: transaksi dibatalkan, PREVIEW_READY + PUBLISH_BLOCKED/ASSET_UNVERIFIED; setelah verifikasi aset -> PUBLISHED', async () => {
    const assetId = await uploadAsset('tier1/slides/uji-slide', '#445566');
    const full = sub(1, { materials: { article_markdown: '# Materi', slides: [{ order: 1, asset_code: 'tier1/slides/uji-slide', caption: 'Slide satu' }] } });
    const { id } = await uploadValidated('JSON', 'pub.json', json(pkg([full])));
    const warn = (await items(id)).json.data.flatMap((x: { errors: Array<{ code: string }> }) => x.errors.map((e) => e.code));
    expect(warn).toContain('asset_unverified');
    const blocked = await publishRun(id, { target_status: 'PUBLISHED', acknowledge_warnings: true });
    expect(blocked.status).toBe('PREVIEW_READY');
    expect(blocked.summary.last_error.code).toBe('PUBLISH_BLOCKED');
    expect(blocked.summary.last_error.blockers.map((b: { code: string }) => b.code)).toContain('ASSET_UNVERIFIED');
    expect(blocked.summary.last_error.blockers.find((b: { code: string }) => b.code === 'ASSET_UNVERIFIED').asset_code).toBe('tier1/slides/uji-slide');
    expect(blocked.job).toMatchObject({ status: 'FAILED', error_code: 'PUBLISH_BLOCKED' });
    expect(await subRow('1.99.1')).toBeUndefined();
    expect((await db.select().from(modules).where(eq(modules.moduleCode, '1.99'))).length).toBe(0);
    expect((await db.select().from(contentRevisions).where(eq(contentRevisions.importBatchId, id))).length).toBe(0);

    await call(assetPatch, 'PATCH', `/api/v1/admin/assets/${assetId}`, { cookie: admin.cookie, params: { asset_id: assetId }, body: { rights_status: 'OWN_ORIGINAL' } });
    const ok = await publishRun(id, { target_status: 'PUBLISHED', acknowledge_warnings: true });
    expect(ok.status).toBe('PUBLISHED');
    expect((await subRow('1.99.1'))!.status).toBe('PUBLISHED');
    expect((await setRow('ACTIVE_DRILL:1.99.1'))!.status).toBe('PUBLISHED');
    expect((await db.select().from(modules).where(eq(modules.moduleCode, '1.99')))[0]!.status).toBe('PUBLISHED');
  });

  it('impor kedua dengan satu soal berubah: 1 UPDATE sisanya NOOP; version set naik 1 hanya untuk set yang berubah', async () => {
    const v1 = await uploadValidated('JSON', 'v1.json', json(pkg([sub(1), sub(2)])));
    await publishRun(v1.id, { target_status: 'DRAFT' });
    const before1 = (await setRow('ACTIVE_DRILL:1.99.1'))!.version;
    const before2 = (await setRow('ACTIVE_DRILL:1.99.2'))!.version;
    const v2 = await uploadValidated('JSON', 'v2.json', json(pkg([sub(1, {}, [mcq(11), mcq(12, 'are')]), sub(2)])));
    const acts = (await items(v2.id)).json.data.map((x: { entity_code: string; action: string }) => `${x.entity_code}:${x.action}`);
    expect(acts).toEqual(['1.99:NOOP', '1.99.1:UPDATE', '1.99.2:NOOP']);
    expect(v2.batch.summary.noop).toBe(2);
    const done = await publishRun(v2.id, { target_status: 'DRAFT', acknowledge_warnings: true });
    expect(done).toMatchObject({ created_count: 0, updated_count: 1, skipped_count: 2 });
    expect((await setRow('ACTIVE_DRILL:1.99.1'))!.version).toBe(before1 + 1);
    expect((await setRow('ACTIVE_DRILL:1.99.2'))!.version).toBe(before2);
    // rollback batch kedua memulihkan isi sebelumnya (versi +1), batch pertama lalu menghapus entitas baru
    const rb2 = await rollback(v2.id);
    expect(rb2.status).toBe(200);
    expect(rb2.json.data.status).toBe('ROLLED_BACK');
    const restored = (await setRow('ACTIVE_DRILL:1.99.1'))!;
    expect(restored.version).toBe(before1 + 2);
    expect((restored.questionsJson as Array<{ correct_answers: string[] }>)[1]!.correct_answers[0]).toBe('is');
    const rb1 = await rollback(v1.id);
    expect(rb1.json.data.status).toBe('ROLLED_BACK');
    expect(await subRow('1.99.1')).toBeUndefined();
    expect((await db.select().from(modules).where(eq(modules.moduleCode, '1.99'))).length).toBe(0);
    const [a] = await db.select().from(auditLog).where(and(eq(auditLog.action, 'IMPORT_ROLLED_BACK'), eq(auditLog.entityId, v1.id)));
    expect(a).toBeTruthy();
    // unggah ulang berkas sama setelah ROLLED_BACK diterima
    expect((await upload('JSON', 'v1-again.json', json(pkg([sub(1), sub(2)])))).status).toBe(201);
  });

  it('rollback ditahan 409 ROLLBACK_BLOCKED bila hasil batch sudah dikerjakan pengguna; tidak ada perubahan; BATCH_NOT_ROLLBACKABLE untuk status lain', async () => {
    const v1 = await uploadValidated('JSON', 'v1.json', json(pkg([sub(1), sub(2)])));
    expect((await rollback(v1.id)).json.error.code).toBe('BATCH_NOT_ROLLBACKABLE');
    await publishRun(v1.id, { target_status: 'DRAFT' });
    const learner = await learnerSession();
    const set = (await setRow('ACTIVE_DRILL:1.99.1'))!;
    const [u] = (await db.execute(sql`SELECT id FROM users WHERE email = ${learner.email}`)).rows as Array<{ id: string }>;
    await db.insert(attempts).values({ userId: u!.id, assessmentSetId: set.id, assessmentVersion: set.version });
    const r = await rollback(v1.id);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('ROLLBACK_BLOCKED');
    expect(r.json.error.details[0]).toMatchObject({ code: 'has_user_data' });
    expect(await subRow('1.99.1')).toBeTruthy();
    expect(await subRow('1.99.2')).toBeTruthy();
    expect((await getB(v1.id)).json.data.status).toBe('PUBLISHED');
  });

  it('cancel: PREVIEW_READY -> CANCELLED; PUBLISHED -> 409 BATCH_NOT_CANCELLABLE; publish pada status salah 409', async () => {
    const a = await uploadValidated('JSON', 'a.json', json(pkg([sub(1)])));
    expect((await cancel(a.id)).json.data.status).toBe('CANCELLED');
    expect((await pub(a.id, { target_status: 'DRAFT' })).json.error.code).toBe('BATCH_NOT_PUBLISHABLE');
    const b = await uploadValidated('JSON', 'b.json', json(pkg([sub(2)])));
    await publishRun(b.id, { target_status: 'DRAFT' });
    const c = await cancel(b.id);
    expect(c.status).toBe(409);
    expect(c.json.error.code).toBe('BATCH_NOT_CANCELLABLE');
    expect((await call(batchGet, 'GET', '/x', { cookie: admin.cookie, params: { batch_id: '5e1d7a90-2b3c-4d5e-8f60-718293a4b5c6' } })).status).toBe(404);
  });

  it('tanpa permintaan jaringan keluar: image_url http://169.254.169.254/ ditolak (tidak di-fetch)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const s = sub(1, { materials: { article_markdown: '# x', slides: [{ order: 1, image_url: 'http://169.254.169.254/latest/meta-data', caption: 'c' }] } });
    const { id, batch } = await uploadValidated('JSON', 'ssrf.json', json(pkg([s])));
    expect(batch.invalid_items).toBe(1);
    const e = (await items(id, '?status=INVALID')).json.data[0].errors[0];
    expect(['external_url_not_allowed', 'asset_not_found']).toContain(e.code);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('item duplikat dalam berkas -> duplicate_item pada item kedua; modul tidak ada -> module_not_found', async () => {
    const { id } = await uploadValidated('JSON', 'dup.json', json(pkg([sub(1), sub(1), sub(3, { module_code: '1.98', sub_module_code: '1.98.1' })])));
    const inv = (await items(id, '?status=INVALID')).json.data;
    expect(inv.map((x: { row_number: number }) => x.row_number)).toEqual([3, 4]);
    expect(inv[0].errors.map((e: { code: string }) => e.code)).toContain('duplicate_item');
    expect(inv[1].errors.map((e: { code: string }) => e.code)).toContain('module_not_found');
  });

  it('set dengan percobaan IN_PROGRESS tidak boleh diubah (set_has_active_attempts)', async () => {
    const v1 = await uploadValidated('JSON', 'v1.json', json(pkg([sub(1)])));
    await publishRun(v1.id, { target_status: 'DRAFT' });
    const learner = await learnerSession();
    const set = (await setRow('ACTIVE_DRILL:1.99.1'))!;
    const [u] = (await db.execute(sql`SELECT id FROM users WHERE email = ${learner.email}`)).rows as Array<{ id: string }>;
    await db.insert(attempts).values({ userId: u!.id, assessmentSetId: set.id, assessmentVersion: set.version, status: 'IN_PROGRESS' });
    const v2 = await uploadValidated('JSON', 'v2.json', json(pkg([sub(1, {}, [mcq(11), mcq(12, 'am')])])));
    const inv = (await items(v2.id, '?status=INVALID')).json.data;
    expect(inv[0].errors.map((e: { code: string }) => e.code)).toContain('set_has_active_attempts');
  });
});

// ================================================================ CSV
describe('SPEC-019 CSV QUESTIONS', () => {
  const HDR = 'set_type,scope_code,question_id,question_type,skill,prompt,options,correct_answers,max_words,explanation_id,points';
  async function seedDrill() {
    const v1 = await uploadValidated('JSON', 'base.json', json(pkg([sub(1)])));
    await publishRun(v1.id, { target_status: 'DRAFT' });
    return v1;
  }

  it('3 baris untuk set ada: dipublikasi, questions_json diperbarui, question_count benar, version +1 sekali, rollback memulihkan', async () => {
    await seedDrill();
    const before = (await setRow('ACTIVE_DRILL:1.99.1'))!;
    const csv = [
      HDR,
      'ACTIVE_DRILL,1.99.1,Q-X11,MCQ_SINGLE,GRAMMAR,Soal 11 diubah,is || are || am,is,,Pembahasan baru,1',
      'ACTIVE_DRILL,1.99.1,Q-C2,FILL_IN_BLANK,GRAMMAR,"He ___, (watch) TV.",,watches,1,Akhiran -es.,',
      'ACTIVE_DRILL,1.99.1,Q-C3,TFNG,GRAMMAR,Pernyataan tiga,,True,,Karena benar.,2',
    ].join('\r\n');
    const { id, batch } = await uploadValidated('CSV', 'q.csv', Buffer.from(csv));
    expect(batch).toMatchObject({ status: 'PREVIEW_READY', format: 'CSV', csv_kind: 'QUESTIONS', contract_version: null, total_items: 3, invalid_items: 0 });
    const list = (await items(id)).json.data;
    expect(list.map((x: { action: string; entity_kind: string }) => `${x.entity_kind}:${x.action}`)).toEqual(['QUESTION:UPDATE', 'QUESTION:CREATE', 'QUESTION:CREATE']);
    expect(list[0].row_number).toBe(2);
    expect(list[0].entity_code).toBe('ACTIVE_DRILL:1.99.1:Q-X11');
    const done = await publishRun(id, { target_status: 'DRAFT' });
    expect(done).toMatchObject({ status: 'PUBLISHED', created_count: 2, updated_count: 1, skipped_count: 0 });
    const after = (await setRow('ACTIVE_DRILL:1.99.1'))!;
    expect(after.version).toBe(before.version + 1);
    expect(after.questionCount).toBe(4);
    const qs = after.questionsJson as Array<{ question_id: string; prompt: string; points: number }>;
    expect(qs.map((q) => q.question_id)).toEqual(['Q-X11', 'Q-X12', 'Q-C2', 'Q-C3']);
    expect(qs[0]!.prompt).toBe('Soal 11 diubah');
    expect(qs[3]!.points).toBe(2);
    const rb = await rollback(id);
    expect(rb.json.data.status).toBe('ROLLED_BACK');
    expect((await setRow('ACTIVE_DRILL:1.99.1'))!.questionCount).toBe(2);
  });

  it('formula_injection, set_not_found, tipe tidak didukung, angka tidak valid, pilihan benar bukan opsi -> INVALID', async () => {
    await seedDrill();
    const csv = [
      HDR,
      `ACTIVE_DRILL,1.99.1,Q-F1,TFNG,GRAMMAR,"=cmd|' /C calc'!A0",,True,,Ok.,`,
      'ACTIVE_DRILL,1.99.9,Q-F2,TFNG,GRAMMAR,p,,True,,Ok.,',
      'ACTIVE_DRILL,1.99.1,Q-F3,MATCHING_DRAG,GRAMMAR,p,,True,,Ok.,',
      'ACTIVE_DRILL,1.99.1,Q-F4,TFNG,GRAMMAR,p,,True,,Ok.,abc',
      'ACTIVE_DRILL,1.99.1,Q-F5,MCQ_SINGLE,GRAMMAR,p,a || b,zzz,,Ok.,',
      'ACTIVE_DRILL,1.99.1,Q-F6,TFNG,GRAMMAR,p,,True,,Ok.,',
    ].join('\n');
    const { id, batch } = await uploadValidated('CSV', 'bad.csv', Buffer.from(csv));
    expect(batch).toMatchObject({ invalid_items: 5, valid_items: 1 });
    const codes = (await items(id, '?status=INVALID')).json.data.map((x: { errors: Array<{ code: string }> }) => x.errors[0]!.code);
    expect(codes).toEqual(['formula_injection', 'set_not_found', 'question_type_unsupported', 'invalid_number', 'answer_not_in_options']);
    expect((await pub(id, { target_status: 'DRAFT' })).json.error.code).toBe('BATCH_HAS_ERRORS');
  });

  it('CSV tanpa perubahan -> semua NOOP; set tidak berubah', async () => {
    await seedDrill();
    const before = (await setRow('ACTIVE_DRILL:1.99.1'))!;
    const csv = [HDR, 'ACTIVE_DRILL,1.99.1,Q-X11,MCQ_SINGLE,GRAMMAR,Soal 11,is || are || am,is,,Pembahasan.,1'].join('\n');
    const { id } = await uploadValidated('CSV', 'noop.csv', Buffer.from(csv));
    expect((await items(id)).json.data[0].action).toBe('NOOP');
    const done = await publishRun(id, { target_status: 'DRAFT' });
    expect(done).toMatchObject({ created_count: 0, updated_count: 0, skipped_count: 1 });
    expect((await setRow('ACTIVE_DRILL:1.99.1'))!.version).toBe(before.version);
  });
});

// ================================================================ retensi
describe('SPEC-019 retensi (I7)', () => {
  it('purge: batch PUBLISHED berumur 91 hari -> file & payload dihapus, hitungan tetap', async () => {
    const { id } = await uploadValidated('JSON', 'p.json', json(pkg([sub(1)])));
    await publishRun(id, { target_status: 'DRAFT' });
    const [b] = await db.select().from(importBatches).where(eq(importBatches.id, id));
    const file = path.join(config.assetsDir(), b!.storageKey!);
    expect(existsSync(file)).toBe(true);
    await db.update(importBatches).set({ publishedAt: new Date(Date.now() - 91 * 86_400_000) }).where(eq(importBatches.id, id));
    expect(await purgeImportBatches(db)).toBe(1);
    expect(existsSync(file)).toBe(false);
    const row = await call(itemGet, 'GET', '/x', { cookie: admin.cookie, params: { batch_id: id, row_number: '2' } });
    expect(row.status).toBe(200);
    expect(row.json.data.payload).toBeNull();
    const after = (await getB(id)).json.data;
    expect(after).toMatchObject({ status: 'PUBLISHED', total_items: 2, created_count: 2 });
    expect(await purgeImportBatches(db)).toBe(0);
    // batch baru (<90 hari) tidak dipurge
    const fresh = await uploadValidated('JSON', 'p2.json', json(pkg([sub(2)])));
    expect(await purgeImportBatches(db)).toBe(0);
    expect(fresh.id).toBeTruthy();
  });
});

// ================================================================ akses & worker (celah ditutup Backend W4)
describe('SPEC-019 akses learner/anon dan handler worker', () => {
  it('learner 403 dan tanpa sesi 401 pada SELURUH endpoint impor', async () => {
    const l = await learnerSession();
    const { id } = await uploadValidated('JSON', 'akses.json', json(pkg([sub(1)])));
    const P = { batch_id: id, row_number: '1', kind: 'content-package' };
    const calls: Array<[string, (cookie: string | null) => Promise<{ status: number }>]> = [
      ['list', (c) => call(listRoute, 'GET', '/api/v1/admin/import-batches', { cookie: c })],
      ['get', (c) => call(batchGet, 'GET', '/x', { cookie: c, params: P })],
      ['items', (c) => call(itemsGet, 'GET', '/x', { cookie: c, params: P })],
      ['item', (c) => call(itemGet, 'GET', '/x', { cookie: c, params: P })],
      ['publish', (c) => call(publishPost, 'POST', '/x', { cookie: c, params: P, body: { target_status: 'DRAFT' } })],
      ['cancel', (c) => call(cancelPost, 'POST', '/x', { cookie: c, params: P })],
      ['rollback', (c) => call(rollbackPost, 'POST', '/x', { cookie: c, params: P })],
      ['template', (c) => call(templateGet, 'GET', '/x', { cookie: c, params: P })],
      ['contract', (c) => call(contractGet, 'GET', '/x', { cookie: c })],
    ];
    for (const [name, fn] of calls) {
      expect((await fn(l.cookie)).status, `learner ${name}`).toBe(403);
      expect((await fn(null)).status, `anon ${name}`).toBe(401);
    }
    expect((await getB(id)).json.data.status).toBe('PREVIEW_READY'); // tidak ada efek
  });

  it('handler worker pg-boss (registry): import-validate lalu import-publish menyelesaikan batch; pengulangan idempoten', async () => {
    const r = await upload('JSON', 'worker.json', json(pkg([sub(1), sub(2)])));
    const id = r.json.data.id as string;
    const jlog = { info: () => undefined, warn: () => undefined, error: () => undefined, child: () => jlog } as never;
    const validateJob = [{ id: 'j1', name: 'import-validate', data: { batch_id: id, async_job_id: await jobOf(id, 'IMPORT_VALIDATE') } }];
    await jobHandlers['import-validate'](validateJob, { log: jlog });
    expect((await getB(id)).json.data).toMatchObject({ status: 'PREVIEW_READY', total_items: 3, job: { kind: 'IMPORT_VALIDATE', status: 'SUCCEEDED', progress_percent: 100 } });
    await jobHandlers['import-validate'](validateJob, { log: jlog }); // pengulangan: dilewati, status tidak berubah
    expect((await getB(id)).json.data.status).toBe('PREVIEW_READY');

    expect((await pub(id, { target_status: 'DRAFT' })).status).toBe(202);
    const publishJob = [{ id: 'j2', name: 'import-publish', data: { batch_id: id, async_job_id: await jobOf(id, 'IMPORT_PUBLISH') } }];
    await jobHandlers['import-publish'](publishJob, { log: jlog });
    const done = (await getB(id)).json.data;
    expect(done).toMatchObject({ status: 'PUBLISHED', created_count: 3, job: { kind: 'IMPORT_PUBLISH', status: 'SUCCEEDED' } });
    await jobHandlers['import-publish'](publishJob, { log: jlog });
    expect((await getB(id)).json.data).toMatchObject({ status: 'PUBLISHED', created_count: 3 });
    expect((await db.select().from(subModules).where(eq(subModules.subModuleCode, '1.99.1'))).length).toBe(1);
  });

  it('worker mati saat VALIDATING: job dikerjakan ulang dari status VALIDATING dan selesai', async () => {
    const r = await upload('JSON', 'crash.json', json(pkg([sub(1)])));
    const id = r.json.data.id as string;
    await db.update(importBatches).set({ status: 'VALIDATING' }).where(eq(importBatches.id, id));
    expect(await runImportValidate(id, await jobOf(id, 'IMPORT_VALIDATE'))).toBe('done');
    expect((await getB(id)).json.data.status).toBe('PREVIEW_READY');
  });

  it('cancel saat VALIDATING ditolak bila job RUNNING dan diizinkan bila tidak; batch dibatalkan sebelum worker jalan -> worker melewati', async () => {
    const r = await upload('JSON', 'cx.json', json(pkg([sub(1)])));
    const id = r.json.data.id as string;
    expect((await cancel(id)).json.data.status).toBe('CANCELLED');
    expect(await runImportValidate(id, await jobOf(id, 'IMPORT_VALIDATE'))).toBe('skipped');
    expect((await getB(id)).json.data.status).toBe('CANCELLED');
    const r2 = await upload('JSON', 'cy.json', json(pkg([sub(2)])));
    const id2 = r2.json.data.id as string;
    await db.update(importBatches).set({ status: 'VALIDATING' }).where(eq(importBatches.id, id2));
    await db.update(asyncJobs).set({ status: 'RUNNING', startedAt: new Date() }).where(eq(asyncJobs.importBatchId, id2));
    const c = await cancel(id2); // job RUNNING -> ditolak
    expect(c.status).toBe(409);
    expect(c.json.error.code).toBe('BATCH_NOT_CANCELLABLE');
    await db.update(asyncJobs).set({ status: 'QUEUED' }).where(eq(asyncJobs.importBatchId, id2));
    expect((await cancel(id2)).json.data.status).toBe('CANCELLED'); // job tidak RUNNING -> boleh (F-19-02)
  });
});

// ================================================================ perbaikan QA W4
describe('SPEC-019 perbaikan QA W4', () => {
  const slideMat = (codes: string[]) => ({ article_markdown: '# Materi', slides: codes.map((c, i) => ({ order: i + 1, asset_code: c, caption: `Slide ${i + 1}` })) });

  it('F-19-01: batch DRAFT yang meng-UPDATE sub-modul PUBLISHED dengan aset UNVERIFIED dibatalkan (PUBLISH_BLOCKED), konten tayang tidak berubah', async () => {
    await uploadAsset('tier1/slides/ok', '#0a0a0a', 'OWN_ORIGINAL');
    await uploadAsset('tier1/slides/baru', '#0b0b0b'); // UNVERIFIED
    const v1 = await uploadValidated('JSON', 'live1.json', json(pkg([sub(1, { materials: slideMat(['tier1/slides/ok']) })])));
    expect((await publishRun(v1.id, { target_status: 'PUBLISHED' })).status).toBe('PUBLISHED');
    const live = await subRow('1.99.1');
    expect(live!.status).toBe('PUBLISHED');

    const v2 = await uploadValidated('JSON', 'live2.json', json(pkg([sub(1, { materials: slideMat(['tier1/slides/ok', 'tier1/slides/baru']) })])));
    expect(v2.batch.valid_items).toBeGreaterThan(0);
    const out = await publishRun(v2.id, { target_status: 'DRAFT', acknowledge_warnings: true });
    expect(out.status).toBe('PREVIEW_READY');
    expect(out.summary.last_error.code).toBe('PUBLISH_BLOCKED');
    expect(out.summary.last_error.blockers.map((b: { code: string }) => b.code)).toContain('ASSET_UNVERIFIED');
    const after = await subRow('1.99.1');
    expect(after!.status).toBe('PUBLISHED');
    expect(after!.contentVersion).toBe(live!.contentVersion);
    expect((await db.select().from(contentRevisions).where(eq(contentRevisions.importBatchId, v2.id))).length).toBe(0);

    // target PUBLISHED juga tidak lolos lewat jalur "sudah PUBLISHED"
    const again = await publishRun(v2.id, { target_status: 'PUBLISHED', acknowledge_warnings: true });
    expect(again.status).toBe('PREVIEW_READY');
    expect(again.summary.last_error.code).toBe('PUBLISH_BLOCKED');
  });

  it('F-19-01: video YouTube baru pada sub-modul PUBLISHED (dibuat UNVERIFIED) juga menghalangi', async () => {
    const v1 = await uploadValidated('JSON', 'vlive1.json', json(pkg([sub(1, { materials: { article_markdown: '# M' } })])));
    expect((await publishRun(v1.id, { target_status: 'PUBLISHED' })).status).toBe('PUBLISHED');
    const withVideo = sub(1, { materials: { article_markdown: '# M', videos: [{ video_id: 'dQw4w9WgXcQ', title: 'V', language: 'EN', start_sec: 0, end_sec: 60 }] } });
    const v2 = await uploadValidated('JSON', 'vlive2.json', json(pkg([withVideo])));
    const out = await publishRun(v2.id, { target_status: 'DRAFT', acknowledge_warnings: true });
    expect(out.status).toBe('PREVIEW_READY');
    expect(out.summary.last_error.code).toBe('PUBLISH_BLOCKED');
    expect((await db.execute(sql`SELECT count(*)::int AS n FROM content_assets WHERE kind='VIDEO_EMBED'`)).rows[0]).toEqual({ n: 0 });
  });

  it('F-19-02: watchdog memulihkan batch macet (job terminal / tanpa kemajuan) dan upload baru tidak lagi IMPORT_IN_PROGRESS', async () => {
    const a = await upload('JSON', 'stuck1.json', json(pkg([sub(1)])));
    const id = a.json.data.id as string;
    await db.update(importBatches).set({ status: 'VALIDATING' }).where(eq(importBatches.id, id));
    await db.update(asyncJobs).set({ status: 'FAILED', errorCode: 'X', finishedAt: new Date() }).where(eq(asyncJobs.importBatchId, id));
    const b = await upload('JSON', 'stuck2.json', json(pkg([sub(2)]))); // pemulihan lazy
    expect(b.status, JSON.stringify(b.json)).toBe(201);
    const rec = (await getB(id)).json.data;
    expect(rec.status).toBe('FAILED');
    expect(rec.summary.last_error.code).toBe('JOB_STALLED');

    // PUBLISHING macet tanpa kemajuan > ambang -> kembali PREVIEW_READY
    await cancel(b.json.data.id);
    const c = await uploadValidated('JSON', 'stuck3.json', json(pkg([sub(3)])));
    expect((await pub(c.id, { target_status: 'DRAFT' })).status).toBe(202);
    expect(await recoverStuckBatches(db)).toBe(0); // job baru, belum macet
    expect(await recoverStuckBatches(db, new Date(Date.now() + 31 * 60_000))).toBe(1);
    const back = (await getB(c.id)).json.data;
    expect(back.status).toBe('PREVIEW_READY');
    expect(back.summary.last_error.code).toBe('JOB_STALLED');
    expect(back.job).toMatchObject({ status: 'FAILED', error_code: 'JOB_STALLED' });
    expect((await pub(c.id, { target_status: 'DRAFT' })).status).toBe(202); // dapat dicoba lagi
  });

  it('F-19-03: audit publikasi memakai admin yang menekan Publikasikan (IMPORT_PUBLISH_REQUESTED + IMPORT_PUBLISHED)', async () => {
    const admin2 = await adminSession();
    const v = await uploadValidated('JSON', 'actor.json', json(pkg([sub(1)])));
    const r = await call(publishPost, 'POST', '/x', { cookie: admin2.cookie, params: { batch_id: v.id }, body: { target_status: 'DRAFT' } });
    expect(r.status).toBe(202);
    await runImportPublish(v.id, await jobOf(v.id, 'IMPORT_PUBLISH'));
    const rows = (await db.execute(sql`SELECT action, actor_user_id::text AS actor FROM audit_log WHERE entity_id = ${v.id} AND action IN ('IMPORT_PUBLISH_REQUESTED','IMPORT_PUBLISHED')`)).rows as Array<{ action: string; actor: string }>;
    expect(rows.map((x) => x.action).sort()).toEqual(['IMPORT_PUBLISHED', 'IMPORT_PUBLISH_REQUESTED']);
    expect(rows.every((x) => x.actor === admin2.user.id)).toBe(true);
    const revs = await db.select().from(contentRevisions).where(eq(contentRevisions.importBatchId, v.id));
    expect(revs.length).toBeGreaterThan(0);
  });

  it('F-19-04: array JSON sangat besar -> 400 too_many_items (bukan 500 RangeError)', async () => {
    const body = Buffer.from(`{"contract_version":"1.1","modules":[${new Array(300_000).fill('0').join(',')}]}`);
    const r = await upload('JSON', 'big-array.json', body);
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('IMPORT_FILE_INVALID');
    expect(r.json.error.details[0].code).toBe('too_many_items');
  });
});

// ================================================================ QA W8
describe('QA W8 F-20-03: publikasi impor memuat konten buatan AI wajib confirm_reviewed (K2)', () => {
  const ai = (n: number) => sub(n, { origin: 'AI_GENERATED_REVIEWED', materials: { article_markdown: '# Materi AI' } });
  const auditsOf = async (action: string, batchId: string) => (await db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.entityId, batchId)))).map((a) => a.metadata as Record<string, unknown>);

  it('target PUBLISHED tanpa confirm_reviewed -> 409 REVIEW_CONFIRMATION_REQUIRED, batch tetap PREVIEW_READY; dengan confirm -> PUBLISHED dan confirmed_by tercatat di audit', async () => {
    const { id, batch } = await uploadValidated('JSON', 'ai.json', json(pkg([ai(1)])));
    expect(batch.summary.has_ai_generated).toBe(true); // FE dapat menampilkan kotak konfirmasi di muka
    const denied = await pub(id, { target_status: 'PUBLISHED', acknowledge_warnings: true });
    expect(denied.status).toBe(409);
    expect(denied.json.error.code).toBe('REVIEW_CONFIRMATION_REQUIRED');
    expect(denied.json.error.details[0]).toMatchObject({ path: 'confirm_reviewed', code: 'required' });
    expect((await getB(id)).json.data.status).toBe('PREVIEW_READY');
    expect(await subRow('1.99.1')).toBeUndefined();
    // confirm_reviewed: false eksplisit juga ditolak
    expect((await pub(id, { target_status: 'PUBLISHED', acknowledge_warnings: true, confirm_reviewed: false })).status).toBe(409);

    const done = await publishRun(id, { target_status: 'PUBLISHED', acknowledge_warnings: true, confirm_reviewed: true });
    expect(done.status).toBe('PUBLISHED');
    expect((await subRow('1.99.1'))!.status).toBe('PUBLISHED');
    expect((await setRow('ACTIVE_DRILL:1.99.1'))!.status).toBe('PUBLISHED');
    const [requested] = await auditsOf('IMPORT_PUBLISH_REQUESTED', id);
    const [published] = await auditsOf('IMPORT_PUBLISHED', id);
    expect(requested).toMatchObject({ target_status: 'PUBLISHED', confirmed_by: admin.user.id });
    expect(published).toMatchObject({ target_status: 'PUBLISHED', confirmed_by: admin.user.id });
  });

  it('target DRAFT tidak memerlukan konfirmasi dan tidak mencatat confirmed_by; konten non-AI PUBLISHED tidak memerlukannya', async () => {
    const a = await uploadValidated('JSON', 'ai-draft.json', json(pkg([ai(1)])));
    const done = await publishRun(a.id, { target_status: 'DRAFT', acknowledge_warnings: true });
    expect(done.status).toBe('PUBLISHED');
    expect((await auditsOf('IMPORT_PUBLISHED', a.id))[0]).not.toHaveProperty('confirmed_by');
    await cleanupContentFixtures();
    const b = await uploadValidated('JSON', 'plain.json', json(pkg([sub(2, { materials: { article_markdown: '# Materi' } })])));
    expect(b.batch.summary.has_ai_generated).toBe(false);
    expect((await publishRun(b.id, { target_status: 'PUBLISHED', acknowledge_warnings: true })).status).toBe('PUBLISHED');
  });

  it('job memeriksa ulang origin di DB: item NOOP atas set AI berstatus DRAFT dipublikasikan tanpa konfirmasi -> dibatalkan, PREVIEW_READY + REVIEW_CONFIRMATION_REQUIRED', async () => {
    const first = await uploadValidated('JSON', 'ai-1.json', json(pkg([ai(1)])));
    await publishRun(first.id, { target_status: 'DRAFT', acknowledge_warnings: true });
    expect((await subRow('1.99.1'))!.status).toBe('DRAFT');
    // Berkas berbeda (tambah sub-modul non-AI) tetapi item AI tetap NOOP: pemeriksaan cepat di permintaan lolos, job yang menolak.
    const again = await uploadValidated('JSON', 'ai-2.json', json(pkg([ai(1), sub(2, { materials: { article_markdown: '# Materi' } })])));
    expect((await items(again.id)).json.data.find((x: { entity_code: string }) => x.entity_code === '1.99.1').action).toBe('NOOP');
    const r = await pub(again.id, { target_status: 'PUBLISHED', acknowledge_warnings: true });
    expect(r.status, JSON.stringify(r.json)).toBe(202);
    await runImportPublish(again.id, await jobOf(again.id, 'IMPORT_PUBLISH'));
    const b = (await getB(again.id)).json.data;
    expect(b.status).toBe('PREVIEW_READY');
    expect(b.summary.last_error.code).toBe('REVIEW_CONFIRMATION_REQUIRED');
    expect(b.job).toMatchObject({ status: 'FAILED', error_code: 'REVIEW_CONFIRMATION_REQUIRED' });
    expect((await subRow('1.99.1'))!.status).toBe('DRAFT');
    expect(await subRow('1.99.2')).toBeUndefined(); // transaksi dibatalkan seluruhnya
    const ok = await publishRun(again.id, { target_status: 'PUBLISHED', acknowledge_warnings: true, confirm_reviewed: true });
    expect(ok.status).toBe('PUBLISHED');
    expect((await subRow('1.99.1'))!.status).toBe('PUBLISHED');
  });
});

describe('QA W8 F-20-04: impor memakai definisi attempt hidup yang sama dengan kurasi', () => {
  it('attempt PRACTICE basi (> 24 jam) tidak lagi memblokir impor; yang segar tetap memblokir', async () => {
    const v1 = await uploadValidated('JSON', 'v1.json', json(pkg([sub(1)])));
    await publishRun(v1.id, { target_status: 'DRAFT' });
    const learner = await learnerSession();
    const set = (await setRow('ACTIVE_DRILL:1.99.1'))!;
    const [a] = await db.insert(attempts).values({ userId: learner.user.id, assessmentSetId: set.id, assessmentVersion: set.version, mode: 'PRACTICE', status: 'IN_PROGRESS' }).returning();
    const pkg2 = json(pkg([sub(1, {}, [mcq(11), mcq(12, 'am')])]));
    const busy = await uploadValidated('JSON', 'v2.json', pkg2);
    expect((await items(busy.id, '?status=INVALID')).json.data[0].errors.map((e: { code: string }) => e.code)).toContain('set_has_active_attempts');
    await cancel(busy.id);
    await db.execute(sql`UPDATE attempts SET updated_at = now() - interval '25 hours' WHERE id = ${a!.id}::uuid`);
    const free = await uploadValidated('JSON', 'v2b.json', json(pkg([sub(1, {}, [mcq(21), mcq(22, 'am')])])));
    expect(free.batch.invalid_items).toBe(0);
  });
});
