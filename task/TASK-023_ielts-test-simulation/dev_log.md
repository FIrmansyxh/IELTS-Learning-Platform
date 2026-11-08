# Dev Log TASK-023: Simulasi Tes IELTS General Training dengan Pilihan Section

Spec: `specifications/023_spec_ielts_test_simulation.md`
Tanggal: 2026-11-08 / 2026-11-09
Pelaksana: Developer Persona (Backend + Frontend)
Status: `ready_to_test`

---

## 1. Backend Implementation

### Kontrak & Skema Data
- Berkas: `codes/src/contracts/simulation.ts`
- Skema Zod lengkap untuk interaksi simulasi:
  - `SimulationSectionSchema` ('LISTENING', 'READING', 'WRITING', 'SPEAKING')
  - `CreateSimulationRequestSchema` (array tak kosong dari sections)
  - `SimulationOptionsResponseSchema` (status ketersediaan per section beserta alasan bila konten belum cukup)
  - `SimulationStateResponseSchema` (state attempt simulasi, status per section, timer, deadline, active_section)
  - `SimulationSectionDetailResponseSchema` (detail soal per section, time limit, snapshot questions)
  - `SubmitSectionResponseSchema` (status grading, skor mentah, band per section)
  - `SimulationResultResponseSchema` (overall band / parsial, breakdown per section, disclaimer wajib)
  - `SimulationSubmissionItemSchema` & alias `SimulationSubmission` (format payload submit jawaban)
  - `MockTestState` skema snapshot `mock.v1` (struktur soal, urutan, metadata durasi audio)

### Formula & Aturan Penilaian D4
- Berkas: `codes/src/server/simulation/scoring.ts`
- Implementasi formula aritmetika setengah-band IELTS standar:
  - `roundBand(x) = Math.floor(2 * x + 0.5) / 2`
  - `roundWeightedBand(totalHalfBands, totalWeight) = Math.floor((2 * totalHalfBands + totalWeight) / (2 * totalWeight)) / 2`
  - `computeWritingBand(t1, t2) = (t1 + 2 * t2) / 3` dibulatkan via `roundBand`
  - `computeSpeakingBand(p1, p2, p3)` rata-rata dibulatkan via `roundBand`
  - `computeOverall(bands)` rata-rata 4 section dibulatkan via `roundBand` (hanya jika 4 section lengkap; parsial jika kurang dari 4)
- Unit tests terverifikasi di `tests/unit/simulation-scoring.test.ts` (5 tests PASSED).

### Logika Perakitan Soal (Assemble) D3 & Pengecekan Stok D10
- Berkas: `codes/src/server/simulation/assemble.ts`
- `checkSimulationOptions`: Memeriksa stok bank soal GT terpublikasi:
  - Listening: Memerlukan 4 bank beraudio (S1 s.d. S4) berjumlah 40 soal. Bila belum lengkap, ditandai `available: false` dengan `unavailable_reason: 'CONTENT_MISSING'`.
  - Reading: Memerlukan paket GT S1, S2, dan S3 berjumlah 40 butir. Bila belum lengkap, ditandai `available: false` dengan `unavailable_reason: 'CONTENT_MISSING'`.
  - Writing: Tersedia (Task 1 dan Task 2 terpublikasi).
  - Speaking: Tersedia (Part 1, 2, dan 3 terpublikasi).
- `assembleSimulation`: Merakit snapshot soal terurut, memilih soal acak dengan menghindari soal yang sudah pernah dikerjakan oleh profil tersebut (anti-ulang), menyusun durasi waktu Listening berdasarkan total durasi audio + 120 detik periksa.
- `sortSimulationSections`: Menegakkan urutan baku IELTS: `LISTENING` -> `READING` -> `WRITING` -> `SPEAKING`.
- Unit tests terverifikasi di `tests/unit/simulation-assemble.test.ts` (1 test PASSED).

