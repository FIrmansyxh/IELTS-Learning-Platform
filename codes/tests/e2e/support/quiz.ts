import { expect, type Page } from '@playwright/test';

/** Menjawab satu soal Drill 1.1.1 (seed-world DRILL_111) lewat UI; `right=false` memilih jawaban salah. Kunci = awalan prompt "Dnn". */
export async function answerDrill111(page: Page, key: string, right: boolean) {
  const grp = (name: RegExp | string) => page.getByRole('main').getByRole('radiogroup', { name });
  switch (key) {
    case 'D01':
      await page.getByRole('radio', { name: new RegExp(right ? '^(A|B|C)?\\s*is$' : 'are') }).first().check();
      break;
    case 'D02':
      for (const t of right ? ['a', 'b'] : ['a', 'c']) await page.getByRole('checkbox', { name: new RegExp(`(^|\\s)${t}$`) }).check();
      break;
    case 'D03':
      await page.getByRole('radio', { name: right ? 'True' : 'False', exact: true }).check({ force: true });
      break;
    case 'D04':
      await page.getByRole('radio', { name: right ? 'Yes' : 'No', exact: true }).check({ force: true });
      break;
    case 'D05':
      await page.getByLabel('Jawaban Anda').fill(right ? 'was built' : 'is build');
      break;
    case 'D06':
      await page.getByLabel('Jawaban Anda').fill(right ? 'rainfall' : 'sunshine');
      break;
    case 'D07':
      await page.getByLabel('satu', { exact: true }).selectOption({ label: right ? 'x' : 'y' });
      await page.getByLabel('dua', { exact: true }).selectOption({ label: right ? 'z' : 'x' });
      break;
    case 'D08': {
      const toggle = page.getByRole('button', { name: 'Gunakan pilihan daftar' });
      if (await toggle.isVisible().catch(() => false)) await toggle.click();
      await page.getByLabel('uno', { exact: true }).selectOption({ label: right ? 'q' : 'p' });
      await page.getByLabel('dos', { exact: true }).selectOption({ label: right ? 'p' : 'q' });
      break;
    }
    case 'D09':
      await reorderTo(page, right ? ['The book', 'was written', 'by her'] : ['by her', 'was written', 'The book']);
      break;
    case 'D10':
      await page.getByRole('button', { name: right ? 'go' : 'school', exact: true }).click();
      break;
    default:
      throw new Error(`kunci tak dikenal ${key}`);
  }
  void grp;
}

/** Susun SENTENCE_REORDER dengan tombol Naik hingga urutan sesuai target. */
export async function reorderTo(page: Page, target: string[]) {
  const list = page.getByRole('list', { name: 'Urutan segmen kalimat' });
  const read = async () => (await list.locator('li').allInnerTexts()).map((t) => target.find((x) => t.includes(x)) ?? t);
  for (let i = 0; i < target.length; i++) {
    for (let guard = 0; guard < 6; guard++) {
      const now = await read();
      const at = now.indexOf(target[i]!);
      if (at <= i) break;
      await page.getByRole('button', { name: `Naikkan "${target[i]}"` }).click();
    }
  }
  expect(await read()).toEqual(target);
}

/** Klik Periksa lalu Lanjut/Lihat Hasil (mode Latihan). Mengembalikan teks umpan balik ("Benar!" / "Kurang tepat" / "Sebagian benar..."). */
export async function checkAndContinue(page: Page, last = false) {
  await page.getByRole('button', { name: 'Periksa', exact: true }).click();
  const fb = page.getByText(/^(Benar!|Kurang tepat|Sebagian benar)/).first();
  await expect(fb).toBeVisible();
  const text = (await fb.innerText()).trim();
  await page.getByRole('button', { name: last ? 'Lihat Hasil' : 'Lanjut', exact: true }).click();
  return text;
}

/** Buka halaman sub-modul, tab Latihan, mulai (materi harus sudah ditandai selesai). */
export async function startDrill(page: Page, code: string) {
  await page.goto(`/belajar/${code}`);
  await page.getByRole('tab', { name: /^Latihan/ }).click();
  await page.getByRole('button', { name: 'Mulai Latihan' }).click();
  await expect(page.getByText(/Soal \d+ dari \d+/).first()).toBeVisible();
}

/** Jawab soal MCQ set rightSet (opsi benar berteks `right-<qid>`), pada mode Ujian (tanpa "Periksa"). */
export async function examAnswerCurrent(page: Page, right = true) {
  const label = page.getByText(/^(right-|x$|y$|z$)/).first();
  await expect(label).toBeVisible();
  if (right) await page.getByRole('radio', { name: /right-/ }).check();
  else await page.getByRole('radio', { name: /^(?:[A-D]\s*)?x$/ }).check();
}

/** Mulai ujian dari halaman intro (/ujian/mulai/:id). */
export async function startExam(page: Page, setId: string) {
  await page.goto(`/ujian/mulai/${setId}`);
  await page.getByRole('button', { name: /Mulai Ujian|Lanjutkan Ujian/ }).click();
  await expect(page).toHaveURL(/\/ujian\/[0-9a-f-]{36}$/);
}

/** Jawab semua soal MCQ berurutan lalu Kirim dan konfirmasi. */
export async function answerAllAndSubmit(page: Page, total: number, rightFn: (n: number) => boolean = () => true) {
  for (let n = 1; n <= total; n++) {
    await expect(page.getByText(new RegExp(`Soal ${n} dari ${total}`)).first()).toBeVisible();
    await examAnswerCurrent(page, rightFn(n));
    if (n < total) await page.getByRole('button', { name: 'Soal berikutnya' }).click();
  }
  await page.getByRole('button', { name: /^(Akhiri|Kirim)$/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Ya, akhiri|Kirim/ }).click();
}

/** Menjalankan alur perekam Speaking (consent -> mic -> persiapan -> rekam -> berhenti) dengan fake media stream. Berhenti di layar Tinjau & Kirim. */
export async function driveRecorder(page: Page, recordMs = 4500) {
  const stop = page.getByRole('button', { name: 'Berhenti merekam' });
  let recordedAt = 0;
  for (let i = 0; i < 80; i++) {
    if (await stop.isVisible().catch(() => false)) {
      if (!(await page.getByText('Merekam', { exact: true }).first().isVisible().catch(() => false))) {
        await page.waitForTimeout(250); // hitung mundur sebelum rekaman dimulai
        continue;
      }
      if (!recordedAt) recordedAt = Date.now();
      if (Date.now() - recordedAt >= recordMs) break;
      await page.waitForTimeout(250); // durasi rekam nyata
      continue;
    }
    if (await page.getByText('Dengarkan rekaman Anda').isVisible().catch(() => false)) return;
    const consent = page.getByRole('checkbox', { name: 'Saya mengerti' });
    if (await consent.isVisible().catch(() => false)) {
      const ok = page.getByRole('button', { name: 'Setuju dan Lanjutkan' });
      try {
        await consent.check({ timeout: 3000 });
        await ok.click({ timeout: 3000 });
      } catch {
        /* dialog sedang menutup; ulangi di iterasi berikut */
      }
      continue;
    }
    let clicked = false;
    for (const name of ['Izinkan Mikrofon', 'Lanjut ke Persiapan', 'Mulai Rekam', 'Mulai merekam']) {
      const b = page.getByRole('button', { name, exact: true });
      if (await b.isVisible().catch(() => false)) {
        await b.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) await page.waitForTimeout(300);
  }
  await stop.click();
  await expect(page.getByText('Dengarkan rekaman Anda')).toBeVisible();
}
