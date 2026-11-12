import { expect, test, type Page } from '@playwright/test';
import {
  ARTICLE_121,
  MISTAKE_LABEL,
  SUB_TITLES,
  TIPS_LABEL,
  VIDEO,
  VIDEO_ID,
  apiGet,
  apiPost,
  breakYouTube,
  createCoreProfile,
  deleteCoreProfile,
  ensureCoreContent,
  warmUpRoutes,
  learnFast,
  noHorizontalOverflow,
  setLearnMin,
  shot,
  stubYouTube,
  type CoreProfile,
  unlockCode,
} from './helpers/core';

// SPEC-005 Pemutar Materi Multimodal (domain Inti Belajar). Sub-modul uji 1.4.1: artikel + callout + tabel lebar,
// 1 video (YouTube di-stub), 3 slide, 1 lampiran PDF, Mini-Task SELF_CHECK, drill 4 soal. 1.4.2: artikel saja.
test.describe.configure({ timeout: 75_000 });
let journey: CoreProfile; // tes 60 detik nyata
let reader: CoreProfile; // tes baca/aset/video (tanpa menyelesaikan)
let applier: CoreProfile; // Mini-Task dan gerbang drill

test.beforeAll(async () => {
  test.setTimeout(300_000);
  ensureCoreContent();
  await warmUpRoutes();
  journey = await createCoreProfile('plr-j');
  reader = await createCoreProfile('plr-r');
  applier = await createCoreProfile('plr-a');
});
test.afterAll(() => {
  test.setTimeout(300_000);
  setLearnMin(60);
  for (const p of [journey, reader, applier]) deleteCoreProfile(p);
});

interface Detail {
  data: {
    sub_module: { id: string };
    material: { videos: Array<{ video_id: string }>; slides: Array<{ url: string }>; attachments: Array<{ url: string; size_bytes: number }> };
    progress: Record<string, unknown>;
    drill: { can_start: boolean; blocked_reason: string | null; assessment_set_id: string };
    navigation: { prev_sub_module_code: string | null; next_sub_module_code: string | null };
  };
}

const completeBtn = (page: Page) => page.getByRole('button', { name: 'Selesai Belajar' });