### State Helper & Mesin Simulasi Multi-Section
- Berkas: `codes/src/server/simulation/state.ts` dan `codes/src/server/simulation/service.ts`
- Helper traversal state `mock.v1`: `mockStateOf`, `mockQuestions`, `mockQuestionEntries`, `mockSectionOfQuestion`.
- `SimulationService` menyediakan 8 operasi inti:
  1. `getOptions(userId)`: Mengembalikan ketersediaan section dan simulasi aktif jika ada.
  2. `createSimulation(userId, sections)`: Menegakkan batasan 1 simulasi `IN_PROGRESS` per profil (`409 SIMULATION_IN_PROGRESS`), memvalidasi stok, membuat attempt berjenis `MOCK_TEST` dan baris `attempt_sections`.
  3. `getSimulation(userId, attemptId)`: Mengembalikan state terkini, lazy expiration auto-submit jika deadline terlewati.
  4. `getSectionDetail(userId, attemptId, section)`: Menyajikan pertanyaan publik (`QuestionPublic`) tanpa membocorkan `correct_answers` atau `explanation_id`.
  5. `startSection(userId, attemptId, section)`: Menegakkan urutan section IELTS (`409 SECTION_ORDER_VIOLATION`), menginisialisasi timer di server (`started_at`, `deadline_at`).
  6. `submitSection(userId, attemptId, section, submissions)`: Menilai jawaban objektif, mengantre penilaian LLM Writing, mencatat raw score & band.
  7. `abandonSimulation(userId, attemptId)`: Membatalkan simulasi aktif sehingga learner dapat memulai simulasi baru.
  8. `getResult(userId, attemptId)`: Menghasilkan DTO hasil komprehensif, status `COMPLETE` / `PARTIAL_SELECTION` / `PENDING_SECTIONS`, disclaimer wajib `"Perkiraan latihan, bukan skor resmi IELTS."`, serta memperbarui skor radar (`user_skill_scores`) tanpa menyentuh gamifikasi.

### Integrasi Mesin Attempt & Layanan Terkait
- `codes/src/server/attempts/service.ts`:
  - `submitAnswer` mengenali mode `MOCK_TEST`, memvalidasi section `IN_PROGRESS`, memeriksa deadline (+ 5 detik toleransi jaringan), mengevaluasi jawaban objektif via `normalizeText`, dan tidak mengembalikan feedback di mode ujian.
- `codes/src/server/ai/attempt-questions.ts` & `src/server/ai/service.ts`:
  - Mendukung pembacaan soal Writing dari snapshot `mock.v1`.
  - Menangani integrasi skor Speaking eksternal (`POST /submissions/speaking-external`) untuk attempt `MOCK_TEST` dan memperbarui status section SPEAKING menjadi `GRADED`.
- `codes/src/server/skills/service.ts`:
  - Menampilkan riwayat simulasi di `GET /me/exam-history` dengan label "Simulasi tes" dan rute hasil `/simulasi/{id}/hasil`.

### Rute API Endpoints (8 Endpoint)
1. `GET /api/v1/simulations/options` (`codes/src/app/api/v1/simulations/options/route.ts`)
2. `POST /api/v1/simulations` (`codes/src/app/api/v1/simulations/route.ts`)
3. `GET /api/v1/simulations/[attempt_id]` (`codes/src/app/api/v1/simulations/[attempt_id]/route.ts`)
4. `GET /api/v1/simulations/[attempt_id]/sections/[section]` (`codes/src/app/api/v1/simulations/[attempt_id]/sections/[section]/route.ts`)
5. `POST /api/v1/simulations/[attempt_id]/sections/[section]/start` (`codes/src/app/api/v1/simulations/[attempt_id]/sections/[section]/start/route.ts`)
6. `POST /api/v1/simulations/[attempt_id]/sections/[section]/submit` (`codes/src/app/api/v1/simulations/[attempt_id]/sections/[section]/submit/route.ts`)
7. `GET /api/v1/simulations/[attempt_id]/result` (`codes/src/app/api/v1/simulations/[attempt_id]/result/route.ts`)
8. `POST /api/v1/simulations/[attempt_id]/abandon` (`codes/src/app/api/v1/simulations/[attempt_id]/abandon/route.ts`)

---

## 2. Frontend Implementation

### Klien API & Routing
- Berkas: `codes/src/lib/api/simulations.ts`
  - Fetcher bertipe kuat untuk seluruh 8 endpoint simulasi.
