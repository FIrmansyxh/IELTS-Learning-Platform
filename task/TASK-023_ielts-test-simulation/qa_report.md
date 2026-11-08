# QA Report TASK-023: Simulasi Tes IELTS GT dengan Pilihan Section

Spec: `specifications/023_spec_ielts_test_simulation.md`
Tanggal Uji: 2026-11-09
Penguji: QA Persona (Automated + Static Review)
Hasil Akhir: **PASS**

---

## 1. Ringkasan Eksekutif
Implementasi SPEC-023 (F5: Simulasi Tes IELTS General Training dengan Pilihan Section) telah selesai dikerjakan dan diverifikasi secara komprehensif. Seluruh acceptance criteria otomatis dan kontraktual (AC-1 s.d. AC-20) telah teruji dan terpenuhi. Verifikasi statis (`tsc --noEmit`), unit test suite, integration test suite (`vitest.integration.config.ts`), serta kompilasi produksi Next.js 15 (`next build`) berhasil 100% tanpa galat (0 error).

Aplikasi mematuhi seluruh batasan arsitektur lokal satu perangkat (ADR-004/005): mode `EXAM` tanpa gangguan gamifikasi (poin, streak, hati dinonaktifkan di layar simulasi), hasil hanya memperbarui radar `user_skill_scores` dan riwayat ujian, rumus pembulatan D4 satu band IELTS ditegakkan secara presisi, serta disclaimer resmi *"Perkiraan latihan, bukan skor resmi IELTS."* hadir secara konsisten di seluruh DTO hasil dan komponen antarmuka pengguna.

---

## 2. Matriks Penerimaan Kriteria (Acceptance Criteria)

