/** SPEC-019 bulk importer: unggah -> validasi (worker) -> pratinjau -> publikasi draf -> rollback. */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newAdmin, newLearner } from './support/app';
import { q, q1 } from './support/db';

async function template(context: import('@playwright/test').BrowserContext) {
  const r = await context.request.get('/api/v1/admin/import-templates/content-package');
  expect(r.status()).toBe(200);
  return Buffer.from(await r.body());
}

test.describe('SPEC-019 importer', () => {
  test('@mobile E2E: unggah templat JSON -> pratinjau -> simpan sebagai draf -> rollback; stepper aktif; tanpa scroll horizontal', async ({ page, context }) => {
    test.setTimeout(150_000);
    await newAdmin(context);
    const tpl = await template(context);
    await page.goto('/admin/impor');
    await page.getByRole('link', { name: 'Impor Baru' }).first().click();
    await expect(page.getByRole('navigation', { name: 'Langkah impor' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Langkah impor' }).getByText('(langkah saat ini)')).toBeVisible();
    await page.locator('input[type=file]').setInputFiles({ name: 'template.json', mimeType: 'application/json', buffer: tpl });
    await page.getByRole('button', { name: 'Unggah dan validasi' }).click();
    await expect(page.getByText('Hasil validasi')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Valid', { exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expectNoHorizontalScroll(page);
    const ack = page.getByRole('checkbox', { name: /Saya memahami peringatan/ });
    if (await ack.isVisible().catch(() => false)) await ack.check();
    await page.getByRole('button', { name: 'Lanjut ke pratinjau' }).click();
    await expect(page.getByText('Pratinjau perubahan')).toBeVisible();
    await expect(page.getByText(/dibuat, .* diperbarui, .* tanpa perubahan/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Lanjut ke publikasi' }).click();
    const aiRev = page.getByRole('checkbox', { name: /telah meninjau konten buatan AI/ });
    if (await aiRev.isVisible().catch(() => false)) await aiRev.check();
    await page.getByRole('radio', { name: /Simpan sebagai draf/ }).check().catch(() => undefined);
    await page.getByRole('button', { name: 'Publikasikan', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ya, terapkan' }).click();
    await expect(page.getByText('Impor selesai')).toBeVisible({ timeout: 90_000 });
    const batch = await q1<{ id: string; status: string }>(`SELECT id, status FROM import_batches ORDER BY created_at DESC LIMIT 1`);
    expect(batch.status).toBe('PUBLISHED');
    // rollback
    await page.getByRole('button', { name: 'Kembalikan (Rollback)' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Kembalikan', exact: true }).click();
    await expect(page.getByText('Impor dikembalikan.')).toBeVisible({ timeout: 60_000 });
    const after = await q1<{ status: string }>(`SELECT status FROM import_batches WHERE id=$1`, [batch.id]);
    expect(after.status).toBe('ROLLED_BACK');
  });

  test('berkas dengan error ditolak: laporan galat, tombol lanjut diblokir', async ({ page, context }) => {
    await newAdmin(context);
    await page.goto('/admin/impor/baru');
    const bad = Buffer.from(JSON.stringify({ contract_version: '1.1', sub_modules: [{ tier_number: 9, module_code: 'x' }] }));
    await page.locator('input[type=file]').setInputFiles({ name: 'rusak.json', mimeType: 'application/json', buffer: bad });
    await page.getByRole('button', { name: 'Unggah dan validasi' }).click();
    await expect(page.getByText('Hasil validasi').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Perbaiki error pada berkas lalu unggah ulang untuk melanjutkan.')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Lanjut ke pratinjau' })).toBeDisabled();
  });

  test('tipe berkas salah ditolak di klien; non-admin tidak punya akses API impor', async ({ page, context }) => {
    await newAdmin(context);
    await page.goto('/admin/impor/baru');
    await page.locator('input[type=file]').setInputFiles({ name: 'x.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
    await expect(page.getByText('Hanya berkas .json atau .csv yang diterima.')).toBeVisible();
    const learner = await page.context().browser()!.newContext();
    await newLearner(learner);
    const r = await api(learner, 'GET', '/api/v1/admin/import-batches');
    expect(r.status).toBe(403);
    await learner.close();
    void q;
  });
});
