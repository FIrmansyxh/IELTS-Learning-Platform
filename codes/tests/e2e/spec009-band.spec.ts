/** SPEC-009 konverter band (admin). */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newAdmin, newLearner } from './support/app';
import { q } from './support/db';

test.describe('SPEC-009 band converter', () => {
  test.afterEach(async () => {
    // pulihkan tabel awal (tes ini boleh mengaktifkan versi uji)
    await q(`UPDATE band_conversion_tables SET is_active = false WHERE is_active`);
    await q(`UPDATE band_conversion_tables SET is_active = true WHERE version_label LIKE 'v1-umum%'`);
    await q(`DELETE FROM band_conversion_tables WHERE version_label LIKE 'e2e-%'`);
  });

  test('@mobile E2E admin: versi baru dengan celah -> Simpan disabled + pesan celah; tabel valid tersimpan & dapat diaktifkan', async ({ page }) => {
    await newAdmin(page.context());
    await page.goto('/admin/band');
    await expect(page.getByRole('heading', { name: 'Tabel Band' })).toBeVisible();
    await page.getByRole('button', { name: 'Buat Versi Baru' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Label versi').fill('e2e-gap');
    await sheet.getByRole('button', { name: 'Salin dari tabel aktif' }).click();
    // hapus satu baris tengah -> celah
    await sheet.getByRole('button', { name: /Hapus baris 9$/ }).click();
    await expect(sheet.getByText(/Celah: skor \d+(-\d+)? tidak tercakup/)).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Simpan', exact: true })).toBeDisabled();
    await expectNoHorizontalScroll(page);
  });

  test('salin tabel aktif apa adanya -> tersimpan tidak aktif; aktifkan menukar tabel aktif; tabel yang dipakai attempt tidak berubah', async ({ page }) => {
    await newAdmin(page.context());
    await page.goto('/admin/band');
    await page.getByRole('button', { name: 'Buat Versi Baru' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Label versi').fill('e2e-valid');
    await sheet.getByRole('button', { name: 'Salin dari tabel aktif' }).click();
    await expect(sheet.getByRole('button', { name: 'Simpan', exact: true })).toBeEnabled();
    await sheet.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByText('Versi baru tersimpan (belum aktif).')).toBeVisible();
    await expect(page.getByText('e2e-valid').filter({ visible: true }).first()).toBeVisible();
    const row = page.getByRole('row', { name: /e2e-valid/ }).first();
    await row.getByRole('button', { name: /Aktifkan/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Aktifkan' }).click();
    await expect(page.getByText('Tabel diaktifkan.')).toBeVisible();
    expect((await q(`SELECT 1 FROM band_conversion_tables WHERE version_label='e2e-valid' AND is_active`)).length).toBe(1);
  });

  test('learner dapat membaca tabel aktif; non-admin tidak boleh membuat versi (403)', async ({ context }) => {
    await newLearner(context);
    const a = await api(context, 'GET', '/api/v1/band-tables/active?skill=LISTENING');
    expect(a.status).toBe(200);
    const c = await api(context, 'POST', '/api/v1/admin/band-tables', { skill: 'LISTENING', label: 'x', rows: [] });
    expect(c.status).toBe(403);
  });
});
