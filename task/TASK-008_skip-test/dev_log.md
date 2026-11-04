# Dev Log TASK-008: Skip Test Modul dan Tier

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W3)

Spec: `specifications/008_spec_skip_test.md` (UI/UX + klien API). Ambang, cooldown, batas harian, dan penerapan hasil adalah milik server; klien hanya menampilkan.

### Yang dibangun
- **Kontrak (baru, hanya ditambah)**: `src/contracts/exams.ts` (`ExamIntroSchema`, `SkipResultSchema`). `AttemptResultSchema.skip` dari W2 tetap `unknown`; hasil Skip diurai klien lewat `SkipResultSchema.safeParse` (tidak mengubah skema attempts).
- **Klien API**: `src/lib/api/exams.ts` (`GET /exams/{set}/intro`); mulai/jawab/submit/hasil memakai `attemptsApi` W2.
- **Rute** (grup `src/app/(exam)/`, hanya `AuthGate`, tanpa navigasi global): `/ujian/mulai/[assessment_set_id]` (`ExamIntro`), `/ujian/[attempt_id]` (`ExamRunner`), `/ujian/[attempt_id]/hasil` (`ExamResult`).
- **ExamIntro** (`components/exam/exam-intro.tsx`): banner ambang (ikon Info), aturan dari server, "12 soal - 15 menit", checklist audio/mikrofon bila dibutuhkan, "Percobaan 24 jam terakhir: n dari max", tombol "Mulai Ujian" / "Lanjutkan Ujian" (bila `active_attempt_id`, tanpa POST). `available=false`: tombol disabled + alasan ("Coba lagi pukul HH:mm WIB", "Batas percobaan hari ini tercapai", "Level ini sudah dimulai") + tautan Kembali ke Peta. 429 `COOLDOWN_ACTIVE`/`DAILY_ATTEMPT_LIMIT` dan 409 `SKIP_NOT_AVAILABLE` saat mulai = Dialog informatif (bukan Toast); galat lain = Toast "Gagal memulai ujian. Coba lagi." Jam dari `details[0].message` (ISO) diformat WIB.
- **ExamRunner/ExamSession**: memakai `ExamShell` dan `QuestionNavigatorGrid` W2. Timer dihitung dari `deadline_at` dengan selisih `server_now` dikoreksi sekali saat dimuat; saat 0 mengirim submit otomatis sekali; `ATTEMPT_EXPIRED`/`ATTEMPT_NOT_ACTIVE` berakhir di hasil. Jawaban disimpan otomatis (debounce 400 ms, juga saat pindah soal dan sebelum submit) hanya dengan `{response}`; tidak ada umpan balik/kunci; jawaban boleh diganti; tanda soal (lokal), navigator dalam `<details>`; fokus ke kepala soal saat pindah; kegagalan simpan = Toast tetap dengan "Coba lagi". Attempt non-`IN_PROGRESS` dialihkan ke hasil; 404 = "Ujian tidak ditemukan".
- **ExamResult**: skor besar, garis ambang, status Lulus/Belum lulus (ikon+teks). Skip lulus: "Level dilewati", "{n} sub-modul ditandai Dilewati", daftar Terbuka, "Buka Peta Belajar". Skip gagal: "Belum lulus", "Tidak ada penalti...", "Coba lagi setelah HH:mm WIB", sisa percobaan, "Mulai Belajar dari Awal Modul" (ke sub-modul AVAILABLE pertama target dari `GET /curriculum/tree`; fallback `/peta`), `per_skill`. Hanya Benar/Salah per soal (tanpa jawaban benar/pembahasan). Bila `band_score` ada, `BandBadge` + `EstimasiNotice`.
- **Peta**: `components/skill-tree/skip-test-button.tsx` menggantikan tautan "Uji Kompetensi" di tier, modul, dan popover node terkunci; Dialog konfirmasi (ujian berwaktu, ambang dari `skip_test.threshold_percent`) lalu "Lanjut ke Halaman Ujian". Uji peta yang lama disesuaikan.

### Keputusan dan asumsi
1. "Mulai Ujian" langsung memanggil POST /attempts (layar intro adalah konfirmasinya); konfirmasi tambahan hanya pada tombol di peta.
2. Ambang pada hasil dan intro dari server; klien tidak menghitung lulus/gagal.
3. Sub-modul awal untuk tombol "Mulai Belajar dari Awal Modul" diturunkan dari pohon karena `skip` tidak membawa kode sub-modul.
4. Tidak ada tampilan hasil khusus Boss/Placement (SPEC-014/015); `ExamResultView` generik menampilkan skor/band.