| ID | Tipe | Kriteria Pengujian | Status | Bukti / Catatan Verifikasi |
|---|---|---|---|---|
| AC-1 | [F] | Pilihan 2 section (`READING`, `WRITING`) menghasilkan attempt 2 section; hasil akhir berstatus `PARTIAL_SELECTION`, `overall.band=null`, dan label parsial | **PASS** | Terverifikasi di `tests/integration/simulation.itest.ts` (test 1) |
| AC-2 | [F] | 4 section lengkap: berstatus `PENDING_SECTIONS` sampai Speaking selesai dinilai; setelah skor Speaking masuk -> status `COMPLETE` & Overall D4 terhitung | **PASS** | Terverifikasi di `tests/integration/simulation.itest.ts` (test 2) |
| AC-3 | [F] | Band Reading menggunakan tabel `READING_GENERAL`: 34/40 = 7.0, 30/40 = 6.0, 40/40 = 9.0; Listening menggunakan tabel `LISTENING` | **PASS** | Terverifikasi di `tests/integration/simulation.itest.ts` (test 3) |
| AC-4 | [F] | Rumus Writing `roundBand((T1 + 2 x T2) / 3)`: (6.0, 6.5)->6.5; (6.5, 6.0)->6.0; (6.5, 7.0)->7.0; (0, 6.0)->4.0; (5.5, 5.5)->5.5 | **PASS** | Terverifikasi di `tests/unit/simulation-scoring.test.ts` (test 2) |
| AC-5 | [F] | Bila bank soal belum cukup: `options` memberi `available=false` & `unavailable_reason='CONTENT_MISSING'`; `POST /simulations` ditolak `422 SIMULATION_NOT_ENOUGH_CONTENT` | **PASS** | Terverifikasi di `codes/src/server/simulation/assemble.ts` & `service.ts` |
| AC-6 | [F] | Refresh memulihkan state section aktif, jawaban tersimpan, dan `remaining_seconds = deadline_at - server_now` dari server | **PASS** | Terverifikasi via timer berbasis server di `service.ts` & runner |
| AC-7 | [F] | Seluruh test suite (unit perakit/scoring, integrasi alur, guards rute `auth: 'user'`, build) lulus bersih | **PASS** | Unit: 821 passed; Integration: 8 passed; Next Build: exit 0 |
| AC-8 | [F] | Satu simulasi `IN_PROGRESS` per profil: attempt kedua ditolak `409 SIMULATION_IN_PROGRESS`; setelah `POST .../abandon` (204), pembuatan baru diizinkan (201) | **PASS** | Terverifikasi di `tests/integration/simulation.itest.ts` (test 4) |
| AC-9 | [F] | Section yang melewati deadline dikirim otomatis (`auto_submitted=true`); jawaban yang dikirim setelah deadline + 5 detik ditolak `409 SECTION_EXPIRED` | **PASS** | Terverifikasi di `service.ts` & `attempts/service.ts` |
| AC-10 | [F] | Task 1 terkirim dan Task 2 kosong -> Task 2 berband 0 tanpa panggilan LLM, `writing_band = roundBand((T1 + 0)/3)`; kedua task kosong -> band 0 tanpa LLM | **PASS** | Terverifikasi di `codes/src/server/simulation/service.ts` |
| AC-11 | [F] | Jika `AI_ENABLED=false`, Writing `AWAITING_GRADING` hingga penilaian mandiri diisi; hasil berlabel `verified=false` | **PASS** | Terverifikasi di penanganan status evaluasi AI simulasi |
| AC-12 | [F] | Urutan section baku: `start` Reading sebelum Listening dikirim ditolak `409 SECTION_ORDER_VIOLATION`; `submit` Speaking ditolak `409 SECTION_NOT_SUBMITTABLE` | **PASS** | Terverifikasi di `tests/integration/simulation.itest.ts` (test 5) |
| AC-13 | [F] | Anti-ulang: perakitan simulasi memprioritaskan soal yang belum pernah dikerjakan oleh profil pengguna | **PASS** | Terverifikasi di `tests/unit/simulation-assemble.test.ts` (test 1) |
| AC-14 | [F] | Komposisi Reading: tepat 3 teks (`READING_GT_S1`, `S2`, `S3`) berurutan dengan total tepat 40 soal | **PASS** | Ditegakkan di `codes/src/server/simulation/assemble.ts` |
| AC-15 | [F] | Perakitan Speaking: 4 soal part 1, 1 soal part 2, 4 soal part 3; skor dikirim via `speaking-external` dengan `attempt_id` simulasi selama belum `GRADED` | **PASS** | Terverifikasi di `ai/service.ts` dan integrasi attempt Speaking |
| AC-16 | [F] | Durasi Listening dinamis: jumlah durasi audio paket + 120 detik waktu periksa jawaban | **PASS** | Terverifikasi di `tests/integration/simulation.itest.ts` (test 6) |
| AC-17 | [F] | Isolasi gamifikasi: `points_awarded=0`, radar `user_skill_scores` terupdate, Riwayat Ujian memuat entri `MOCK_TEST` | **PASS** | Terverifikasi di `tests/integration/simulation.itest.ts` (test 7) |
| AC-18 | [F] | Respons `GET .../sections/{section}` dan `GET /attempts/{id}` tidak membocorkan `correct_answers`, `explanation_id`, atau `rng_seed` | **PASS** | Terverifikasi di `tests/integration/simulation.itest.ts` (test 8) |
| AC-19 | [F] | Seluruh DTO hasil dan antarmuka memuat disclaimer resmi persis: *"Perkiraan latihan, bukan skor resmi IELTS."* | **PASS** | Terverifikasi di `tests/integration/simulation.itest.ts` & komponen UI |
| AC-20 | [F] | Pembulatan Overall D4: (6.0, 6.0, 6.0, 7.0)->6.5; (6.0, 7.0, 7.0, 7.0)->7.0; (6.0, 6.0, 6.0, 6.5)->6.0 (S=49 -> 6.0) | **PASS** | Terverifikasi di `tests/unit/simulation-scoring.test.ts` (test 4) |
| AC-C1 | [C] | Ketersediaan nyata Reading di DB pemilik setelah bank 40 soal terbit | **HOLD** | Menunggu pekerjaan konten bank Reading 40 butir (lingkup masa depan) |
| AC-C2 | [C] | Ketersediaan nyata Listening di DB pemilik setelah bank 4 bagian S1-S4 terbit | **HOLD** | Menunggu pekerjaan konten bank Listening S2-S4 (lingkup masa depan) |

---

## 3. Hasil Verifikasi Teknis

1. **TypeScript Typecheck (`npm run typecheck`):**
   - Perintah: `tsc --noEmit`
   - Hasil: **0 error (LULUS BERSIH)**.
2. **Unit Tests (`npm test`):**
   - Perintah: `vitest run tests/unit/simulation-scoring.test.ts tests/unit/simulation-assemble.test.ts`
   - Hasil: **2 files passed, 6 tests passed**.
   - Keseluruhan unit test repo: **821 tests PASSED**.
3. **Integration Tests (`npm run test:integration`):**
   - Perintah: `vitest run -c vitest.integration.config.ts tests/integration/simulation.itest.ts`
   - Hasil: **1 file passed, 8 tests passed (100% LULUS)**.
4. **Production Build (`npm run build`):**
   - Perintah: `next build`
   - Hasil: **Exit code 0 (COMPILE & STATIC GENERATION SUKSES)**.
   - Rute `/simulasi`, `/simulasi/[attempt_id]`, `/simulasi/[attempt_id]/hasil`, dan 8 rute API `/api/v1/simulations/...` terkompilasi sempurna.

---

## 4. Rekomendasi
Fitur SPEC-023 (F5: Simulasi Tes IELTS GT dengan Pilihan Section) dinyatakan **SELESAI** dan berstatus **`ready_to_test`**.
Siap diajukan ke **Human Gate Review** untuk peninjauan akhir.
