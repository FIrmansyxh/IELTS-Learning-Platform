# Dev Log TASK-015 Placement Test

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W7)
Dikerjakan terhadap `specifications/015_spec_placement_test.md` dan `_api-contract.md` (FINAL). Backend paralel; integrasi nyata belum diuji.

### Yang dibuat (semua di `codes/`)
- **Skema klien** `src/lib/api/placement-contract.ts` memakai `PlacementStatusSchema`, `PlacementResultSchema`, `ApplyPlacementResponseSchema` dari `src/contracts/placement.ts` (ditambahkan Backend selama pekerjaan ini) dan hanya mendefinisikan `PlacementIntroSchema` (blok intro). `src/lib/api/placement.ts` (`placementApi.status/apply`); intro lewat `ExamIntroFullSchema` (lihat dev_log TASK-014).
- **Intro**: `ExamIntroView` (ikon Compass, aturan dari server, "25 soal - 25 menit", tanpa banner ambang). Alasan terblokir `ALREADY_COMPLETED`/`PROGRESS_EXISTS`/`RESULT_PENDING_APPLY` (+ tautan "Ke Beranda"); 409 `PLACEMENT_NOT_AVAILABLE` tampil sebagai Dialog.
- **Sesi adaptif** `exam/placement/placement-session.tsx` (dipilih oleh `ExamRunner` untuk `PLACEMENT_TEST`): `ExamShell` dengan timer total, "Soal n dari N" + `Progress`, satu soal per layar lewat `QuestionRenderer`, Button "Jawab" (disabled sampai jawaban siap; "Menyimpan..."), tanpa navigator/Sebelumnya/umpan balik. Jawaban dikirim lewat `PUT /answers/{id}`; `next_question` di-parse dengan `QuestionPublicSchema` (tidak sesuai kontrak = Toast galat, soal tidak maju); `null` -> `POST /submit` -> hasil. Gagal jaringan: Toast "Coba lagi", soal tetap. 409 `QUESTION_ALREADY_ANSWERED`/`QUESTION_NOT_CURRENT`: sinkron ulang dari `GET /attempts/{id}`. Muat ulang: soal `pending` = soal tersaji terakhir tanpa jawaban. "Akhiri" (Dialog: hasil dihitung dari soal yang dijawab). Waktu habis: Dialog "Waktu habis" lalu kirim dan ke hasil. Fokus ke kepala soal baru dan pengumuman `aria-live` "Soal 8 dari 25".
- **Hasil** `exam/placement/placement-result.tsx` (dipilih oleh `ExamResultView` bila `result.placement` ada): Card "Rekomendasi: Mulai di Tier n" (judul, CEFR, target band), "13 dari 25 benar", Button "Mulai di Tier n", "Mulai dari Tier 1" (disembunyikan bila rekomendasi 1), pilihan "Pilih Tier lain" (`<select>` bawaan untuk Tier 2..rekomendasi-1), Dialog konfirmasi yang menyebut Tier yang dilewati ("Tier 1 dan 2 akan ditandai Dilewati."), `POST /placement/apply`, Toast "Tier awal Anda: Tier n", invalidasi cache peta/resume/status, redirect `/peta`. `PLACEMENT_ALREADY_APPLIED`, `TIER_ABOVE_RECOMMENDATION` dll. tampil dari kamus. Disclaimer "Ini rekomendasi latihan, bukan penilaian resmi."
- **Titik masuk** `home/placement-entry.tsx`: dashboard (tombol "Ikut Placement Test" pada empty state `ResumeSection` bila `GET /placement` `available`; kartu "Hasil Placement Anda menunggu" + "Lihat Hasil" bila `RESULT_PENDING_APPLY`; kartu "Lanjutkan Placement Test" bila ada attempt berjalan) dan ajakan di `/peta`. `GET /placement` gagal = tidak menampilkan apa pun. Tautan lama `/placement` (rute tak ada) diganti `/ujian/mulai/{assessment_set_id}`; prop `placementAvailable` pada `ResumeSection` diganti `placementHref`.

### Uji (Frontend)
`src/components/exam/placement/placement.test.tsx` (25 tes), `src/components/home/placement-entry.test.tsx` (8 tes), kontrak di `src/lib/api/boss-placement-contract.test.ts`.

### Verifikasi (di `codes/`)
| Perintah | Hasil |
|---|---|
| `tsc --noEmit` | bersih |
| `eslint src tests --max-warnings=0` | bersih |
| `vitest run` | 59 berkas, 893 tes lulus (sebelum pekerjaan ini: 53 berkas, 786 tes) |
| `test:integration` | tidak dijalankan (di luar lingkup Frontend) |

