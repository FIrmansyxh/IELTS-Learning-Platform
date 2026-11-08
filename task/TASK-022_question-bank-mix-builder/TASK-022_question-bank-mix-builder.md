# TASK-022 Bank Soal Modular dan Mix Builder (IELTS General Training)
**Spec:** `specifications/022_spec_question_bank_mix_builder.md`
**Priority:** P1
**Wave:** W9 (urutan build ke-2 dari 5)
**Size:** L
**Assigned To:** Developer Agent (Backend + Frontend + Konten)
**Dependencies:** TASK-025d (fondasi lokal); TASK-004 (kontrak konten), TASK-006 (mesin soal), TASK-017 (radar; bobot AUTO_WEAKNESS). Pengganti SPEC-019/020 (importer/kurasi UI) = CLI `bank:validate` + `content:import` (TASK-019/020 SUPERSEDED).
**Current Status:** in_progress

---

## Description
Menyediakan bank soal GT modular (kontrak bank 1.0, taksonomi `bank_kind` D2) dan Mix Builder `/latihan/campur`: learner memilih skill/tipe/kesulitan/jumlah (MANUAL) atau "Campur otomatis" berbobot kelemahan (AUTO_WEAKNESS). Attempt bertipe `MIX_PRACTICE` tidak memengaruhi gatekeeping, memberi umpan balik instan, dan menulis ke `user_skill_scores`.

Catatan keadaan awal: berkas `codes/content/gt-bank/` (grammar-register, reading, speaking, writing-task1, writing-task2) dan `scripts/bank-validate.ts` SUDAH ada dari ADR-004; task ini memverifikasi dan melengkapi terhadap AC, serta membangun sisi runtime (impor ke DB, pemilih, attempt, UI).

## Acceptance Criteria (dirujuk dari SPEC-022)
- [ ] AC-1: `bank:validate` menerima bank awal di `codes/content/gt-bank/` dan menolak: ID duplikat, jawaban di luar opsi, `passage_no` tanpa teks, ID yang terbaca sebagai slot variasi (D3).
- [ ] AC-2: bank awal mencakup Writing T1 (3 register x 3) + T2 x 9, Speaking P1 x 9 + P2 x 6 + P3 x 6, Reading 2 teks x 8 soal, Grammar register >= 16 soal.
- [ ] AC-3: `POST /api/v1/mix-sessions` mode `MANUAL` mengembalikan tepat `count` soal unik sesuai filter; `AUTO_WEAKNESS` memilih skill terlemah lebih sering (uji statistik, seed tetap).
- [ ] AC-4: attempt `MIX_PRACTICE` tidak mengubah status gatekeeping/Boss.
- [ ] AC-5: kunci jawaban tidak ada di respons bank/mix sebelum soal dijawab.
- [ ] AC-6: tes endpoint-guards, unit pemilih campuran, dan integrasi migrasi lulus.
- [ ] Edge: `422 MIX_NOT_ENOUGH_QUESTIONS` (dengan jumlah tersedia); bank Reading dibawa utuh (soal dipotong per teks); `PENDING_AUDIO` tak pernah dipilih; pengguna tanpa riwayat -> bobot seragam; bank non-`PUBLISHED` tak tampil; Writing/Speaking maks 1 per sesi (D5).
- [ ] UI: Mix Builder (kartu skill, chip tipe, penggeser jumlah, "Campur otomatis"), hasil per skill/tipe + saran bank; kartu Speaking "Salin prompt" + disclaimer.

## Subtasks

### Konten / Tooling
1. Audit `content/gt-bank/*.json` terhadap AC-2 (hitung per kind) dan kontrak bank 1.0 (definisikan Zod `QuestionBankSchema` di kontrak konten bila belum).
2. Perluas `bank-validate.ts` untuk 4 aturan penolakan AC-1 + `listening_asset_code` placeholder (`PENDING_AUDIO`) untuk dipakai TASK-024.
3. Perluas `content:import` agar mengimpor `question_banks[]` ke `assessment_sets` (`QUESTION_BANK`), idempoten, publikasi lewat status `PUBLISHED`.

