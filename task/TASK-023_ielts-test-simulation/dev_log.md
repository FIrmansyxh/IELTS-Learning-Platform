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