test('alur belajar nyata (ambang bawaan 60 detik): artikel, video, slide, Selesai Belajar aktif, pindah ke Latihan', async ({ page, context }) => {
  test.setTimeout(240_000);
  setLearnMin(60);
  await context.addCookies(journey.cookies);
  await stubYouTube(page);
  await page.goto('/belajar/1.4.1');
  const tLoad = Date.now();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(SUB_TITLES['1.4.1']!);
  await expect(page.getByText(/Tier 1 > Survival Vocabulary & Pronunciation · 1\.2\.1/)).toBeVisible();
  // Server menandai sub-modul dimulai (UNLOCKED -> IN_PROGRESS) saat halaman dibuka.
  await expect.poll(async () => ((await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.1')).body.data.progress as { status: string }).status).toBe('IN_PROGRESS');

  // Sub-tab hanya yang berisi: Artikel, Video, Slide.
  const subtabs = page.getByRole('tablist', { name: 'Jenis materi' });
  await expect(subtabs.getByRole('tab')).toHaveText(['Artikel', 'Video', 'Slide']);
  // "Selesai Belajar" belum bisa (aria-disabled) dan petunjuk menyebut syaratnya; klik tidak berpindah tab.
  await expect(completeBtn(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('Belajar aktif minimal 60 detik.')).toBeVisible();
  await expect(page.getByText('Buka tab Video terlebih dahulu.')).toBeVisible();
  await expect(page.getByText('Buka tab Slide terlebih dahulu.')).toBeVisible();
  await completeBtn(page).click({ force: true }); // aria-disabled: klik tidak berefek
  await expect(page.getByRole('tab', { name: /^Pelajari/ })).toHaveAttribute('aria-selected', 'true');

  // Setiap sub-tab perlu dwell >= beberapa detik agar detik aktifnya terkirim (flush) dan sub-tab tercatat dikunjungi.
  await subtabs.getByRole('tab', { name: 'Video' }).click();
  await expect(page.getByText('Bagian 00:10–03:20')).toBeVisible();
  await page.waitForTimeout(3_000);
  await subtabs.getByRole('tab', { name: 'Slide' }).click();
  await expect(page.getByRole('region', { name: 'Slide materi' })).toBeVisible();
  await page.waitForTimeout(3_000);
  await subtabs.getByRole('tab', { name: 'Artikel' }).click();
  await expect(page.getByText('Buka tab Video terlebih dahulu.')).toHaveCount(0);
  await expect(page.getByText('Buka tab Slide terlebih dahulu.')).toHaveCount(0);

  // Waktu aktif: klien menghitung detik hanya saat ada interaksi <= 60 detik; server memotong dengan jam nyata
  // (ping pertama maks 5 detik, berikutnya <= selisih waktu nyata). Tombol aktif hanya setelah >= 60 detik di server.
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);
  let disabledAt30 = false;
  for (let i = 0; i < 60 && (await completeBtn(page).getAttribute('aria-disabled')) === 'true'; i++) {
    if (!disabledAt30 && Date.now() - tLoad > 30_000) disabledAt30 = true;
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(2_500);
  }
  expect(disabledAt30, 'tombol tidak boleh aktif sebelum 30 detik waktu nyata').toBe(true);
  await expect(completeBtn(page)).not.toHaveAttribute('aria-disabled', 'true');
  const elapsed = (Date.now() - tLoad) / 1000;
  expect(elapsed, 'server wajib memotong detik klaim klien dengan jam nyata (ambang 60 detik)').toBeGreaterThanOrEqual(50);
  const prog = (await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.1')).body.data.progress as { learn_active_seconds: number; learn_ready: boolean; learn_visited_subtabs: string[] };
  expect(prog.learn_ready).toBe(true);
  expect(prog.learn_active_seconds).toBeGreaterThanOrEqual(60);
  expect([...prog.learn_visited_subtabs].sort()).toEqual(['ARTICLE', 'SLIDES', 'VIDEO']);

  await completeBtn(page).click();
  // Pindah otomatis ke tab Latihan; tombol Mulai Latihan aktif; tab Pelajari bercentang.
  await expect(page.getByRole('tab', { name: /^Latihan/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Mulai Latihan' })).toBeEnabled();
  await expect(page.getByRole('tab', { name: /^Pelajari/ })).toContainText('selesai');
  await expect(page.getByText('4 soal - 5 menit - lulus 75%')).toBeVisible();
  const m2 = await noHorizontalOverflow(page);
  expect(m2.sw).toBeLessThanOrEqual(m2.w);
  await shot(page, `player-after-learn-${test.info().project.name}`);
  // Idempoten: panggilan ulang learn-complete tetap 200 dengan waktu yang sama.
  const sid = (await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.1')).body.data.sub_module.id;
  const again = await apiPost<{ data: { learn_completed_at: string } }>(page, `/api/v1/sub-modules/${sid}/learn-complete`);
  expect(again.status).toBe(200);
  const again2 = await apiPost<{ data: { learn_completed_at: string } }>(page, `/api/v1/sub-modules/${sid}/learn-complete`);
  expect(again2.body.data.learn_completed_at).toBe(again.body.data.learn_completed_at);
});

test('artikel: callout berlabel, tabel mengisi lebar tanpa geser (wadah scroll cadangan), tautan luar aman, gambar Markdown dibuang, aset tidak bocor', async ({ page, context }) => {
  await context.addCookies(reader.cookies);
  await page.goto('/belajar/1.4.1');
  const article = page.locator('article');
  await expect(article.getByText(TIPS_LABEL, { exact: true })).toBeVisible();
  await expect(article.getByText('Baca soal dua kali sebelum menjawab.')).toBeVisible();
  await expect(article.getByText(MISTAKE_LABEL, { exact: true })).toBeVisible();
  // Heading memiliki id slug; daftar isi sticky di desktop.
  await expect(article.getByRole('heading', { name: 'Mengenal Kata Benda' })).toHaveAttribute('id', 'mengenal-kata-benda');
  // Tabel mengisi lebar artikel dan teks selnya membungkus, sehingga tidak perlu digeser pada layar lebar;
  // wadah scroll tetap ada (overflow-x auto) sebagai cadangan, dan halaman tidak melebar.
  const region = article.getByRole('region', { name: 'Tabel dapat digeser ke samping' });
  await expect(region).toBeVisible();
  const dims = await region.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, ox: getComputedStyle(el).overflowX }));
  expect(dims.sw).toBeLessThanOrEqual(dims.cw + 1);
  expect(dims.ox).toBe('auto');
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);
  // Tautan luar: target=_blank + rel aman; tidak ada <img> dari Markdown; tidak ada javascript:.
  const link = article.getByRole('link', { name: 'Situs contoh' });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(article.locator('img')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('script', { hasText: 'alert(1)' })).toHaveCount(0);

  // Payload tidak membocorkan kolom internal.
  const d = await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.1');
  const raw = JSON.stringify(d.body);
  for (const k of ['ai_rubric_criteria', 'storage_key', 'sha256', 'external_url']) expect(raw, k).not.toContain(`"${k}"`);
  expect(d.body.data.material.videos[0]!.video_id).toBe(VIDEO_ID);
  expect(ARTICLE_121.length).toBeGreaterThan(100);
});

test('aset: slide dan lampiran dilayani dengan header aman, ETag 304, lampiran sebagai unduhan; kind lain tidak dilayani', async ({ page, context }) => {
  await context.addCookies(reader.cookies);
  const d = (await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.1')).body.data;
  expect(d.material.slides).toHaveLength(3);
  const slide = await page.request.get(d.material.slides[0]!.url);
  expect(slide.status()).toBe(200);
  expect(slide.headers()['content-type']).toBe('image/webp');
  expect(slide.headers()['x-content-type-options']).toBe('nosniff');
  expect(slide.headers()['content-disposition'] ?? 'inline').toMatch(/^inline/);
  const etag = slide.headers()['etag'];
  expect(etag).toBeTruthy();
  const cached = await page.request.get(d.material.slides[0]!.url, { headers: { 'If-None-Match': etag! } });
  expect(cached.status()).toBe(304);
  const miss = await page.request.get(d.material.slides[0]!.url, { headers: { 'If-None-Match': '"bukan-etag"' } });
  expect(miss.status()).toBe(200);

  const att = await page.request.get(d.material.attachments[0]!.url);
  expect(att.status()).toBe(200);
  expect(att.headers()['content-type']).toBe('application/pdf');
  expect(att.headers()['content-disposition']).toMatch(/^attachment/);
  expect(att.headers()['x-content-type-options']).toBe('nosniff');

  // Aset yang tidak dikenal / bukan milik sub-modul terbuka mana pun: 404.
  expect((await page.request.get('/api/v1/assets/00000000-0000-4000-8000-000000000000/file')).status()).toBe(404);

  // UI: tombol unduh PDF memuat ukuran berkas.
  await page.goto('/belajar/1.4.1');
  const dl = page.getByRole('link', { name: /Unduh PDF \(.+\)/ });
  await expect(dl).toBeVisible();
  await expect(dl).toHaveAttribute('href', d.material.attachments[0]!.url);
});

test('video: URL embed hanya dari video_id valid (nocookie) dengan start/end/rel/playsinline/origin; label bagian; t di luar rentang kembali ke start', async ({ page, context }) => {
  await context.addCookies(reader.cookies);
  await stubYouTube(page);
  await page.goto('/belajar/1.4.1?tab=pelajari&sub=video');
  await expect(page.getByText('Bagian 00:10–03:20')).toBeVisible();
  await expect(page.getByText('Oleh Kanal Uji')).toBeVisible();
  await expect(page.locator('iframe[data-stub]')).toHaveAttribute('title', `Video: ${VIDEO.title}`);
  const opts = await page.evaluate(() => (window as unknown as { __yt: { players: Array<{ host: string; videoId: string; playerVars: Record<string, unknown> }> } }).__yt.players.at(-1));
  expect(opts).toMatchObject({ host: 'https://www.youtube-nocookie.com', videoId: VIDEO_ID });
  expect(opts!.playerVars).toMatchObject({ start: 10, end: 200, rel: 0, playsinline: 1, origin: new URL(page.url()).origin });
  // Tidak ada iframe ke host lain (stub tidak membuat iframe berhost).
  expect(await page.locator('iframe:not([data-stub])').count()).toBe(0);
  // Rasio 16:9 dicadangkan.
  const box = await page.locator('figure .aspect-video').boundingBox();
  expect(Math.abs(box!.width / box!.height - 16 / 9)).toBeLessThan(0.05);

  // Lanjut dari detik tersimpan (SPEC-007): t dalam rentang dipakai, t > end_sec kembali ke start_sec.
  await page.goto('/belajar/1.4.1?tab=pelajari&sub=video&t=50');
  await expect(page.locator('iframe[data-stub]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __yt: { players: Array<{ playerVars: { start: number } }> } }).__yt.players.at(-1)!.playerVars.start)).toBe(50);
  await page.goto('/belajar/1.4.1?tab=pelajari&sub=video&t=5000');
  await expect(page.locator('iframe[data-stub]')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __yt: { players: Array<{ playerVars: { start: number } }> } }).__yt.players.at(-1)!.playerVars.start)).toBe(10);
});

test('video gagal dimuat: pesan, tautan Buka di YouTube, Coba lagi; offline: Video butuh koneksi internet', async ({ page, context }) => {
  await context.addCookies(reader.cookies);
  await breakYouTube(page);
  await page.goto('/belajar/1.4.1?tab=pelajari&sub=video');
  await expect(page.getByText('Video tidak dapat dimuat')).toBeVisible();
  const open = page.getByRole('link', { name: 'Buka di YouTube' });
  await expect(open).toHaveAttribute('href', `https://www.youtube.com/watch?v=${VIDEO_ID}&t=10s`);
  await expect(open).toHaveAttribute('target', '_blank');
  await expect(open).toHaveAttribute('rel', /noopener/);
  await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeVisible();
  // Pemulihan: setelah jaringan pulih (stub), Coba lagi memuat pemutar.
  await page.unroute('https://www.youtube.com/iframe_api');
  await stubYouTube(page);
  await page.getByRole('button', { name: 'Coba lagi' }).click();
  await expect(page.locator('iframe[data-stub]')).toBeVisible();

  // Offline: setelah pemutar termuat (data sub-modul sudah ada), jaringan diputus.
  await page.goto('/belajar/1.4.1?tab=pelajari&sub=video');
  await expect(page.locator('iframe[data-stub]')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('Video butuh koneksi internet')).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Video butuh koneksi internet')).toBeHidden();
});

test('video PLAYING menghitung waktu aktif tanpa interaksi dan posisi dilaporkan; sub-tab Slide: carousel dapat dinavigasi (tombol + panah)', async ({ page, context }) => {
  await context.addCookies(reader.cookies);
  await stubYouTube(page);
  await page.goto('/belajar/1.4.1?tab=pelajari&sub=slide');
  const region = page.getByRole('region', { name: 'Slide materi' });
  await expect(region).toBeVisible();
  await expect(region).toHaveAttribute('aria-roledescription', 'carousel');
  await expect(region.getByText('1/3')).toBeVisible();
  await expect(region.getByText('Keterangan slide 1')).toBeVisible();
  const img = region.locator('img').first();
  await expect(img).toHaveAttribute('alt', 'Gambar slide 1');
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await region.getByRole('button', { name: 'Slide berikutnya' }).click();
  await expect(region.getByText('2/3')).toBeVisible();
  await region.focus();
  await page.keyboard.press('ArrowRight');
  await expect(region.getByText('3/3')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(region.getByText('2/3')).toBeVisible();
  const m = await noHorizontalOverflow(page);
  expect(m.sw).toBeLessThanOrEqual(m.w);
});

test('Mini-Task SELF_CHECK: ditandai selesai hanya setelah materi selesai; tanpa Mini-Task ada pesan', async ({ page, context }) => {
  setLearnMin(10);
  await context.addCookies(applier.cookies);
  await page.goto('/belajar/1.4.1?tab=terapkan');
  await expect(page.getByText('Tulis lima kata benda dari kamarmu di buku catatan.')).toBeVisible();
  await expect(page.getByText('Lima kata benda ditulis dengan benar.')).toBeVisible();
  const mark = page.getByRole('button', { name: 'Tandai Selesai' });
  await expect(mark).toBeDisabled();
  await expect(page.getByText('Selesaikan materi di tab Pelajari terlebih dahulu.')).toBeVisible();
  // API menolak sebelum materi selesai, dan tipe lain menolak.
  const d = (await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.1')).body.data;
  const early = await apiPost<{ error: { code: string } }>(page, `/api/v1/sub-modules/${d.sub_module.id}/mini-task/complete`);
  expect(early.status).toBe(409);
  expect(early.body.error.code).toBe('LEARN_NOT_COMPLETED');

  await learnFast(page, '1.4.1');
  await page.reload();
  await expect(mark).toBeEnabled();
  await mark.click();
  await expect(page.getByText('Mini-Task selesai.')).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Terapkan/ })).toContainText('selesai');
  const after = (await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.1')).body.data.progress as { mini_task_completed_at: string | null };
  expect(after.mini_task_completed_at).toBeTruthy();
  const second = await apiPost<{ data: { mini_task_completed_at: string } }>(page, `/api/v1/sub-modules/${d.sub_module.id}/mini-task/complete`);
  expect(second.status).toBe(200);
  expect(second.body.data.mini_task_completed_at).toBe(after.mini_task_completed_at);
});

test('Latihan terkunci sampai materi selesai (UI + API); learn-complete awal ditolak 409 dengan alasan; ping pertama dipotong 5 detik; subtab tak tersedia 400', async ({ page, context }) => {
  setLearnMin(10);
  const p = await createCoreProfile('plr-g');
  try {
    await context.addCookies(p.cookies);
    await page.goto('/belajar/1.4.1?tab=latihan');
    await expect(page.getByRole('button', { name: 'Mulai Latihan' })).toBeDisabled();
    await expect(page.getByText('Selesaikan materi terlebih dahulu.')).toBeVisible();
    await expect(page.getByText('4 soal - 5 menit - lulus 75%')).toBeVisible();
    const d = (await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.1')).body.data;
    expect(d.drill).toMatchObject({ can_start: false, blocked_reason: 'LEARN_NOT_COMPLETED' });
    const start = await apiPost<{ error: { code: string } }>(page, '/api/v1/attempts', { assessment_set_id: d.drill.assessment_set_id });
    expect(start.status).toBe(409);
    expect(start.body.error.code).toBe('LEARN_NOT_COMPLETED');

    // learn-complete sebelum syarat terpenuhi.
    const early = await apiPost<{ error: { code: string; details: Array<{ code: string; message: string }> } }>(page, `/api/v1/sub-modules/${d.sub_module.id}/learn-complete`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('LEARN_REQUIREMENTS_NOT_MET');
    expect(early.body.error.details.map((x) => x.code)).toContain('insufficient_active_time');
    expect(early.body.error.details.map((x) => x.code)).toContain('subtab_not_visited');
    // Ping pertama dengan klaim 30 detik hanya menambah 5; salvo ping cepat tidak menambah melebihi waktu nyata.
    const first = await apiPost<{ data: { learn_active_seconds: number } }>(page, `/api/v1/sub-modules/${d.sub_module.id}/learn-progress`, { subtab: 'ARTICLE', active_seconds: 30 });
    expect(first.body.data.learn_active_seconds).toBe(5);
    let last = 5;
    for (let i = 0; i < 6; i++) {
      const r = await apiPost<{ data: { learn_active_seconds: number } }>(page, `/api/v1/sub-modules/${d.sub_module.id}/learn-progress`, { subtab: 'ARTICLE', active_seconds: 30 });
      last = r.body.data.learn_active_seconds;
    }
    expect(last).toBeLessThanOrEqual(8);
    // Sub-modul tanpa video (1.4.2, dibuka lewat CLI): subtab VIDEO ditolak 400 subtab_unavailable.
    unlockCode(p, '1.4.2');
    const d2 = (await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.2')).body.data;
    const bad = await apiPost<{ error: { code: string; details: Array<{ code: string }> } }>(page, `/api/v1/sub-modules/${d2.sub_module.id}/learn-progress`, { subtab: 'VIDEO', active_seconds: 10 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.details[0]!.code).toBe('subtab_unavailable');
  } finally {
    deleteCoreProfile(p);
  }
});

test('navigasi Sebelumnya/Selanjutnya mengikuti rantai Tier', async ({ page, context }) => {
  await context.addCookies(applier.cookies);
  const a = (await apiGet<Detail>(page, '/api/v1/sub-modules/1.4.1')).body.data.navigation;
  expect(a).toEqual({ prev_sub_module_code: null, next_sub_module_code: '1.4.2' });
  await page.goto('/belajar/1.4.1');
  await expect(page.getByRole('link', { name: 'Selanjutnya' })).toHaveAttribute('href', '/belajar/1.4.2');
  await expect(page.getByRole('link', { name: 'Sebelumnya' })).toHaveCount(0);
  // Tombol kembali ke peta.
  await expect(page.getByRole('link', { name: 'Kembali ke peta belajar' })).toHaveAttribute('href', '/peta');
});
