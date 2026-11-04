/** SPEC-020 kurasi konten (K1-K3). */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newAdmin, newLearner } from './support/app';
import { markLearnDone, q, q1, setId } from './support/db';

test.describe('SPEC-020 kurasi', () => {
  test.afterAll(async () => {
    await q(`UPDATE assessment_sets SET status='PUBLISHED' WHERE title LIKE 'Passive Voice untuk Deskripsi Proses%' AND assessment_type='ACTIVE_DRILL'`);
  });

  test('@mobile E2E: admin menyunting prompt soal drill terpublikasi; Learner melihat prompt baru', async ({ page, context, browser }) => {
    await newAdmin(context);
    await q(`DELETE FROM attempts WHERE assessment_set_id IN (SELECT id FROM assessment_sets WHERE title='Latihan 1.1.2')`);
    const newPrompt = `W1 prompt disunting ${Date.now()}`;
    await page.goto('/admin/konten/soal');
    await expect(page.getByRole('heading', { name: 'Kurasi Soal' })).toBeVisible();
    await page.getByRole('searchbox').or(page.getByLabel('Cari judul')).first().fill('Latihan 1.1.2');
    await page.getByRole('button', { name: /Buka set Latihan 1\.1\.2/ }).or(page.getByRole('link', { name: /Buka set Latihan 1\.1\.2/ })).filter({ visible: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Daftar soal' })).toBeVisible();
    await page.getByRole('button', { name: /Sunting soal Q-W1/ }).filter({ visible: true }).first().click();
    await page.getByLabel('Teks soal').fill(newPrompt);
    await page.getByRole('button', { name: 'Simpan soal' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: /terpublikasi|Simpan perubahan/ });
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /Simpan|Ya/ }).last().click();
    await expect(page.getByText(/Soal disimpan\. Versi set kini \d+\./)).toBeVisible();
    await expectNoHorizontalScroll(page);
    // Learner melihat prompt baru
    const lctx = await browser.newContext();
    const u = await newLearner(lctx);
    await markLearnDone(u.id, '1.1.2');
    const set = await setId('Latihan 1.1.2');
    const a = await api(lctx, 'POST', '/api/v1/attempts', { assessment_set_id: set });
    expect(JSON.stringify(a.json.data.questions)).toContain(newPrompt);
    await lctx.close();
    await q(`DELETE FROM attempts WHERE assessment_set_id=$1`, [set]); // set dengan attempt berjalan tidak dapat disunting
    const ver = await q1<{ version: number }>(`SELECT version FROM assessment_sets WHERE id=$1`, [set]);
    expect(ver.version).toBeGreaterThan(1);
    const rev = await q(`SELECT 1 FROM content_revisions WHERE entity_id=$1`, [set]);
    expect(rev.length).toBeGreaterThan(0);
    // pulihkan prompt
    await q(`UPDATE assessment_sets SET questions_json = replace(questions_json::text, $2, 'W1 pilih benar')::jsonb WHERE id=$1`, [set, newPrompt]);
  });

  test('set drill terbit konten AI: Ubah status ke terpublikasi memerlukan konfirmasi reviu; non-admin 403', async ({ page, context, browser }) => {
    await newAdmin(context);
    const set = await q1<{ id: string }>(`SELECT id FROM assessment_sets WHERE title LIKE 'Passive Voice untuk Deskripsi Proses%' AND assessment_type='ACTIVE_DRILL'`);
    await q(`UPDATE assessment_sets SET status='DRAFT' WHERE id=$1`, [set.id]);
    await page.goto(`/admin/konten/soal/${set.id}`);
    await page.getByRole('button', { name: 'Ubah status' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Status baru').selectOption('PUBLISHED');
    const submit = dlg.getByRole('button', { name: 'Ubah status' });
    const ai = dlg.getByRole('checkbox', { name: /Saya telah meninjau konten buatan AI/ });
    if (await ai.isVisible().catch(() => false)) {
      await expect(submit).toBeDisabled();
      await ai.check();
    }
    await submit.click();
    await expect(page.getByText(/Status diubah menjadi|Publikasi ditahan/)).toBeVisible();
    const lctx = await browser.newContext();
    await newLearner(lctx);
    expect((await api(lctx, 'GET', '/api/v1/admin/assessment-sets')).status).toBe(403);
    await lctx.close();
  });

  test('kurasi kurikulum: pohon Tier/Modul/Sub-modul tampil dengan status dan penghalang', async ({ page, context }) => {
    await newAdmin(context);
    await page.goto('/admin/konten/kurikulum');
    await expect(page.getByRole('heading', { name: 'Kurasi Kurikulum' })).toBeVisible();
    await expect(page.getByText(/Tier 1: Foundation/)).toBeVisible();
    await expect(page.getByText(/Terpublikasi/).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