### Verifikasi (dijalankan di `codes/`, 2026-11-03)
`npx tsc --noEmit` bersih; `npx eslint src tests --max-warnings=0` bersih (peringatan `eslint .` yang tersisa hanya di `codes/content/golden-sample/src/build.mjs`, milik Backend/konten); `npx vitest run`: 34 berkas, 442 tes lulus. Tes khusus: `components/exam/exam.test.tsx` (19) + penyesuaian `skill-tree.test.tsx`.
Belum diverifikasi: integrasi dengan backend nyata, E2E Playwright (lulus/gagal/cooldown), tampilan visual terang/gelap dan 375px, pembaca layar, `beforeunload` di peramban nyata.


---

## [BACKEND] 2026-11-03 12:30 (Backend Engineer, wave W3)

**Spec:** 008 | **Status:** Completed (sisi server)

### Implementasi
- `src/server/exams/skip.ts`: handler `SKIP_MODULE_TEST`/`SKIP_TIER_TEST` (`start`, `intro`, `onFinish`) didaftarkan di `assessmentTypeHandlers` (`attempts/handlers.ts`), sehingga `ASSESSMENT_TYPE_NOT_ENABLED` terbuka untuk dua tipe ini. D5 berurutan: set PUBLISHED + entitas AVAILABLE (404) -> attempt aktif (resume, dilewati sebelum handler) -> D1 `SKIP_NOT_AVAILABLE` -> cooldown -> batas harian -> attempt `EXAM`, `deadline_at = started_at + time_limit_seconds`.
- `src/server/exams/gate.ts`: cooldown (`submitted_at` attempt selesai terbaru + `attempt.cooldown_minutes`, 0 = nonaktif) dan batas harian (`attempt.max_per_set_per_day`, attempt non-ABANDONED dalam 24 jam, jam server dari `clock.ts`), Retry-After (detik, dibulatkan ke atas), `details[0] = {path: next_allowed_at, code: cooldown_active, message: ISO}`, pesan WIB dari `APP_TIMEZONE`.
- `src/server/exams/service.ts` + `GET /api/v1/exams/{assessment_set_id}/intro` (handler tipe menyediakan `intro`; tipe tanpa `intro` -> 404). Kontrak Zod `src/contracts/exams.ts` dibuat Frontend, dipakai apa adanya.
- `onFinish`: panggil `GatekeepingService.applySkipResult` (lulus = `result.passed` tepat dari mesin attempt, bilangan bulat; 85.00 lulus, 84.99 gagal), isi `result_json.skip` (`skipped_sub_module_count` dari selisih sub-modul SKIPPED, `unlocked` = entitas yang kini UNLOCKED, `retry.next_allowed_at` = submit + cooldown bila gagal, `attempts_remaining_today`), audit `SKIP_TEST_PASSED`/`SKIP_TEST_FAILED` (`entity_id` = attempt id).
- `attempts/service.ts`: `settleExpiredForSet` (transaksi tersendiri) dipanggil sebelum `startAttempt` dan intro agar attempt EXAM kedaluwarsa dinilai dan efeknya ter-commit walau permintaan baru ditolak (cooldown/SKIP_NOT_AVAILABLE).
- Error baru di `http/errors.ts`: `SKIP_NOT_AVAILABLE` 409, `COOLDOWN_ACTIVE` 429, `DAILY_ATTEMPT_LIMIT` 429.

### Keputusan / catatan
1. Review hasil EXAM memuat `is_correct` per soal (benar/salah) tetapi tanpa `correct_answer`/`explanation_id`; selama ujian PUT/GET tanpa `is_correct`.
2. Bila saat submit target ternyata sudah dimulai (pengguna membuka sub-modul lain selama ujian), GatekeepingService monoton: hanya sub-modul LOCKED/UNLOCKED yang dilewati; D1 tidak divalidasi ulang saat finish.
3. `finalize` memanggil `runActivityHooks(kind='DRILL_SUBMIT', subModuleId=null)` juga untuk EXAM; SPEC-016 perlu menangani `subModuleId=null`.
4. Retry-After batas harian dihitung dari kapan attempt tertua yang relevan keluar dari jendela 24 jam.
5. Handler EXAM generik di `attempts.itest.ts` menimpa handler Skip nyata dan memulihkannya di `afterEach`; tes "tipe tanpa handler" memakai `PLACEMENT_TEST`.
6. Amandemen QA W2 (dikerjakan di wave ini): F-06-01 seed pengacakan CSPRNG di `attempts.state.rng_seed` (`prng.ts`: `newRngSeed`, `seededCsprng`); F-06-02 `GET /attempts/{id}` bebas efek samping dan resume (`POST /attempts`) menggeser `last_resume_at` hanya bila jeda > 60 detik (`rebaseResume`); F-05-01 `learnDelta = min(klaim, 30, elapsed)`. Spec 005/006 diamandemen + Revision History.
7. Regex kode sub-modul: `contracts/content.ts` (`[1-4]`, paket konten) sengaja berbeda dari param rute `server/player/schemas.ts` (`\d`, agar `9.9.9` -> 404); dibiarkan. `safeHref` klien adalah domain Frontend (hanya dicatat).