### Backend
1. Migrasi SQLite baru (nomor mengikuti urutan `drizzle/` saat ini, BUKAN `0009` Postgres di spec): `assessment_sets.set_type` + `QUESTION_BANK`, `bank_kind`, `exam_module` default `GENERAL_TRAINING`, `tags` (TEXT JSON); `attempts.assessment_type` + `MIX_PRACTICE`; `attempts.assessment_set_id` nullable untuk `MIX_PRACTICE` (periksa NOT NULL/FK/CHECK/view dulu; SQLite butuh rebuild tabel).
2. Layanan pemilih campuran (`src/server/mix/*`): filter, `MANUAL` acak seragam bersemai, `AUTO_WEAKNESS` (bobot skill = (10 - radar)/jumlah; bobot tipe = 1 + salah 30 hari; benar 2x berturut = 0,3), tanpa duplikat, paket Reading utuh, batas Writing/Speaking 1.
3. `GET /api/v1/banks` (tanpa kunci), `POST /api/v1/mix-sessions` (snapshot soal di `attempt_state`, acak opsi CSPRNG seperti SPEC-006), `auth: 'user'` eksplisit, daftar di endpoint-guards.
4. Integrasi attempt/submit existing: `MIX_PRACTICE` pada `attempts`, tulis `user_skill_scores`, nol efek gatekeeping/Boss/gamifikasi yang tak diinginkan (periksa poin SPEC-016).
5. Soal Writing di campuran -> submission Writing (antrean AI dalam proses); Speaking -> kartu prompt eksternal.
6. Tes: unit pemilih (statistik seed tetap), integrasi migrasi + alur mix, endpoint-guards.

### Frontend
1. Halaman `/latihan/campur`: kartu skill, chip tipe, slider jumlah (5-40), tombol "Campur otomatis (fokus kelemahan)", penanganan `MIX_NOT_ENOUGH_QUESTIONS`.
2. Pemakaian ulang runner soal (SPEC-006) dan `ReadingWorkspace` untuk bank Reading.
3. Halaman hasil: rincian per skill/tipe, saran bank berikutnya, kartu Speaking + disclaimer.
4. Teks Indonesia di `src/i18n/id.ts`; tautan menu; tes komponen.

## File / Area Kode yang Disentuh
- `codes/content/gt-bank/*.json`, `codes/scripts/bank-validate.ts`, `codes/scripts/content-import.ts`, `src/server/content/*` (kontrak/validator)
- `codes/drizzle/` + `src/db/schema.ts`, `src/server/db-migrate.ts`
- `src/server/mix/*` (baru), `src/app/api/v1/banks`, `src/app/api/v1/mix-sessions` (baru), `src/server/attempts/*`, `src/server/scoring/*`
- `src/app/(app)/latihan/campur/*`, `src/components/mix/*`, `src/i18n/id.ts`
- `tests/unit`, `tests/integration`, `tests/e2e`

## Definition of Done
- Semua AC dicentang; typecheck, lint, unit, integrasi, endpoint-guards, E2E (satu alur MANUAL + satu AUTO) hijau.
- Tidak ada kunci jawaban pada respons sebelum dijawab (tes negatif).
- dev_log diisi; QA report; status log diperbarui.

## Risiko / Catatan
- R1: Spec menulis "Admin mengimpor via `POST /api/v1/admin/import-batches`" dan `GET /api/v1/admin/banks`. Admin/importer sudah dihapus (SPEC-025). Alur pengganti: `bank:validate` + `content:import`. Spec perlu dikoreksi Analyst (task ini tidak membangun endpoint admin).
- R2: Spec memakai tipe Postgres (`text[]`, `enum`, migrasi `0009`); wajib dipetakan ke SQLite sesuai SPEC-025 D8.
- R3: Perubahan `attempts.assessment_set_id` nullable juga dibutuhkan TASK-023 (`MOCK_TEST`); kerjakan sekali di sini agar migrasi 023 tinggal menambah nilai enum.
- R4: Depends on TASK-019/020 secara nominal (SUPERSEDED); dependensi efektif = importer berbasis CLI.
- R5: Ketidakjelasan: "AUTO_WEAKNESS" butuh data radar per skill; spec tidak mendefinisikan bobot untuk skill tanpa skor radar (diasumsikan seragam) dan tidak mendefinisikan bobot tipe untuk skill non-objektif.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-08 12:00 | pm agent | task created | - |
| 2026-11-08 17:00 | backend | development started | - |
| 2026-11-08 18:30 | backend | backend implemented; AC otomatis hijau kecuali E2E Playwright (AC-15) | status tetap in_progress; lihat dev_log |
| 2026-11-08 17:05 | frontend | development started | - |
| 2026-11-08 17:20 | frontend | ready for QA/integration | UI Mix Builder, sesi, hasil, nav, i18n, 33 tes; uji FE-BE nyata dan E2E belum (lihat dev_log bagian Frontend) |