### Catatan untuk Backend (TIDAK ditambal di klien)
1. Skema `src/contracts/placement.ts` menerima `question_count`/`time_limit_seconds` null; mohon didokumentasikan di `_api-contract.md` (kontrak tertulis tidak menyebut nullability saat `NO_PLACEMENT_PUBLISHED`).
2. Intro Placement: `scope = {kind:"TIER_PLACEMENT", id:null}` dan `cooldown` tetap diharapkan ada (bentuk SPEC-008); blok `placement` intro `{adaptive, question_count}` belum ada di skema bersama.
3. Sesi memakai `AttemptDTO.question_count` untuk "dari N" dan `answered_count` untuk nomor soal; `GET /attempts/{id}` saat tes berjalan harus memuat soal tersaji (dijawab + `pending`) dengan `answers` untuk yang dijawab agar soal `pending` dapat dilanjutkan setelah muat ulang.
4. `attempt.status` `EXPIRED` dialihkan ke `/hasil`; `GET result` diharapkan dapat dihitung untuk attempt kadaluarsa (SPEC-015 AC kadaluarsa). Saat `PUT` mendapat `ATTEMPT_EXPIRED`/`ATTEMPT_NOT_ACTIVE`, klien memanggil `POST /submit` (diharapkan idempoten untuk attempt yang sudah ditutup).
5. `placement.applied` pada `GET result` dipakai untuk menyembunyikan tombol pilih Tier; mohon `true` setelah apply.

### Belum diverifikasi
- Integrasi dengan Backend nyata; E2E Playwright 375x812 dan kontras terang/gelap secara visual; pembaca layar nyata; `<select>` bawaan di peramban seluler.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 14:50 | Frontend W7: intro, sesi adaptif, hasil + apply, titik masuk dashboard dan peta |

## [BACKEND] 2026-11-03 15:00 (Backend Engineer, wave W7)
Target spec: `specifications/015_spec_placement_test.md`. Status: selesai (Postgres 16 lokal).

### Ringkasan implementasi
- **Aturan murni** `codes/src/server/exams/placement-rules.ts`: `pickNext` (D3 staircase: kandidat belum tersaji pada kesulitan `d`, urut `question_id`, indeks `floor(rand*n)` dari `mulberry32` diseed 8 hex pertama `attempt.id` digeser sebanyak soal tersaji; ofset `+1,-1,+2,-2,...,-4`), `nextDifficulty`, `recommend` (D4: `last10`, `ability` pembulatan setengah ke atas 2 desimal dalam bilangan bulat, safeguard `correct*100 < 32*served` -> Tier 1, `clamp(floor(ability),1,4)`).
- **Handler `PLACEMENT_TEST`** (`exams/placement.ts`, terdaftar di `attempts/handlers.ts`): `placementEligibility` (D1, prioritas `ALREADY_COMPLETED` > `PROGRESS_EXISTS` > `NO_PLACEMENT_PUBLISHED` > `RESULT_PENDING_APPLY`; set = version tertinggi lalu id terkecil), `start` (409 `PLACEMENT_NOT_AVAILABLE` + `details[0].code`), state awal `state.placement = { n, d:3, served, pending, history }` dengan hanya soal pertama tersaji, `intro` (scope `TIER_PLACEMENT`, empat aturan, `placement:{adaptive, question_count}`), `score` (hanya soal yang dijawab), `onFinish` (rekomendasi, `tier_options`, `result_json` dengan `applied: null`).
- **PUT answers adaptif** (`placementAnswer`, dipanggil dari `attempts/service.ts`): `QUESTION_ALREADY_ANSWERED` (baik respons sama maupun beda), 404 untuk soal belum tersaji, `QUESTION_NOT_CURRENT`; menilai (SPEC-006 D6-D7), mencatat `history`, memperbarui `d`, memilih soal berikutnya dan mengembalikannya sebagai `next_question` (null di jawaban ke-N atau bank habis); `feedback` selalu null; `difficulty` tidak pernah keluar. Serialisasi oleh `SELECT ... FOR UPDATE` attempt (dua perangkat serentak: satu 200, satu 409).
- **Service** (`exams/placement-service.ts`): `GET /placement` (attempt kedaluwarsa dinilai dulu; `active_attempt_id`, `pending_result`) dan `POST /placement/apply` (`ATTEMPT_NOT_FINISHED`, `PLACEMENT_ALREADY_APPLIED`, `TIER_ABOVE_RECOMMENDATION`, `PLACEMENT_NOT_AVAILABLE`/PROGRESS_EXISTS; `GatekeepingService.applyPlacementResult`; `result_json.applied`; audit `PLACEMENT_APPLIED`; baris `users` dikunci).
- **Route baru**: `GET /api/v1/placement`, `POST /api/v1/placement/apply`. Zod: `src/contracts/placement.ts`.

