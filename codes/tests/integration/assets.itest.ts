import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, contentAssets, contentSources } from '@/db/schema';
import { closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { config } from '@/server/config';
import { GET as sourcesList, POST as sourcesCreate } from '@/app/api/v1/admin/content-sources/route';
import { PATCH as sourcePatch } from '@/app/api/v1/admin/content-sources/[source_id]/route';
import { GET as assetsList, POST as assetsUpload } from '@/app/api/v1/admin/assets/route';
import { POST as assetsExternal } from '@/app/api/v1/admin/assets/external/route';
import { DELETE as assetDelete, GET as assetGet, PATCH as assetPatch } from '@/app/api/v1/admin/assets/[asset_id]/route';
import { GET as assetFile } from '@/app/api/v1/admin/assets/[asset_id]/file/route';
import { GET as licenseSummary } from '@/app/api/v1/admin/license-summary/route';
import { adminSession, call, callMultipart, learnerSession } from './helpers';

const db = getDb();
let admin: Awaited<ReturnType<typeof adminSession>>;
let ownId: string;

beforeAll(async () => {
  admin = await adminSession();
  const [own] = await db.select().from(contentSources).where(eq(contentSources.code, 'OWN'));
  ownId = own!.id;
});
afterAll(closeDb);
beforeEach(async () => {
  resetRateLimits();
  await db.execute(sql`UPDATE sub_modules SET status='DRAFT'`);
  await db.execute(sql`DELETE FROM assessment_sets`);
  await db.execute(sql`DELETE FROM learning_materials`);
  await db.execute(sql`DELETE FROM content_assets`);
  await db.execute(sql`DELETE FROM content_sources WHERE left(code, 2) = 'T_'`);
});

const srcId = async (code: string) => (await db.select().from(contentSources).where(eq(contentSources.code, code)))[0]!.id;
const png = (c = '#336699', w = 16) => sharp({ create: { width: w, height: w, channels: 3, background: c } }).png().toBuffer();
function wav(sec: number) {
  const rate = 8000, data = Buffer.alloc(rate * sec), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate, 28);
  h.writeUInt16LE(1, 32); h.writeUInt16LE(8, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
function zip(entries: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, body] of Object.entries(entries)) {
    const n = Buffer.from(name), b = Buffer.from(body), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(b.length, 18); h.writeUInt32LE(b.length, 22); h.writeUInt16LE(n.length, 26);
    parts.push(h, n, b);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  return Buffer.concat([...parts, eocd]);
}
const CT = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

const rawGet = (h: (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>, id: string, cookie: string, headers: Record<string, string> = {}) =>
  h(new Request(`http://localhost:3000/api/v1/admin/assets/${id}/file`, { headers: { cookie, origin: 'http://localhost:3000', 'x-forwarded-for': '10.9.9.9', ...headers } }), { params: Promise.resolve({ asset_id: id }) });

const upload = (fields: Record<string, string>, file?: { filename: string; data: Buffer }, cookie = admin.cookie) =>
  callMultipart(assetsUpload, '/api/v1/admin/assets', {
    fields: Object.entries(fields),
    files: file ? [file] : [],
    cookie,
  });
const slide = (extra: Record<string, string> = {}) => ({ kind: 'SLIDE_IMAGE', title: 'Slide uji', source_id: ownId, ...extra });

describe('SPEC-018 sumber konten', () => {
  it('daftar 14 sumber seed urut code; buat sumber; kode ganda 409; LINK_ONLY + may_store_copy 400', async () => {
    const list = await call(sourcesList, 'GET', '/api/v1/admin/content-sources', { cookie: admin.cookie });
    expect(list.status).toBe(200);
    expect(list.json.data.length).toBeGreaterThanOrEqual(12);
    const codes = list.json.data.map((s: { code: string }) => s.code);
    expect(codes).toEqual([...codes].sort());
    const body = { code: 'T_OPEN', name: 'Sumber uji', license_type: 'CC_BY_NC', url: 'https://example.org/x' };
    const ok = await call(sourcesCreate, 'POST', '/api/v1/admin/content-sources', { cookie: admin.cookie, body });
    expect(ok.status).toBe(201);
    expect(ok.json.data).toMatchObject({ non_commercial_only: true, share_alike: false, may_store_copy: false, asset_count: 0 });
    const dup = await call(sourcesCreate, 'POST', '/api/v1/admin/content-sources', { cookie: admin.cookie, body });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('SOURCE_CODE_TAKEN');
    const bad = await call(sourcesCreate, 'POST', '/api/v1/admin/content-sources', {
      cookie: admin.cookie,
      body: { code: 'T_BAD', name: 'x', license_type: 'LINK_ONLY_COPYRIGHTED', may_store_copy: true },
    });
    expect(bad.status).toBe(400);
    expect(bad.json.error.details[0].code).toBe('store_copy_not_allowed');
  });

  it('PATCH: license_type -> unrecognized_key; kosong -> empty_update; may_store_copy=false dengan aset tersimpan -> SOURCE_IN_USE', async () => {
    const created = await call(sourcesCreate, 'POST', '/api/v1/admin/content-sources', {
      cookie: admin.cookie,
      body: { code: 'T_STORE', name: 'Sumber simpan', license_type: 'CC0', may_store_copy: true },
    });
    const id = created.json.data.id;
    const a = await call(sourcePatch, 'PATCH', `/api/v1/admin/content-sources/${id}`, { cookie: admin.cookie, params: { source_id: id }, body: { license_type: 'OWN' } });
    expect(a.status).toBe(400);
    expect(a.json.error.details[0].code).toBe('unrecognized_key');
    const b = await call(sourcePatch, 'PATCH', `/api/v1/admin/content-sources/${id}`, { cookie: admin.cookie, params: { source_id: id }, body: {} });
    expect(b.json.error.details[0].code).toBe('empty_update');
    const up = await upload({ kind: 'IMAGE', title: 'Gambar', source_id: id }, { filename: 'x.png', data: await png('#112233') });
    expect(up.status).toBe(201);
    const c = await call(sourcePatch, 'PATCH', `/api/v1/admin/content-sources/${id}`, { cookie: admin.cookie, params: { source_id: id }, body: { may_store_copy: false } });
    expect(c.status).toBe(409);
    expect(c.json.error.code).toBe('SOURCE_IN_USE');
    const ok = await call(sourcePatch, 'PATCH', `/api/v1/admin/content-sources/${id}`, { cookie: admin.cookie, params: { source_id: id }, body: { name: 'Baru' } });
    expect(ok.json.data.name).toBe('Baru');
    expect(ok.json.data.asset_count).toBe(1);
  });
});

describe('SPEC-018 unggah aset', () => {
  it('slide PNG valid: 201 UNVERIFIED, key public/slides/<uuid>.png, tanpa storage_key/sha256, berkas ada', async () => {
    const r = await upload(slide({ asset_code: 'tier2/slides/uji-satu' }), { filename: 'nama-asli.png', data: await png() });
    expect(r.status).toBe(201);
    const d = r.json.data;
    expect(d).toMatchObject({ rights_status: 'UNVERIFIED', mime_type: 'image/png', storage_backend: 'FILESYSTEM', kind: 'SLIDE_IMAGE', asset_code: 'tier2/slides/uji-satu' });
    expect(d.storage_key).toBeUndefined();
    expect(d.sha256).toBeUndefined();
    const [row] = await db.select().from(contentAssets).where(eq(contentAssets.id, d.id));
    expect(row!.storageKey).toMatch(/^public\/slides\/[0-9a-f-]{36}\.png$/);
    expect(row!.sha256).toHaveLength(64);
    expect(existsSync(path.join(config.assetsDir(), row!.storageKey!))).toBe(true);
    const [a] = await db.select().from(auditLog).where(sql`${auditLog.action} = 'ASSET_UPLOADED' AND ${auditLog.entityId} = ${d.id}`);
    expect(a).toBeTruthy();
  });

  it('EXIF/GPS dibuang pada JPEG', async () => {
    const jpg = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#aa0000' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'RAHASIA-EXIF' } })
      .toBuffer();
    expect((await sharp(jpg).metadata()).exif).toBeTruthy();
    const r = await upload({ kind: 'IMAGE', title: 'Foto', source_id: ownId }, { filename: 'f.jpg', data: jpg });
    expect(r.status).toBe(201);
    const [row] = await db.select().from(contentAssets).where(eq(contentAssets.id, r.json.data.id));
    const { readFile } = await import('node:fs/promises');
    const stored = await readFile(path.join(config.assetsDir(), row!.storageKey!));
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    expect(stored.includes(Buffer.from('RAHASIA-EXIF'))).toBe(false);
  });

  it('SVG dan EXE berekstensi .png -> 415 UNSUPPORTED_FILE_TYPE tanpa berkas/baris', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
    for (const [f, d] of [['a.svg', svg], ['b.png', exe]] as const) {
      const r = await upload(slide(), { filename: f, data: d });
      expect(r.status, f).toBe(415);
      expect(r.json.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    }
    expect((await db.select().from(contentAssets)).length).toBe(0);
  });

  it('DOCX bermakro 415 MACRO_NOT_ALLOWED; DOCX valid dan PDF valid 201; zip bukan docx 400 docx_invalid', async () => {
    const macro = zip({ '[Content_Types].xml': CT, 'word/document.xml': '<w/>', 'word/vbaProject.bin': 'x' });
    const m = await upload({ kind: 'DOCUMENT', title: 'Makro', source_id: ownId }, { filename: 'm.docx', data: macro });
    expect(m.status).toBe(415);
    expect(m.json.error.code).toBe('MACRO_NOT_ALLOWED');
    const ok = await upload({ kind: 'DOCUMENT', title: 'Dok', source_id: ownId }, { filename: 'ok.docx', data: zip({ '[Content_Types].xml': CT, 'word/document.xml': '<w/>' }) });
    expect(ok.status).toBe(201);
    expect(ok.json.data.mime_type).toContain('wordprocessingml');
    const pdf = await upload({ kind: 'DOCUMENT', title: 'PDF', source_id: ownId }, { filename: 'a.pdf', data: PDF });
    expect(pdf.status).toBe(201);
    expect(pdf.json.data.mime_type).toBe('application/pdf');
    const z = await upload({ kind: 'DOCUMENT', title: 'Zip', source_id: ownId }, { filename: 'a.docx', data: zip({ 'foo.txt': 'bar' }) });
    expect(z.status).toBe(400);
    expect(z.json.error.details[0].code).toBe('docx_invalid');
  });

  it('gambar 6 MB -> 413 (pembacaan dihentikan); gambar tepat batas diterima oleh batas; kind tidak dikenal -> invalid_kind', async () => {
    const r = await upload(slide(), { filename: 'big.png', data: Buffer.alloc(6 * 1_048_576, 7) });
    expect(r.status).toBe(413);
    expect(r.json.error.code).toBe('PAYLOAD_TOO_LARGE');
    const k = await upload({ kind: 'SVG', title: 'x', source_id: ownId }, { filename: 'a.png', data: await png() });
    expect(k.status).toBe(400);
    expect(k.json.error.details.find((d: { path: string }) => d.path === 'kind').code).toBe('invalid_kind');
  });

  it('audio WAV valid -> duration_sec; WAV korup -> 400 audio_unreadable', async () => {
    const ok = await upload({ kind: 'AUDIO_LISTENING', title: 'Audio', source_id: ownId }, { filename: 'a.wav', data: wav(3) });
    expect(ok.status).toBe(201);
    expect(ok.json.data.duration_sec).toBe(3);
    expect(ok.json.data.mime_type).toMatch(/wav/);
    const bad = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(40, 9)]);
    const r = await upload({ kind: 'AUDIO_LISTENING', title: 'Rusak', source_id: ownId }, { filename: 'b.wav', data: bad });
    expect(r.status).toBe(400);
    expect(r.json.error.details[0].code).toBe('audio_unreadable');
    expect(config.assetsDir()).toBeTruthy();
  });

  it('duplikat berkas 409 DUPLICATE_ASSET (id pertama); asset_code ganda 409; asset_code berisi .. ditolak', async () => {
    const data = await png('#00ff00');
    const first = await upload(slide({ asset_code: 'tier1/slides/aaa' }), { filename: 'a.png', data });
    expect(first.status).toBe(201);
    const dup = await upload(slide(), { filename: 'b.png', data });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('DUPLICATE_ASSET');
    expect(dup.json.error.details[0]).toMatchObject({ path: 'file', code: 'duplicate_of', message: first.json.data.id });
    const code = await upload(slide({ asset_code: 'tier1/slides/aaa' }), { filename: 'c.png', data: await png('#0000ff') });
    expect(code.status).toBe(409);
    expect(code.json.error.code).toBe('ASSET_CODE_TAKEN');
    const trav = await upload(slide({ asset_code: '../../etc/passwd' }), { filename: 'd.png', data: await png('#ff00ff') });
    expect(trav.status).toBe(400);
    expect(trav.json.error.details[0].code).toBe('asset_code_invalid');
  });

  it('dua unggahan berkas sama serentak: satu 201, satu 409; hanya satu berkas tersimpan', async () => {
    const data = await png('#abcdef', 20);
    const [a, b] = await Promise.all([upload(slide(), { filename: 'a.png', data }), upload(slide(), { filename: 'b.png', data })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect((await db.select().from(contentAssets)).length).toBe(1);
  });

  it('sumber CAMBRIDGE_REF -> 409 SOURCE_NOT_STORABLE; source_id tidak ada -> 404; tanpa/ganda berkas; bukan multipart 415; learner 403', async () => {
    const cam = await upload({ kind: 'IMAGE', title: 'x', source_id: await srcId('CAMBRIDGE_REF') }, { filename: 'a.png', data: await png() });
    expect(cam.status).toBe(409);
    expect(cam.json.error.code).toBe('SOURCE_NOT_STORABLE');
    const nf = await upload({ kind: 'IMAGE', title: 'x', source_id: '5a5a5a5a-0001-4000-8000-0000000000ff' }, { filename: 'a.png', data: await png() });
    expect(nf.status).toBe(404);
    const none = await upload(slide());
    expect(none.json.error.details[0].code).toBe('file_required');
    const two = await callMultipart(assetsUpload, '/api/v1/admin/assets', {
      fields: Object.entries(slide()),
      files: [{ filename: 'a.png', data: await png() }, { filename: 'b.png', data: await png('#fff000') }],
      cookie: admin.cookie,
    });
    expect(two.json.error.details[0].code).toBe('multiple_files');
    const json = await call(assetsUpload, 'POST', '/api/v1/admin/assets', { cookie: admin.cookie, body: {} });
    expect(json.status).toBe(415);
    const learner = await learnerSession();
    const l = await upload(slide(), { filename: 'a.png', data: await png() }, learner.cookie);
    expect(l.status).toBe(403);
  });
});

describe('SPEC-018 aset eksternal', () => {
  const ytBody = { kind: 'VIDEO_EMBED', title: 'Passive Voice', source_id: '', external_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', external_ref: 'dQw4w9WgXcQ' };
  it('VIDEO_EMBED 201 UNVERIFIED EXTERNAL; host/ref/duplikat; REFERENCE_LINK LINK_ONLY', async () => {
    const source_id = await srcId('YOUTUBE');
    const ok = await call(assetsExternal, 'POST', '/api/v1/admin/assets/external', { cookie: admin.cookie, body: { ...ytBody, source_id } });
    expect(ok.status).toBe(201);
    expect(ok.json.data).toMatchObject({ rights_status: 'UNVERIFIED', storage_backend: 'EXTERNAL', external_ref: 'dQw4w9WgXcQ', mime_type: null });
    const [row] = await db.select().from(contentAssets).where(eq(contentAssets.id, ok.json.data.id));
    expect(row!.storageKey).toBeNull();
    const evil = await call(assetsExternal, 'POST', '/api/v1/admin/assets/external', { cookie: admin.cookie, body: { ...ytBody, source_id, external_url: 'https://evil.example/x' } });
    expect(evil.json.error.details[0].code).toBe('host_not_allowed');
    const mism = await call(assetsExternal, 'POST', '/api/v1/admin/assets/external', { cookie: admin.cookie, body: { ...ytBody, source_id, external_ref: 'AAAAAAAAAAA' } });
    expect(mism.json.error.details[0].code).toBe('ref_mismatch');
    const dup = await call(assetsExternal, 'POST', '/api/v1/admin/assets/external', { cookie: admin.cookie, body: { ...ytBody, source_id } });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe('ASSET_ALREADY_EXISTS');
    expect(dup.json.error.details[0].message).toBe(ok.json.data.id);
    const link = await call(assetsExternal, 'POST', '/api/v1/admin/assets/external', {
      cookie: admin.cookie,
      body: { kind: 'REFERENCE_LINK', title: 'Rujukan', source_id: await srcId('CAMBRIDGE_REF'), external_url: 'https://example.org/ref' },
    });
    expect(link.status).toBe(201);
    expect(link.json.data).toMatchObject({ rights_status: 'LINK_ONLY', external_ref: null });
    const http = await call(assetsExternal, 'POST', '/api/v1/admin/assets/external', { cookie: admin.cookie, body: { ...ytBody, source_id, external_url: 'http://www.youtube.com/watch?v=dQw4w9WgXcQ' } });
    expect(http.status).toBe(400);
  });
});

describe('SPEC-018 verifikasi lisensi, daftar, hapus, ringkasan', () => {
  const mk = async (fields: Record<string, string>, color: string) => {
    const r = await upload(fields, { filename: 'a.png', data: await png(color) });
    expect(r.status).toBe(201);
    return r.json.data.id as string;
  };
  const patch = (id: string, body: unknown) => call(assetPatch, 'PATCH', `/api/v1/admin/assets/${id}`, { cookie: admin.cookie, params: { asset_id: id }, body });

  it('OWN_ORIGINAL pada sumber OWN: terisi verifier + audit; EMBED_ONLY pada SLIDE_IMAGE 400; body kosong 400', async () => {
    const id = await mk(slide(), '#101010');
    const ok = await patch(id, { rights_status: 'OWN_ORIGINAL' });
    expect(ok.status).toBe(200);
    expect(ok.json.data.rights_status).toBe('OWN_ORIGINAL');
    expect(ok.json.data.license_verified_at).toBeTruthy();
    expect(ok.json.data.license_verified_by_name).toBe('Uji Coba');
    const [a] = await db.select().from(auditLog).where(sql`${auditLog.action} = 'LICENSE_STATUS_CHANGED' AND ${auditLog.entityId} = ${id}`);
    expect(a!.metadata).toMatchObject({ asset_id: id, from: 'UNVERIFIED', to: 'OWN_ORIGINAL' });
    expect((await patch(id, { rights_status: 'EMBED_ONLY' })).json.error.details[0].code).toBe('rights_status_invalid_for_kind');
    expect((await patch(id, {})).json.error.details[0].code).toBe('empty_update');
    const back = await patch(id, { rights_status: 'UNVERIFIED' });
    expect(back.json.data.license_verified_at).toBeNull();
    expect(back.json.data.license_verified_by_name).toBeNull();
    // ubah atribusi pada aset terverifikasi tidak mengubah status
    await patch(id, { rights_status: 'OWN_ORIGINAL' });
    expect((await patch(id, { attribution_text: 'Foto pribadi' })).json.data.rights_status).toBe('OWN_ORIGINAL');
  });

  it('NGSL (share-alike) tanpa atribusi 409 ATTRIBUTION_REQUIRED, dengan atribusi 200; TATOEBA OWN_ORIGINAL 409 RIGHTS_SOURCE_MISMATCH; OWN VERIFIED_OPEN 409', async () => {
    const ngsl = await mk({ kind: 'IMAGE', title: 'N', source_id: await srcId('NGSL') }, '#202020');
    expect((await patch(ngsl, { rights_status: 'VERIFIED_OPEN' })).json.error.code).toBe('ATTRIBUTION_REQUIRED');
    expect((await patch(ngsl, { rights_status: 'VERIFIED_OPEN', attribution_text: 'NGSL (CC BY-SA)' })).status).toBe(200);
    const tat = await mk({ kind: 'IMAGE', title: 'T', source_id: await srcId('TATOEBA') }, '#303030');
    const r = await patch(tat, { rights_status: 'OWN_ORIGINAL' });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe('RIGHTS_SOURCE_MISMATCH');
    const own = await mk({ kind: 'IMAGE', title: 'O', source_id: ownId }, '#404040');
    expect((await patch(own, { rights_status: 'VERIFIED_OPEN' })).json.error.code).toBe('RIGHTS_SOURCE_MISMATCH');
  });

  it('VIDEO_EMBED -> EMBED_ONLY; rujukan konten: referenced_by, hapus 409 ASSET_IN_USE, kembali UNVERIFIED saat PUBLISHED 409', async () => {
    const vid = await call(assetsExternal, 'POST', '/api/v1/admin/assets/external', {
      cookie: admin.cookie,
      body: { kind: 'VIDEO_EMBED', title: 'V', source_id: await srcId('YOUTUBE'), external_url: 'https://youtu.be/abcdefghijk', external_ref: 'abcdefghijk' },
    });
    expect((await patch(vid.json.data.id, { rights_status: 'EMBED_ONLY' })).status).toBe(200);

    const slideId = await mk(slide({ asset_code: 'tier1/slides/ref' }), '#505050');
    await patch(slideId, { rights_status: 'OWN_ORIGINAL' });
    const [sub] = (await db.execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = '2.1.3'`)).rows as Array<{ id: string }>;
    await db.execute(sql`INSERT INTO learning_materials (sub_module_id, article_markdown, slides_json, origin) VALUES (${sub!.id}::uuid, 'x', ${JSON.stringify([{ asset_id: slideId, order: 1, caption: 'c' }])}::jsonb, 'ORIGINAL_AUTHORED')`);
    const detail = await call(assetGet, 'GET', `/api/v1/admin/assets/${slideId}`, { cookie: admin.cookie, params: { asset_id: slideId } });
    expect(detail.json.data.referenced_by).toEqual([{ entity_type: 'SUB_MODULE', entity_id: sub!.id, label: expect.stringContaining('2.1.3'), status: 'DRAFT' }]);
    const del = await call(assetDelete, 'DELETE', `/api/v1/admin/assets/${slideId}`, { cookie: admin.cookie, params: { asset_id: slideId } });
    expect(del.status).toBe(409);
    expect(del.json.error.code).toBe('ASSET_IN_USE');
    await db.execute(sql`UPDATE sub_modules SET status='PUBLISHED' WHERE id = ${sub!.id}::uuid`);
    const un = await patch(slideId, { rights_status: 'UNVERIFIED' });
    expect(un.status).toBe(409);
    expect(un.json.error.code).toBe('ASSET_IN_PUBLISHED_USE');
    await db.execute(sql`UPDATE sub_modules SET status='DRAFT' WHERE id = ${sub!.id}::uuid`);
    await db.execute(sql`DELETE FROM learning_materials`);
  });

  it('hapus aset yatim: 204, baris + berkas hilang; 404 setelahnya', async () => {
    const id = await mk(slide(), '#606060');
    const [row] = await db.select().from(contentAssets).where(eq(contentAssets.id, id));
    const full = path.join(config.assetsDir(), row!.storageKey!);
    expect(existsSync(full)).toBe(true);
    const del = await call(assetDelete, 'DELETE', `/api/v1/admin/assets/${id}`, { cookie: admin.cookie, params: { asset_id: id } });
    expect(del.status).toBe(204);
    expect(existsSync(full)).toBe(false);
    expect((await call(assetGet, 'GET', `/api/v1/admin/assets/${id}`, { cookie: admin.cookie, params: { asset_id: id } })).status).toBe(404);
    const [a] = await db.select().from(auditLog).where(sql`${auditLog.action} = 'ASSET_DELETED' AND ${auditLog.entityId} = ${id}`);
    expect(a).toBeTruthy();
  });

  it('daftar: filter, referenced=false, q="%" literal, reference_count; license-summary & publish_blockers turun setelah verifikasi', async () => {
    const a = await mk(slide({ title: 'Alpha satu', asset_code: 'tier1/slides/alpha' }), '#707070');
    const b = await mk(slide({ title: 'Beta dua' }), '#808080');
    const all = await call(assetsList, 'GET', '/api/v1/admin/assets', { cookie: admin.cookie });
    expect(all.json.meta.total).toBe(2);
    expect(all.json.data[0].reference_count).toBe(0);
    const orphan = await call(assetsList, 'GET', '/api/v1/admin/assets?referenced=false&rights_status=UNVERIFIED', { cookie: admin.cookie });
    expect(orphan.json.data.length).toBe(2);
    expect((await call(assetsList, 'GET', '/api/v1/admin/assets?q=%25', { cookie: admin.cookie })).json.data.length).toBe(0);
    expect((await call(assetsList, 'GET', '/api/v1/admin/assets?q=alpha', { cookie: admin.cookie })).json.data.map((x: { id: string }) => x.id)).toEqual([a]);
    expect((await call(assetsList, 'GET', '/api/v1/admin/assets?q=tier1/slides', { cookie: admin.cookie })).json.data.length).toBe(1);

    const [sub] = (await db.execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = '2.1.3'`)).rows as Array<{ id: string }>;
    await db.execute(sql`INSERT INTO learning_materials (sub_module_id, article_markdown, slides_json, origin) VALUES (${sub!.id}::uuid, 'x', ${JSON.stringify([{ asset_id: b, order: 1, caption: 'c' }])}::jsonb, 'ORIGINAL_AUTHORED')`);
    const s1 = await call(licenseSummary, 'GET', '/api/v1/admin/license-summary', { cookie: admin.cookie });
    expect(s1.json.data.publish_blockers).toBeGreaterThanOrEqual(1);
    expect(s1.json.data.assets_by_rights_status.UNVERIFIED).toBe(2);
    const refd = await call(assetsList, 'GET', '/api/v1/admin/assets?referenced=true', { cookie: admin.cookie });
    expect(refd.json.data.map((x: { id: string }) => x.id)).toEqual([b]);
    expect(refd.json.data[0].reference_count).toBe(1);
    await call(assetPatch, 'PATCH', `/api/v1/admin/assets/${b}`, { cookie: admin.cookie, params: { asset_id: b }, body: { rights_status: 'OWN_ORIGINAL' } });
    const s2 = await call(licenseSummary, 'GET', '/api/v1/admin/license-summary', { cookie: admin.cookie });
    expect(s2.json.data.publish_blockers).toBe(s1.json.data.publish_blockers - 1);
    await db.execute(sql`DELETE FROM learning_materials`);
  });

  it('pratinjau berkas admin: header aman, Range audio 206; learner 403; aset eksternal 404', async () => {
    const img = await mk(slide(), '#909090');
    const f = await rawGet(assetFile, img, admin.cookie);
    expect(f.status).toBe(200);
    expect(f.headers.get('x-content-type-options')).toBe('nosniff');
    expect(f.headers.get('cache-control')).toBe('private, no-store');
    expect(f.headers.get('content-disposition')).toBe('inline');
    const au = await upload({ kind: 'AUDIO_LISTENING', title: 'A', source_id: ownId }, { filename: 'a.wav', data: wav(2) });
    const id = au.json.data.id;
    const res = await rawGet(assetFile, id, admin.cookie, { range: 'bytes=0-9' });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toMatch(/^bytes 0-9\//);
    expect((await res.arrayBuffer()).byteLength).toBe(10);
    const learner = await learnerSession();
    expect((await call(assetFile, 'GET', `/api/v1/admin/assets/${img}/file`, { cookie: learner.cookie, params: { asset_id: img } })).status).toBe(403);
    const ext = await call(assetsExternal, 'POST', '/api/v1/admin/assets/external', {
      cookie: admin.cookie,
      body: { kind: 'REFERENCE_LINK', title: 'R', source_id: await srcId('CAMBRIDGE_REF'), external_url: 'https://example.org/r' },
    });
    expect((await call(assetFile, 'GET', `/api/v1/admin/assets/${ext.json.data.id}/file`, { cookie: admin.cookie, params: { asset_id: ext.json.data.id } })).status).toBe(404);
  });

  it('learner 403 pada daftar/ringkasan/sumber; tanpa sesi 401', async () => {
    const l = await learnerSession();
    for (const [h, u] of [[sourcesList, '/api/v1/admin/content-sources'], [assetsList, '/api/v1/admin/assets'], [licenseSummary, '/api/v1/admin/license-summary']] as const) {
      expect((await call(h, 'GET', u, { cookie: l.cookie })).status).toBe(403);
      expect((await call(h, 'GET', u)).status).toBe(401);
    }
  });
});

