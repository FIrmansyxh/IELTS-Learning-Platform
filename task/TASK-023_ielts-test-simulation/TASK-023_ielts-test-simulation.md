# TASK-023 Simulasi Tes IELTS General Training dengan Pilihan Section
**Spec:** `specifications/023_spec_ielts_test_simulation.md`
**Priority:** P1
**Wave:** W9 (urutan build ke-5 dari 5)
**Size:** XL
**Assigned To:** Developer Agent (Backend + Frontend + Konten)
**Dependencies:** TASK-024 (urutan wajib), TASK-022 (bank + `assessment_set_id` nullable), TASK-021 (urutan); TASK-006, TASK-009 (band; tabel `READING_GENERAL` SUDAH ada), TASK-011, TASK-012, TASK-013 (addendum Speaking eksternal), TASK-014 (mesin attempt multi-section), TASK-017
**Current Status:** ready_to_test

---

## Description
Simulasi tes GT dengan pilihan section: learner memilih himpunan tak kosong dari {LISTENING, READING, WRITING, SPEAKING}; server merakit soal dari bank GT terpublikasi, membekukan snapshot pada attempt `MOCK_TEST`, menjalankan section berurutan (Listening -> Reading -> Writing) dengan timer di server, menilai otomatis (Listening/Reading), mengantre LLM (Writing), dan menerima skor Speaking eksternal. Band per section selalu tampil; Overall hanya bila keempat section selesai dinilai; selain itu "Overall parsial". Tampilan selalu memuat "Perkiraan latihan, bukan skor resmi IELTS."

## Acceptance Criteria (dirujuk dari SPEC-023)
- [x] AC-1: {READING, WRITING} -> attempt hanya dua section; Overall tidak tampil, ada label parsial.
- [x] AC-2: empat section -> Overall tampil setelah keempatnya bernilai; Speaking tertahan ("Menunggu skor Speaking") sampai skor dimasukkan.
- [x] AC-3: band Reading memakai `READING_GENERAL`; 34/40 = 7.0, 30/40 = 6.0.
- [x] AC-4: band Writing = (T1 + 2 x T2) / 3 dibulatkan ke 0,5.
- [x] AC-5: kekurangan konten -> `422 SIMULATION_NOT_ENOUGH_CONTENT` dengan daftar section; Listening tidak dapat dipilih sampai ada audio.
- [x] AC-6: refresh memulihkan section aktif dan sisa waktu dari server (pola SPEC-014).
- [x] AC-7: tes unit (perakit, band gabungan), integrasi (alur dua section), endpoint-guards lulus.
- [x] Edge: satu simulasi `IN_PROGRESS` per profil (`409 SIMULATION_IN_PROGRESS`); waktu habis -> kirim otomatis; Writing kosong -> band 0 tanpa panggilan LLM; LLM mati -> fallback nilai-sendiri berlabel "tidak terverifikasi"; Reading/Listening < 40 soal -> section tidak ditawarkan.
- [x] D3: tidak mengulang soal simulasi sebelumnya bila stok cukup; Reading tiga teks berurutan makin sulit.
- [x] D5: hasil memperbarui `user_skill_scores` (radar) dan Riwayat Ujian; tidak menyentuh gatekeeping/Boss.
- [x] D4 pembulatan Overall: rata-rata empat band ke 0,5 terdekat (x.25 -> x.5, x.75 -> bulat berikutnya).

## Subtasks

### Konten
1. Pastikan stok bank GT cukup untuk Reading 40 soal / 3 teks (bank awal TASK-022 hanya 2 teks x 8 soal): tambah teks/soal atau gunakan fixture untuk tes; tentukan jumlah minimal konten rilis.
2. Dokumentasikan kapan Listening ditawarkan (butuh bank 4 bagian beraudio dari TASK-024; saat ini hanya S1).

### Backend
1. Migrasi SQLite (nomor mengikuti urutan `drizzle/`, bukan `0010` Postgres): `attempts.assessment_type` + `MOCK_TEST`; `attempt_sections.section_name`; (nullable `assessment_set_id` diwarisi TASK-022; verifikasi batasan).
2. Perakit tes `src/server/simulation/assemble.ts`: aturan D1/D3, daftar section tersedia, snapshot soal di state, anti-ulang.
3. Mesin attempt multi-section: pakai ulang SPEC-014 per section (timer server, pemulihan); Listening 30 menit + 2 menit periksa, Reading 60, Writing 60 total.
4. Penilaian gabungan: Listening/Reading otomatis dengan tabel band masing-masing (`READING_BAND_SKILL`), Writing = (T1 + 2xT2)/3 -> 0,5, Overall D4 / parsial; Speaking lewat `POST /submissions/speaking-external` dengan `attempt_id` simulasi.
5. Endpoint: `GET /simulations/options`, `POST /simulations`, `GET /simulations/{id}`, `GET .../result`, `POST .../sections/{section}/start|submit`; `auth: 'user'`; endpoint-guards; kode error `SIMULATION_NOT_ENOUGH_CONTENT`, `SIMULATION_IN_PROGRESS`.
6. Integrasi radar (SPEC-017) dan Riwayat Ujian; pastikan tidak ada poin/mahkota yang tak diinginkan (SPEC-016) dan nol efek gatekeeping.
7. Tes: unit (perakit, band gabungan, pembulatan, Writing kosong), integrasi (dua section, 409, 422, pemulihan waktu), guards.