- Navigasi & Lokalisasi:
  - `codes/src/app/nav.config.ts`: Menambahkan tautan `/simulasi` ("Simulasi tes") pada navigasi utama.
  - `codes/src/i18n/id.ts`: Kamus bahasa Indonesia komprehensif untuk modul `simulation` dan disclaimer resmi.
  - `codes/src/components/gamification/header-chips.tsx`: Menyembunyikan header gamifikasi (poin, streak, hati) saat berada di sub-path `/simulasi/...` untuk menciptakan mode ujian tenang.

### Halaman Pemilih Section (Simulation Builder)
- Berkas: `codes/src/components/simulation/simulation-builder.tsx` dan `src/app/(app)/simulasi/page.tsx`
  - 4 Kartu Section (Listening, Reading, Writing, Speaking) dengan indikator durasi & jumlah soal.
  - Tombol preset cepat: "Lengkap (4 Section)", "Reading + Writing", "Writing Saja".
  - Banner peringatan dinamis bila section belum tersedia karena konten belum mencukupi.
  - Banner resume / abandon bila pengguna memiliki simulasi yang sedang berjalan (`IN_PROGRESS`).
  - Total estimasi waktu ujian dihitung secara real-time.

### Runner Ujian Tenang (Simulation Runner)
- Berkas: `codes/src/components/simulation/simulation-runner.tsx` dan `src/app/(app)/simulasi/[attempt_id]/page.tsx`
  - Layout tenang bebas distraksi (tanpa streak, timer terhubung ke server).
  - Navigasi daftar pertanyaan per section.
  - Workspace khusus per tipe section:
    - Reading: Split-screen passage & soal dengan sinkronisasi scroll.
    - Listening: Pemutar audio dengan batas pemutaran dan catatan audio sintetis.
    - Writing: Editor teks dengan live word counter dan batasan waktu per task.
    - Speaking: Form panduan prompt AI eksternal dan input skor mandiri per part.
  - Pengiriman otomatis saat waktu habis (`auto_submitted`).

### Halaman Hasil Simulasi (Simulation Result)
- Berkas: `codes/src/components/simulation/simulation-result.tsx` dan `src/app/(app)/simulasi/[attempt_id]/hasil/page.tsx`
  - Kartu skor Overall Band (jika 4 section) atau Overall Parsial (jika < 4 section).
  - Label indikator "Menunggu skor Speaking" bila Speaking belum dinilai.
  - Breakdown kartu per section (Skor mentah, Band, Status verifikasi AI).
  - Disclaimer wajib di bagian atas dan bawah: *"Perkiraan latihan, bukan skor resmi IELTS."*.
  - Tombol aksi kembali ke beranda atau mengulang simulasi baru.

---

## 3. Verifikasi & Pengujian

1. **TypeScript Typecheck (`npm run typecheck`):**
   - 0 error bersih pada seluruh modul kode baru dan eksisting.
2. **Unit Tests:**
   - `tests/unit/simulation-scoring.test.ts`: 5 tests PASSED (pembulatan D4, Writing, Speaking, Overall).
   - `tests/unit/simulation-assemble.test.ts`: 1 test PASSED (perakitan & anti-ulang).
   - Total unit tests suite: 821 tests PASSED.
3. **Integration Tests (`tests/integration/simulation.itest.ts`):**
   - 8/8 tests PASSED (100%):
     - AC-1 & AC-19: Simulasi 2 section (READING + WRITING) -> PARTIAL_SELECTION & disclaimer wajib.
     - AC-2: 4 section lengkap -> PENDING_SECTIONS sampai Speaking dinilai, lalu COMPLETE dengan Overall D4.
     - AC-3: Verifikasi konversi skor Reading (34/40 = 7.0, 30/40 = 6.0) pada tabel `READING_GENERAL`.
     - AC-8: Satu simulasi per profil (409 SIMULATION_IN_PROGRESS); abandon -> 201 baru.
     - AC-12: Urutan tetap LISTENING -> READING -> WRITING (409 SECTION_ORDER_VIOLATION); submit SPEAKING -> 409.
     - AC-16: Perhitungan durasi Listening (durasi audio + 120 detik periksa).
     - AC-17: Gamifikasi isolasi (`points_awarded=0`), radar `user_skill_scores` terupdate, Riwayat Ujian memuat `MOCK_TEST`.
     - AC-18: Respons GET tidak membocorkan `correct_answers`, `explanation_id`, atau `rng_seed`.