### Berkas
Baru: `src/server/exams/placement.ts`, `placement-rules.ts`, `placement-service.ts`, `src/contracts/placement.ts`, `src/app/api/v1/placement/route.ts`, `src/app/api/v1/placement/apply/route.ts`, `tests/unit/placement-rules.test.ts` (16), `tests/integration/placement.itest.ts` (26).
Diubah (bersama TASK-014): `attempts/{service,dto,engine,handlers,hooks}.ts`, `exams/service.ts`, `http/errors.ts`.

### Catatan teknis
- Tanpa migrasi/skema baru; `placement.question_count` sudah ada di seed `app_settings`.
- Interpretasi yang perlu diketahui QA: `served_count` = soal yang DIJAWAB (D6); `apply.unlocked` memuat TIER, MODULE, SUB_MODULE yang kini UNLOCKED; urutan pemeriksaan apply dicatat di Revision History spec 015.
- Aturan publish "PLACEMENT_TEST tanpa WRITING_TASK/SPEAKING_TASK" sudah ditegakkan validator SPEC-004 (`ai_task_not_allowed`); bank tanpa `difficulty` diabaikan saat memilih soal.
- Belum diverifikasi: E2E Playwright (bank 50 soal), set Placement hasil `content:import` (hanya fixture DB), kinerja pada bank besar.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 15:00 | Backend W7: Placement adaptif, rekomendasi, apply selesai; tsc/eslint bersih, vitest 59 berkas/893 tes, test:integration 19 berkas/461 tes lulus |

## [BACKEND] Perbaikan QA W7 (2026-11-03 15:40, Backend Engineer)
Sumber: `qa_report.md` TASK-015. Tanpa perubahan bentuk kontrak.
- F-15-01 MEDIUM (selesai): `recommended_tier = min(hasil_D4, 1 + floor(3*dijawab/N))` (`placement-rules.ts: evidenceTierCap`, `recommend(history, n)`; N dari `state.placement.n`). Vektor spec 25 jawaban tidak berubah. Spec 015 D4 diamandemen; ADR-003 #30 (diputuskan Orchestrator, perlu tinjauan human). Tes: unit (cap, 1-3 jawaban, batas 8/9/16/17/24/25, N kustom) dan integrasi (1,2,3,8,9,16,17,24 jawaban; 25 -> Tier 4; N=10; apply di atas batas -> 409). Tes lama "kadaluarsa setelah 6 jawaban" kini Tier 1.
- F-15-03 (selesai): `placementHandler.start` memakai advisory lock per pengguna, memaksa `set.id === set D1` (selain itu 404) dan menolak 409 `PLACEMENT_NOT_AVAILABLE` (`ATTEMPT_IN_PROGRESS`) bila ada attempt Placement `IN_PROGRESS` pada set lain. Spec 015 D1 diamandemen. Tes dua set PUBLISHED (404, 409, resume, serentak).
- F-15-05 (selesai): `buildResultDTO` Placement menjumlah `per_skill` dari `state.placement.history` (soal dijawab saja). Tes: jumlah per_skill = raw/max attempt dengan soal pending.
- F-15-04 (selesai): `applyPlacement` memanggil `lockProgress` (kini diekspor dari GatekeepingService) sebelum memeriksa `PROGRESS_EXISTS`. Tes deterministik (transaksi drill menahan kunci); terbukti gagal tanpa perbaikan.
- F-15-08 (selesai): AC spec 015 diubah "tersaji" -> "dijawab".
- Ditunda (dicatat): F-15-02 (seed Placement dari `rng_seed` rahasia: mengubah D3 dan tes vektor; risiko rendah), F-15-06 (GET /placement mahal + rate limit; FE memanggil di dashboard, bucket ketat berisiko), F-15-07 (snapshot set; menunggu SPEC-020), F-15-09/10/11 (INFO).

### Revision History (perbaikan QA W7)
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 15:40 | Backend QA W7: F-15-01/03/04/05/08 diperbaiki; D1 dan D4 diamandemen; hasil verifikasi: tsc bersih; eslint src tests scripts --max-warnings=0 bersih; vitest 59 berkas/905 tes lulus; test:integration 19 berkas/484 tes lulus (sebelumnya 461) |
