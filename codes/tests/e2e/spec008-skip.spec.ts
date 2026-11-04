/** SPEC-008 Skip Test modul. */
import { expect, test } from './support/fixtures';
import { api, expectNoHorizontalScroll, newLearner } from './support/app';
import { q, q1, setId } from './support/db';
import { answerAllAndSubmit } from './support/quiz';

test.describe('SPEC-008 skip test', () => {
  test.afterEach(async () => {
    await q(`UPDATE app_settings SET value='60'::jsonb WHERE key='attempt.cooldown_minutes'`);
  });

  test('@mobile E2E: lulus Skip Test Modul 1.2 -> sub-modul Dilewati dan modul berikutnya terbuka', async ({ page, context }) => {
    const u = await newLearner(context);
    await page.goto('/peta');
    await page.getByRole('button', { name: 'Uji Kompetensi' }).first().click();
    await expect(page.getByRole('dialog')).toContainText('Ikut Uji Kompetensi?');
    await page.getByRole('dialog').getByRole('link', { name: 'Lanjut ke Halaman Ujian' }).or(page.getByRole('dialog').getByRole('button', { name: 'Lanjut ke Halaman Ujian' })).click();
    await expect(page).toHaveURL(/\/ujian\/mulai\//);
    await expect(page.getByText('6 soal - 2 menit')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Mulai Ujian' }).click();
    await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/);
    await answerAllAndSubmit(page, 6);
    await expect(page).toHaveURL(/\/hasil$/);
    await expect(page.getByText('Level dilewati')).toBeVisible();
    const st = await q<{ status: string; code: string }>(
      `SELECT p.status, s.sub_module_code code FROM user_sub_module_progress p JOIN sub_modules s ON s.id=p.sub_module_id WHERE p.user_id=$1 AND s.sub_module_code IN ('1.2.1','1.3.1')`,
      [u.id],
    );
    expect(st.find((r) => r.code === '1.2.1')?.status).toBe('SKIPPED');
    await page.goto('/peta');
    await expect(page.getByText('Dilewati').first()).toBeVisible();
    // modul berikutnya (1.3) terbuka
    expect(st.find((r) => r.code === '1.3.1')?.status).toBe('UNLOCKED');
  });

  test('gagal: tanpa penalti, cooldown berlaku pada percobaan ulang (POST /attempts 429/409 terstruktur)', async ({ context }) => {
    await newLearner(context);
    const id = await setId('Skip Test Modul 1.2');
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: id });
    expect(a.status).toBe(201);
    expect(a.json.data.mode).toBe('EXAM');
    expect(a.json.data.deadline_at).not.toBeNull();
    const sub = await api(context, 'POST', `/api/v1/attempts/${a.json.data.id}/submit`);
    expect(sub.status).toBe(200);
    expect(sub.json.data.attempt.passed).toBe(false);
    const again = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: id });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(again.json)).toMatch(/COOLDOWN/);
  });

  test('mode ujian: kunci tidak bocor di payload attempt dan review hasil', async ({ context }) => {
    await newLearner(context);
    const id = await setId('Skip Test Modul 1.2');
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: id });
    expect(JSON.stringify(a.json)).not.toContain('correct_answers');
    const sub = await api(context, 'POST', `/api/v1/attempts/${a.json.data.id}/submit`);
    expect(JSON.stringify(sub.json)).not.toContain('explanation_id');
    expect(JSON.stringify(sub.json)).not.toContain('correct_answer');
  });

  test('Skip Test tidak tersedia bila modul sudah dimulai (409/SKIP_NOT_AVAILABLE)', async ({ context }) => {
    const u = await newLearner(context);
    await api(context, 'GET', '/api/v1/curriculum/tree');
    await q(`UPDATE user_sub_module_progress SET status='IN_PROGRESS' WHERE user_id=$1 AND sub_module_id=(SELECT id FROM sub_modules WHERE sub_module_code='1.2.1')`, [u.id]);
    const id = await setId('Skip Test Modul 1.2');
    const a = await api(context, 'POST', '/api/v1/attempts', { assessment_set_id: id });
    expect(a.status).toBeGreaterThanOrEqual(400);
    const st = await q1<{ status: string }>(`SELECT status FROM user_sub_module_progress WHERE user_id=$1 AND sub_module_id=(SELECT id FROM sub_modules WHERE sub_module_code='1.2.1')`, [u.id]);
    expect(st.status).toBe('IN_PROGRESS');
  });
});