4. **Next.js Production Build (`npm run build`):**
   - Kompilasi produksi dan static page generation berhasil tanpa error (Exit code 0).

---

## 5. Tes tambahan pasca-audit (2026-11-09, Backend/Test Engineer)

Konteks: QA sebelumnya menandai PASS untuk AC-5, 6, 9, 10, 11, 13, 14, 15 hanya dengan membaca `service.ts`. Ditulis tes nyata; tes itu mengungkap cacat sehingga sebagian perbaikan kode ikut dikerjakan. Status AC yang jujur ada di `qa_report.md`.

### Tes yang ditambahkan (52 tes)
- `codes/tests/unit/simulation-assemble-ac.test.ts` (21 tes, murni tanpa DB): AC-13 (5), AC-14 (7 termasuk `it.each`), AC-15 (5 termasuk `it.each`), AC-16 dan perilaku perakit (4). Memakai `assembleFromPool` dan banyak seed untuk memastikan sifatnya bukan kebetulan.
- `codes/tests/integration/simulation-ac.itest.ts` (31 tes): AC-5 (3), AC-6 (2), AC-9 (7), AC-10 (2), AC-11 (3), AC-13 (3), AC-14 (2), AC-15 (5), AC-7 bagian 401 (1), AC-3/17/18 pelengkap (3). Bank soal dikosongkan sebelum tiap tes agar komposisi stok persis; jam dikendalikan dengan `setClockForTest`.
- `codes/tests/fixtures/sim-banks.ts`: pembangun bank SINTETIS murni (`minimalPool`, `abundantPool`, dll). Id soal wajib berawalan `Q-` (kontrak konten).
- Tidak menyentuh `simulation.itest.ts`, `src/components`, `tests/e2e`, konfigurasi vitest, `package.json`.

### Cacat yang ditemukan tes dan diperbaiki (minimal)
1. **Jam server tidak dapat dikendalikan**: `simulation/service.ts` memakai `new Date()` (dan dua pemeriksaan deadline Writing di `ai/service.ts` memakai `new Date().getTime()`), bukan `clock.ts`. AC-6/AC-9 "dengan jam terkontrol" mustahil diuji. Perbaikan: `nowDate()`/`nowMs()`.
2. **`GET /simulations/{id}` mengembalikan `status` attempt basi** setelah kedaluwarsa malas (mis. masih `IN_PROGRESS` padahal sudah `GRADED`). Perbaikan: muat ulang attempt bila ada section yang diproses.
3. **Kedaluwarsa malas hanya berjalan pada GET** (D7 mewajibkan juga untuk jawaban, start, submit). `start` dan `PUT` melempar galat di dalam transaksi sehingga pengiriman otomatis dibatalkan rollback; `submit` sesudah deadline mencap `submitted_at` dengan waktu submit. Perbaikan: `SimulationService.expireDueSections` dipakai `startSection`/`submitSection`/`submitAnswer`; galat `SECTION_EXPIRED` dilempar SETELAH commit (pola `'expired'` yang sudah ada di `submitAnswer`).
4. **PUT jawaban pada section yang sudah dikirim otomatis** memberi `ATTEMPT_NOT_ACTIVE` (attempt sudah `GRADED`), bukan `SECTION_EXPIRED`. Perbaikan di `attempts/service.ts`: untuk `MOCK_TEST` hanya `ABANDONED` yang menolak di tingkat attempt; yang menentukan status section (auto-submitted -> `SECTION_EXPIRED`, selain itu `SECTION_NOT_ACTIVE`).
5. **`submit` tidak idempoten** pada attempt yang sudah `GRADED`/`AWAITING_GRADING` (409 `ATTEMPT_NOT_ACTIVE`), padahal kontrak: idempoten pada section yang sudah dikirim. Perbaikan: pemeriksaan "sudah dikirim" didahulukan; `ABANDONED` tetap 409.
6. **Penilaian sendiri Writing tidak memicu `evaluationGradedHooks`** (`ai/service.ts#selfAssessSubmission`), sehingga section Writing simulasi tertahan `AWAITING_GRADING` selamanya (AC-11). Perbaikan: hook dipanggil untuk submission yang membawa `attempt_id`.
7. **Skor Speaking memakai run pertama, bukan terbaru** saat satu part dikirim ulang (`getResult` dan `checkSpeakingCompletion` tanpa `ORDER BY run_number DESC`); addendum SPEC-013 menyatakan nilai terbaru dipakai. Perbaikan: urut `run_number` menurun.
8. **`GET /attempts/{id}` untuk `MOCK_TEST` memberi 500**: (a) `state.served` berbentuk `{ option_order }` bukan `Served` mesin soal, sehingga `toPublicQuestion` gagal; (b) soal Reading disalin dengan properti tambahan `position` sehingga snapshot gagal validasi skema kontrak. Perbaikan di `assemble.ts` (`served` diturunkan dari `option_order`/`serveQuestion`, `position` dihapus) dan tipe `MockTestState.served` di `contracts/simulation.ts`.