### Frontend
1. `/simulasi`: empat kartu section (centang), ringkasan total waktu, preset "Lengkap" / "Reading + Writing" / "Writing saja", kartu Listening nonaktif bila tak ada konten (dengan alasan).
2. Runner mode ujian tenang (design-system 5.19), timer per section, tanpa gamifikasi; pakai `ReadingWorkspace`, `ListeningPlayer`, editor Writing.
3. Hasil: band per section, Overall atau parsial, disclaimer, tautan "Masukkan skor Speaking" (form + kartu prompt eksternal).
4. Teks Indonesia di `src/i18n/id.ts`; tes komponen + E2E (Reading + Writing).

## File / Area Kode yang Disentuh
- `codes/drizzle/`, `src/db/schema.ts`; `src/server/simulation/*` (baru), `src/server/attempts/*`, `src/server/boss/*` (dipakai ulang), `src/server/band/*`, `src/server/scoring/*`
- `src/app/api/v1/simulations/**` (baru), `src/app/api/v1/submissions/speaking-external`
- `src/app/(app)/simulasi/*`, `src/components/simulation/*`, `src/components/exam/*`, `src/i18n/id.ts`
- `content/gt-bank/*` (stok), `tests/unit|integration|e2e`

## Definition of Done
- Semua AC dicentang; typecheck, lint, unit, integrasi, endpoint-guards, E2E hijau.
- dev_log diisi; QA report; status log diperbarui; disclaimer tampil di semua layar hasil.

## Risiko / Catatan
- R1: AC-2 (empat section) tidak dapat dibuktikan end-to-end dengan konten nyata: bank awal tidak punya Reading 40 soal dan Listening hanya S1. Perlu fixture sintetis (C-11) atau diterima sebagai uji dengan data uji saja.
- R2: Hidden dependency pada TASK-014 (Boss, `ready_to_test`) untuk mesin multi-section; bila Boss belum stabil, simulasi mewarisi bug. Dependensi di spec banyak yang belum `done` (R7 di TASK-021 berlaku).
- R3: Spec D2 menyatakan Listening bisa dipilih, tetapi AC-5 melarang sampai ada audio; kombinasi dengan TASK-024 yang hanya mewajibkan S1 berarti Listening 40 soal tidak akan tersedia dalam lingkup task ini.
- R4: Rumus Writing: pembulatan (T1 + 2xT2)/3 ke 0,5 tidak menyebut arah pembulatan x.25/x.75; gunakan aturan sama dengan D4 dan catat.
- R5: SPEC-013 addendum (Speaking eksternal) dan endpoint `speaking-external` dirujuk dengan `attempt_id` simulasi; pastikan endpoint yang ada menerima `MOCK_TEST` dan menautkan ke section SPEAKING.
- R6: Spec memakai `0010_spec_023_simulation.sql` dan `0008_spec_023_reading_general_band` (Postgres, sudah diganti baseline SQLite); koreksi nomor/bahasa SQL. Spec juga menyebut tabel band "dapat diedit admin" - kini lewat `band:import`.
- R7: Timer 30 menit Listening + 2 menit periksa tidak punya aturan untuk audio yang lebih pendek dari 30 menit (hanya S1).

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-08 12:00 | pm agent | task created | - |
| 2026-11-08 23:45 | backend agent | development | Kontrak Zod, scoring D4, assemble D3, service simulasi multi-section, 8 rute API |
| 2026-11-09 00:05 | frontend agent | development | SimulationBuilder, SimulationRunner, SimulationResult, i18n, navigasi, mode tenang |
| 2026-11-09 00:25 | qa agent | ready_to_test | PASS: typecheck 0 error, unit 821 passed, integration 8/8 passed, next build exit 0 |
| 2026-11-09 00:30 | orchestrator | ready_to_test | Diajukan ke Human Review Gate untuk evaluasi akhir SPEC-023 |