### Verifikasi (codes/, 2026-11-03, Postgres 16 lokal port 55432)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus (0 galat) |
| `npx eslint src tests scripts --max-warnings=0` | lulus |
| `npx vitest run` | 34 berkas, 446 tes lulus (baru: `skip-exam.test.ts`, `band.test.ts`) |
| `npm run test:integration` | 11 berkas, 231 tes lulus (baru: `skip.itest.ts`, `band.itest.ts`, `qa-w2-fixes.itest.ts`) |
Tidak diverifikasi: E2E Playwright, `next build`/`next dev` (sengaja tidak dijalankan), integrasi FE-BE nyata, uji beban.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 12:30 | Backend W3: handler Skip, intro ujian, cooldown/limit, amandemen QA W2 |


---

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W4) - Penyesuaian QA W3 (F-08-01, F-08-04, F-08-09; ADR-003 #27)

- **F-08-01**: `ExamResultView` (`components/exam/exam-result.tsx`) tidak lagi menampilkan benar/salah per soal; hanya skor agregat, ambang, lulus/gagal, rincian per skill, band bila ada. `review` dari server diabaikan. `AttemptResultSchema.review[].is_correct` dibuat `nullable().optional()` (hanya melonggarkan; Backend akan menghapus field itu di mode EXAM) dan `drill-result` memakai `== null` sehingga PRACTICE tetap menampilkan hasil per soal.
- **F-08-04**: `formatScorePercent` (`lib/format.ts`) memotong (bukan membulatkan) ke 2 desimal: 84,996 tampil `84,99%`. Lulus/gagal tetap dari server (`passed`), tidak dihitung ulang di klien.
- **F-08-09** (`components/exam/exam-runner.tsx`): (a) pengiriman otomatis saat waktu habis dicoba lagi tiap 3 detik bila gagal; (b) `flushPending` kini mengembalikan `ok|failed|ended`, soal yang gagal disimpan dilacak dan dicoba ulang, dan ujian TIDAK dikirim bila ada jawaban yang belum tersimpan (toast tetap + coba lagi); (c) peringatan `beforeunload` selama sesi berjalan (dilepas setelah submit/akhir).
- Tes (`exam/exam.test.tsx`): tanpa benar/salah per soal, toleran tanpa `review`, 84,996 -> 84,99%, retry auto-submit, tidak submit saat simpan gagal, beforeunload. Seluruh `vitest run` 35 berkas / 512 tes lulus.


---

## [BACKEND] 2026-11-03 12:40 (Backend Engineer, wave W4) - Verifikasi perbaikan QA W3 (TASK-008)

| ID | Status | Bukti |
|---|---|---|
| F-08-01 | TERTUTUP (sudah ada, diverifikasi) | `HIDE_REVIEW_TYPES` di `attempts/dto.ts` (SKIP_MODULE_TEST, SKIP_TIER_TEST, TIER_BOSS_EXAM, BOSS_SECTION, PLACEMENT_TEST): `review: null` pada mode EXAM; PRACTICE tetap memuat review. Tes `skip.itest.ts` dan `attempts.itest.ts`. |
| F-08-02 | TERTUTUP (sudah ada) | `skip.ts` `onFinish`: D1 divalidasi ulang; tidak eligible -> hasil dicatat tanpa efek progres, audit `effect_skipped`. Tes `skip.itest.ts` "F-08-02". |
| F-08-04 | TERTUTUP (sudah ada) | `displayPercentHundredths`: 84,996 tampil 84,99 saat belum lulus; `skip_best_percent` memakai persen tampilan. Tes `skip.itest.ts` 84.99% dan unit `attempts-engine.test.ts`. |
| F-08-07 | DITUTUP (baru) | `skip.itest.ts`: tiga `POST /attempts` serentak -> tepat satu attempt, id sama; start serentak di ambang batas harian -> 3x 429 `DAILY_ATTEMPT_LIMIT`, tetap 3 attempt. |
| F-08-05 | TIDAK DIKERJAKAN | Rate limit khusus intro (LOW); bucket `general_user` global tetap berlaku. Catat sebagai hardening. |

Verifikasi: lihat dev_log TASK-018 (tsc, eslint, vitest 520, integration 280 lulus).

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 12:40 | Backend W4: verifikasi perbaikan QA W3, tes start serentak |