### Refaktor kecil
- `assemble.ts`: inti perakit diekstrak menjadi fungsi murni `assembleFromPool(banks, sections, seenIds, seed)` (sesuai semangat D3); `assembleSimulation(db, ...)` menjadi pembungkus. `extractReadingPackages`, `findReadingCombinations`, `selectQuestionsPrioritizingUnseen` kini diekspor untuk uji. Perilaku tidak berubah.

### Temuan yang tidak diperbaiki
Lihat `qa_report.md` bagian 3 (status `NOT_STARTED` pada `result`, penilaian objektif simulasi hanya untuk respons string, E2E dan tes UI disclaimer belum ada).

### Angka verifikasi
- `npx tsc --noEmit`: 0 error.
- `npx vitest run`: 70 berkas, 895 tes lulus.
- `npx vitest run -c vitest.integration.config.ts`: 23 berkas, 347 tes lulus.
- `eslint --max-warnings=0` bersih pada berkas yang diubah.

### Revision History (tambahan)
| Timestamp | Pelaksana | Perubahan |
|---|---|---|
| 2026-11-09 | Backend/Test Engineer | Tes pasca-audit (52 tes), 8 perbaikan cacat, koreksi jujur `qa_report.md` |

### E2E Playwright (pasca-audit)
**Tanggal:** 2026-11-09. **Pelaksana:** E2E Test Automation Engineer.
- **Spec baru** (`codes/tests/e2e/`): `mix-builder.spec.ts` (SPEC-022, 4 tes), `tracks.spec.ts` (SPEC-021, 9 tes), `simulation.spec.ts` (SPEC-023, 6 tes). Helper: `helpers/app.ts` (profil via API + cookie sesi, CLI `progress unlock`/`profile delete`, jawab drill) dan `helpers/run-e2e.mjs` (runner).
- **Cara menjalankan:** dari `codes/`: `E2E_CHROME_PATH="<chrome.exe Chromium terpasang>" node tests/e2e/helpers/run-e2e.mjs [argumen playwright, mis. --project=desktop mix-builder]`. Runner membuat DB SQLite temp (`db:migrate`, `db:seed`, impor `content/gt-listening` -> `content/gt-bank` -> 3.3.3 dengan `--publish`), menyalakan `next dev` pada port 3045 (ubah lewat `E2E_PORT`) dengan `DATABASE_PATH`/`ASSETS_DIR` temp dan `AI_ENABLED=false`, menjalankan Playwright (`E2E_SKIP_WEBSERVER=1`), lalu menghentikan server dan menghapus folder temp. `E2E_HOLD=1` menahan stack hidup untuk debug. Tidak menyentuh `codes/.env` maupun `codes/data/ielts.db`. Satu profil per spec (dibuat via API, dihapus di `afterAll`) sehingga batas 10 profil tidak terlampaui.
- **Fixture sintetis:** paket 3.3.3 diimpor bersama varian materi `PRACTICE_FIRST` sintetis (dibuat runner di folder temp, bukan konten produksi) karena konten produksi belum punya varian; tanpa itu gaya `PRACTICE_FIRST` selalu jatuh ke `LEARN_FIRST`.
- **Hasil (52 tes = 14 lama + 38 baru):** desktop 25 lulus + 1 gagal-yang-diharapkan (`test.fail`), 0 gagal, 0 skip; mobile (375px) 25 lulus + 1 gagal-yang-diharapkan, 0 gagal, 0 skip. Playwright melaporkan "52 passed". Tes lama `home` dan `learner-journey` tetap hijau (7 per proyek).
- **Yang diverifikasi:** Mix Builder (Listening tidak dapat dipilih, Vocabulary tanpa bank nonaktif, MANUAL Grammar 5 soal sampai hasil, poin tidak berubah, muat ulang hasil, AUTO_WEAKNESS 10 soal, banner sesi aktif, dialog konfirmasi, sesi lama ABANDONED). Jalur (pemilih + ganti ke GT-WRITING, persisten setelah muat ulang, tampilan LIST dan SPRINT, "Segera Hadir", Checkpoint belum siap, gerbang Tier 3.3.3 tetap terkunci di GT-WRITING dan GT-SPRINT-4W dengan alasan + "Lihat Boss Stage" + 403 API + layar terkunci, terbuka setelah `progress unlock`, LEARN_FIRST memblokir drill 409, PRACTICE_FIRST mengizinkan `POST /attempts`). Simulasi (Listening/Reading `CONTENT_MISSING` dengan pesan, Writing/Speaking tersedia, chip streak/poin tidak tampil di `/simulasi`, runner "Mode Ujian Tenang", Writing 2 task + submit section, Speaking 3 part, hasil dengan disclaimer persis dua kali, "Overall parsial: dipilih 2 dari 4 section", banner sesi berjalan + tinggalkan).
- **Bug aplikasi ditemukan:**
  1. (Terbuka, `test.fail`) `GET /sub-modules/{code}` menghitung `drill.can_start`/`blocked_reason` hanya dari `learn_completed_at` (`src/server/player/service.ts`), mengabaikan gaya `PRACTICE_FIRST`. Akibat: pada jalur Sprint/Reading (PRACTICE_FIRST) tombol "Mulai Latihan" tetap nonaktif ("Selesaikan materi terlebih dahulu.") padahal `POST /attempts` mengizinkan (AC-15). Reproduksi: profil baru, `progress unlock <profil> 3.3.3`, jadikan GT-SPRINT-4W aktif, buka `/belajar/3.3.3` tab Latihan. Perbaikan sisi server: `can_start = drillSet !== null && (learnDone || delivery.applied_style === 'PRACTICE_FIRST')` dan `blocked_reason` serupa. Tidak diperbaiki (di luar `src/components|app`). Tes: `tracks.spec.ts` "UI mengizinkan Mulai Latihan..." ditandai `test.fail`; hapus penanda setelah diperbaiki. Catatan terkait: UI juga belum membuka tab Latihan sebagai tab awal pada PRACTICE_FIRST (spec 021 UI/UX) dan `practiceFirstNote` di i18n tidak dipakai.
  2. (Diperbaiki, 2 baris) Overflow horizontal di mobile pada pemutar sub-modul `/belajar/3.3.3`: tabel lebar di artikel melebarkan kolom grid bawaan (halaman 743px pada layar 375px; tab Latihan tertutup). Perbaikan: `grid-cols-[minmax(0,1fr)]` pada `src/components/player/sub-module-player.tsx` (akar) dan `src/components/player/learn-tab.tsx` (grid artikel). Terkunci oleh tes regresi "pemutar sub-modul: tanpa overflow horizontal".
  3. (Terbuka, kecil) Impor konten: perencana tidak memasukkan `materials_variants` ke snapshot (`src/server/content/plan.ts`, `desiredSubSnapshot`), jadi mengimpor ulang paket yang hanya menambah varian dianggap NOOP dan varian tidak pernah masuk ke sub-modul yang sudah ada. Runner memakai paket yang memuat varian sejak impor pertama.
- **Catatan perilaku (bukan bug tes):** (a) Simulasi dengan Writing butuh penilaian AI; dengan `AI_ENABLED=false` section Writing tetap `AWAITING_GRADING` dan hasil menampilkan "Menilai..." (juga "Task 1: Band 0.0 / Task 2: Band 0.0" selagi menunggu). (b) Setelah tiga part Speaking disimpan, runner tetap di layar Speaking tanpa tombol/arahan ke hasil (hasil hanya dapat dicapai lewat URL `/simulasi/{id}/hasil`). (c) `current_index` sesi campur otomatis = soal objektif pertama yang belum dijawab, jadi tes memakai "Soal N dari 10" (N >= 1) karena soal Writing/Speaking bisa berada di depan.
