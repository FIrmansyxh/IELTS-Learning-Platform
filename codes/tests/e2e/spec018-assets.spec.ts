/** SPEC-018 sumber & aset berlisensi (admin). */
import sharp from 'sharp';
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newAdmin, newLearner } from './support/app';
import { q, q1 } from './support/db';

const uniquePng = async () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: Math.floor(Math.random() * 255), g: Math.floor(Math.random() * 255), b: Math.floor(Math.random() * 255) } } }).png().toBuffer();

test.describe('SPEC-018 aset & lisensi', () => {
  test.afterAll(async () => {
    await q(`DELETE FROM content_assets WHERE title LIKE 'E2E %'`);
    await q(`DELETE FROM content_sources WHERE code LIKE 'E2E_%'`);
  });

  test('@mobile E2E: admin unggah slide (belum diverifikasi), verifikasi Milik Sendiri; tanpa scroll horizontal', async ({ page, context }) => {
    await newAdmin(context);
    await page.goto('/admin/konten/aset');
    await expect(page.getByRole('heading', { name: 'Aset Konten' })).toBeVisible();
    await page.getByRole('button', { name: 'Unggah Aset' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Jenis aset').click().catch(() => undefined);
    await page.getByRole('option', { name: 'Gambar slide' }).click().catch(() => undefined);
    await sheet.getByLabel('Judul').fill('E2E slide uji');
    await sheet.getByLabel('Sumber (hanya yang boleh disimpan salinannya)').click();
    await page.getByRole('option', { name: /Konten orisinal pemilik|OWN/ }).first().click();
    await sheet.locator('input[type=file]').setInputFiles({ name: 'slide.png', mimeType: 'image/png', buffer: await uniquePng() });
    await sheet.getByRole('button', { name: 'Unggah', exact: true }).click();
    await expect(page.getByText('Aset diunggah. Status: belum diverifikasi.')).toBeVisible();
    const row = await q1<{ rights_status: string; id: string }>(`SELECT id, rights_status FROM content_assets WHERE title='E2E slide uji'`);
    expect(row.rights_status).toBe('UNVERIFIED');
    await expectNoHorizontalScroll(page);
    // verifikasi lewat detail
    await page.getByText('E2E slide uji').filter({ visible: true }).first().click();
    const detail = page.getByRole('dialog');
    await detail.getByRole('combobox', { name: 'Status hak' }).click();
    await page.getByRole('option', { name: 'Milik sendiri' }).click();
    await detail.getByRole('button', { name: 'Simpan status' }).click();
    await page.getByRole('dialog').filter({ hasText: 'Ubah status hak?' }).getByRole('button', { name: 'Ya, simpan' }).click();
    await expect.poll(async () => (await q1<{ rights_status: string }>(`SELECT rights_status FROM content_assets WHERE id=$1`, [row.id])).rights_status).toBe('OWN_ORIGINAL');
  });

  test('sumber baru CC BY-NC menampilkan peringatan dan tersimpan; ringkasan lisensi tersedia', async ({ page, context }) => {
    await newAdmin(context);
    await page.goto('/admin/konten/sumber');
    await page.getByRole('button', { name: 'Tambah Sumber' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Kode sumber').fill('E2E_NC');
    await sheet.getByLabel('Nama sumber').fill('E2E sumber NC');
    await sheet.getByLabel('Jenis lisensi').click();
    await page.getByRole('option', { name: 'CC BY-NC' }).click();
    await expect(sheet.getByText('Sumber CC BY-NC hanya untuk penggunaan non-komersial.')).toBeVisible();
    await sheet.getByRole('button', { name: 'Simpan sumber' }).click();
    await expect(page.getByText('Sumber ditambahkan.')).toBeVisible();
    const s = await api(context, 'GET', '/api/v1/admin/license-summary');
    expect(s.status).toBe(200);
  });

  test('unggah berkas palsu (bukan gambar sebenarnya) ditolak server; non-admin 403; aset hanya terunduh lewat sesi', async ({ context, request }) => {
    await newAdmin(context);
    const form = new FormData();
    form.append('kind', 'SLIDE_IMAGE');
    form.append('title', 'E2E palsu');
    const src = await q1<{ id: string }>(`SELECT id FROM content_sources WHERE code='OWN'`);
    form.append('source_id', src.id);
    form.append('file', new Blob([Buffer.from('MZ-ini-bukan-png')], { type: 'image/png' }), 'palsu.png');
    const res = await context.request.post('/api/v1/admin/assets', { headers: { origin: 'http://127.0.0.1:3000' }, multipart: { kind: 'SLIDE_IMAGE', title: 'E2E palsu', source_id: src.id, file: { name: 'palsu.png', mimeType: 'image/png', buffer: Buffer.from('MZ-ini-bukan-png') } } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    void form;
    const lrn = await context.browser()!.newContext();
    await newLearner(lrn);
    expect((await api(lrn, 'GET', '/api/v1/admin/assets')).status).toBe(403);
    await lrn.close();
    const asset = await q1<{ id: string }>(`SELECT id FROM content_assets WHERE storage_backend='FILESYSTEM' LIMIT 1`);
    expect((await request.get(`/api/v1/assets/${asset.id}/file`)).status()).toBeGreaterThanOrEqual(401);
  });
});
