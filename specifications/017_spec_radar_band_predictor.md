# SPEC-017: Radar 6 Sumbu & Prediksi Band IELTS (TRK-02)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-006, SPEC-007, SPEC-009, SPEC-012, SPEC-013, SPEC-014
- **Prioritas:** P0
- **Cakupan:** Backend (agregasi skor per skill, prediksi, riwayat) + Frontend (kartu radar, riwayat ujian, grafik perkembangan)

## User Story
Sebagai Learner, saya ingin melihat grafik radar kesiapan saya pada enam keterampilan (Listening, Reading, Writing, Speaking, Grammar, Vocabulary) beserta prediksi Overall Band saat ini dan riwayat hasil ujian saya, sehingga saya tahu kelemahan saya dan seberapa dekat saya ke target band.

## Non-Goals / Out of Scope
- Prediksi band bukan penilaian resmi; selalu berdisclaimer "Perkiraan latihan, bukan skor resmi IELTS."
- Grammar dan Vocabulary TIDAK masuk rumus Overall Band (hanya Listening, Reading, Writing, Speaking).
- Tidak ada prediksi dari Placement Test (tidak menulis `user_band_predictions` dengan `trigger='PLACEMENT'`).
- Self-assessment dan evaluasi AI bertanda `injection_suspected` TIDAK dihitung ke radar atau prediksi.
- Tidak ada perbandingan antar pengguna, target otomatis, atau rekomendasi materi.
- Tidak ada hitung ulang riwayat (tidak ada backfill sebelum spec ini aktif).
- Tidak ada ekspor data atau PDF laporan.
- Tidak mengubah gerbang kurikulum.

## Definisi Tetap
**R1. Skill objektif (LISTENING, READING, GRAMMAR, VOCAB).** Sampel = 50 baris `attempt_answers` terbaru (urut `answered_at DESC`) milik user dengan `skill` = skill itu, `is_correct IS NOT NULL`, dari attempt berstatus `GRADED` atau `EXPIRED` (semua tipe attempt termasuk Placement dan Boss). `sample_size` = jumlah baris (maks 50). `score_percent = round_half_up(100 * benar / sample_size, 2)` (0 baris -> tidak ada baris skor). `estimated_band`: bila `sample_size >= 5`: `raw_40 = scaleToForty(benar, sample_size)` (SPEC-009) lalu `convertRawToBand` memakai tabel aktif `LISTENING` untuk LISTENING dan tabel aktif `READING_ACADEMIC` untuk READING, GRAMMAR, dan VOCAB; selain itu `null`. `is_proxy = true` untuk GRAMMAR dan VOCAB (tabel Reading dipakai sebagai proksi), `false` lainnya.
**R2. Skill AI (WRITING, SPEAKING).** Sampel = hingga 3 submission terbaru (`created_at DESC`) user dengan `kind` Writing (`WRITING_TASK1`, `WRITING_TASK2`, `MINI_TASK_WRITING`) atau Speaking (`SPEAKING_PART1/2/3`, `MINI_TASK_SPEAKING`) yang punya evaluasi memenuhi: `method='AI_LOCAL'`, `flags.injection_suspected = false`, `overall_band IS NOT NULL` (dipakai evaluasi dengan `run_number` tertinggi per submission). `estimated_band = averageBand(overall_band sampel)`; `score_percent = round_half_up(estimated_band / 9 * 100, 2)`; `sample_size` = jumlah submission terpakai (>= 1; tanpa sampel -> tidak ada baris skor). `is_proxy=false`.
**R3. Pemicu hitung ulang** (dalam transaksi pemicu): (a) `attemptCompletedHooks` (setelah gamifikasi): skill yang muncul pada `attempt_answers` attempt itu; untuk Boss semua skill L/R/G/V yang ada; (b) `evaluationGradedHooks` (SPEC-012/013) setelah evaluasi disimpan: WRITING atau SPEAKING milik pemilik submission; (c) idempoten: hasil hitung ulang pada data sama identik. Baris disimpan di `user_skill_scores` (UPSERT PK `(user_id, skill)`).
**R4. Prediksi.** Komponen `L, R, W, S` = `estimated_band` skill terkait (null bila tidak ada). `complete = (keempatnya bukan null)`. `overall_band = complete ? overallBand(L,R,W,S) : null`. `indicative_band = averageBand(komponen non-null)` (null bila semuanya null). `x = overall_band ?? indicative_band`. `range_low = max(0, x - 0.5)`, `range_high = min(9, x + 0.5)` (null bila `x` null). `basis_note`: `complete=true` -> "Berdasarkan Listening, Reading, Writing, dan Speaking."; `complete=false` -> "Indikatif: berdasarkan {daftar skill yang tersedia}. Selesaikan Writing dan Speaking untuk prediksi lengkap."
**R5. Riwayat prediksi** (`user_band_predictions`; kolom `overall_band` NOT NULL): ditulis (a) setelah attempt Boss selesai (`trigger='BOSS'`, `attempt_id` = attempt Boss) bila `x` tidak null; (b) pada hitung ulang lain (`trigger='RECALC'`) hanya bila `x` berbeda dari `overall_band` baris terbaru user (atau belum ada baris) dan `x` tidak null. `overall_band` baris = `x`; `components` jsonb = `{"LISTENING":6.5,"READING":6.0,"WRITING":null,"SPEAKING":null}`.
**Vektor uji:** 50 jawaban LISTENING dengan 40 benar -> `score_percent=80.00`, `raw_40=32`, `estimated_band=7.5` (tabel seed LISTENING 32-34 = 7.5); 4 jawaban READING (3 benar) -> `score_percent=75.00`, `estimated_band=null`; GRAMMAR 20 jawaban 12 benar -> 60.00, `raw_40=24`, band 6.0 (tabel READING 23-26), `is_proxy=true`; evaluasi Writing `[6.0, 6.5, 5.5]` -> `estimated_band=6.0`, `score_percent=66.67`; komponen (7.0, 6.0, 6.0, 6.5) -> `overall_band=6.5` (rata-rata 6.375), `range 6.0-7.0`; komponen hanya (6.5, 6.0) -> `indicative_band=6.5` (rata-rata 6.25), `complete=false`, `overall_band=null`, `range 6.0-7.0`.

## Technical Flow
1. Spec ini mendaftarkan `attemptCompletedHooks` -> `skillScoreHook` dan `evaluationGradedHooks` -> `skillScoreEvaluationHook`.
2. Learner menyelesaikan attempt; `skillScoreHook` menghitung ulang skill terkait (R1), lalu menghitung prediksi (R4) dan menulis riwayat (R5).
3. Evaluasi AI selesai (worker); `skillScoreEvaluationHook` menghitung ulang WRITING/SPEAKING (R2), prediksi, dan riwayat `RECALC`.
4. Learner membuka `/`; klien memanggil `GET /api/v1/me/skills/radar` dan menampilkan `RadarCard`.
5. Learner membuka `/riwayat/ujian`; klien memanggil `GET /api/v1/me/exam-history` dan `GET /api/v1/me/band-predictions`.
6. Server hanya membaca baris milik `userId` sesi dan tidak pernah menghitung berat saat membaca (data sudah teragregasi).

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/skills.ts`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `RATE_LIMITED`, `INTERNAL_ERROR`. Semua endpoint **Auth: user**, hanya data milik pemanggil.

### GET /api/v1/me/skills/radar
- **Success status:** 200 | **Zod:** `RadarResponseSchema`
**Response (Success):**
```json
{ "data": {
  "skills": [
    { "skill": "LISTENING", "score_percent": 80.0, "estimated_band": 7.5, "sample_size": 50, "is_proxy": false, "updated_at": "2026-11-03T10:34:12.000Z" },
    { "skill": "READING", "score_percent": 75.0, "estimated_band": null, "sample_size": 4, "is_proxy": false, "updated_at": "2026-11-03T10:34:12.000Z" },
    { "skill": "WRITING", "score_percent": 66.67, "estimated_band": 6.0, "sample_size": 3, "is_proxy": false, "updated_at": "2026-11-03T10:40:41.000Z" },
    { "skill": "SPEAKING", "score_percent": null, "estimated_band": null, "sample_size": 0, "is_proxy": false, "updated_at": null },
    { "skill": "GRAMMAR", "score_percent": 60.0, "estimated_band": 6.0, "sample_size": 20, "is_proxy": true, "updated_at": "2026-11-03T10:34:12.000Z" },
    { "skill": "VOCAB", "score_percent": null, "estimated_band": null, "sample_size": 0, "is_proxy": true, "updated_at": null } ],
  "target_band": 6.5,
  "prediction": { "overall_band": null, "indicative_band": 7.0, "range_low": 6.5, "range_high": 7.5, "complete": false,
    "components": { "LISTENING": 7.5, "READING": null, "WRITING": 6.0, "SPEAKING": null },
    "basis_note": "Indikatif: berdasarkan Listening dan Writing. Selesaikan Writing dan Speaking untuk prediksi lengkap." },
  "disclaimer": "Perkiraan latihan, bukan skor resmi IELTS." } }
```
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `skills[]` | array tepat 6 elemen | tidak | urutan tetap `LISTENING, READING, WRITING, SPEAKING, GRAMMAR, VOCAB` |
| `skills[].score_percent` | number 0-100 | ya | null bila tanpa sampel |
| `skills[].estimated_band` | number 0-9 (0.5) | ya | R1/R2 |
| `skills[].sample_size` | int | tidak | |
| `skills[].is_proxy` | boolean | tidak | true untuk GRAMMAR, VOCAB |
| `target_band` | number | ya | `users.target_band` |
| `prediction.*` | | | R4; `overall_band`, `indicative_band`, `range_low`, `range_high` nullable |
**Response (Error):** hanya kode umum.

### GET /api/v1/me/band-predictions
- **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `page` | int | tidak | >= 1, default 1 |
| `page_size` | int | tidak | 1-100, default 20 |
Urutan `created_at ASC` (untuk grafik).
**Response (Success):**
```json
{ "data": [ { "id": "11aa22bb-0001-4000-8000-000000000001", "overall_band": 5.0, "components": { "LISTENING": 5.5, "READING": 4.5, "WRITING": null, "SPEAKING": null }, "trigger": "BOSS", "attempt_id": "9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a", "created_at": "2026-11-01T12:00:00.000Z" } ], "meta": { "page": 1, "page_size": 20, "total": 1 } }
```
`trigger`: `BOSS` \| `RECALC`; `attempt_id` null untuk `RECALC`.

### GET /api/v1/me/exam-history
- **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `assessment_type` | enum | tidak | `SKIP_MODULE_TEST` \| `SKIP_TIER_TEST` \| `TIER_BOSS_EXAM` \| `PLACEMENT_TEST` |
| `page`, `page_size` | int | tidak | seperti di atas |
Hanya attempt `EXAM` berstatus `GRADED`/`EXPIRED`, urutan `submitted_at DESC`.
**Response (Success):**
```json
{ "data": [ { "attempt_id": "9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a", "assessment_type": "TIER_BOSS_EXAM", "title": "Boss Stage Tier 2", "status": "GRADED", "score_percent": 57.5, "band_score": 6.0, "passed": true, "submitted_at": "2026-11-01T12:00:00.000Z", "result_path": "/ujian/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/hasil" } ], "meta": { "page": 1, "page_size": 20, "total": 1 } }
```
`band_score` dan `passed` nullable (null untuk Placement); `title` = judul set.
**Response (Error):** `VALIDATION_ERROR` (400) bila `assessment_type` bukan nilai di atas.

## Database Changes
Tidak ada tabel/kolom baru. Menulis `user_skill_scores` (`user_id`, `skill`, `score_percent`, `estimated_band`, `sample_size`, `updated_at`) dan `user_band_predictions` (`user_id`, `overall_band`, `components`, `trigger`, `attempt_id`). Penulisan hanya lewat `SkillScoreService` (`src/server/skills/service.ts`); skor tidak dapat diedit manual. Untuk performa `GET .../radar` membaca 6 baris PK; riwayat memakai indeks `band_pred_user_idx`. Kolom `trigger` hanya bernilai `BOSS` atau `RECALC` (nilai `PLACEMENT` pada komentar `schema.reference.ts` tidak dipakai).

## UI/UX
Rujukan: `design-system.md` 5.17 Radar 6 Sumbu + Prediksi Band, 2.4 warna 6 keterampilan, 5.6 Table, 5.7 Badge/Skeleton, 8.1 wireframe Dashboard.

- **`RadarCard`** (slot dashboard `/`, di bawah `StatsCard`): Recharts `RadarChart` dengan sumbu Listening, Reading, Writing, Speaking, Grammar, Vocabulary; skala 0-9 (nilai = `estimated_band`; null digambar 0 dan sumbu diberi penanda "belum cukup data"); cincin tiap 1.0 (garis `border`); isi `primary` 20%, garis 2px, titik 6px; garis target (`target_band`) putus-putus `secondary` dengan legenda; label sumbu tidak dirotasi, font >= 12px; di lebar < 400px singkatan (Lis, Rea, Wri, Spk, Gra, Voc) dengan legenda lengkap. Tooltip nilai pada tap/focus. Animasi masuk 400 ms (mati pada reduced motion).
- **Kartu Prediksi:** `BandBadge` besar (`overall_band` atau `indicative_band` dengan label "Indikatif" bila `complete=false`), rentang ("6.0-7.0"), `basis_note`, `EstimasiNotice`.
- **Tabel alternatif:** toggle "Lihat sebagai tabel" menampilkan Table (Skill, Skor %, Band, Sampel, Catatan "Proksi" untuk Grammar/Vocab) dan `aria-label` ringkasan ("Skor terendah: Reading belum cukup data; tertinggi: Listening 7.5").
- **Empty state:** "Selesaikan latihan pertama untuk melihat radar Anda." (tanpa chart kosong).
- **Riwayat** `/riwayat` (alihkan ke `/riwayat/ujian`) dengan Tabs "Ujian | Penilaian AI" (tab kedua = SPEC-012): `/riwayat/ujian` berisi grafik garis "Perkembangan Band" (`GET /band-predictions`, sumbu Y 0-9, sumbu X tanggal, tabel alternatif) dan Table riwayat ujian (Tanggal, Jenis, Skor, Band, Hasil (ikon + teks "Lulus"/"Belum lulus"/"-"), tautan "Lihat"); mobile: daftar kartu; kosong: "Belum ada riwayat. Mulai latihan pertama Anda."
- State: loading Skeleton setinggi chart; error memuat: Card "Gagal memuat radar" + Button "Coba lagi".
- Aksesibilitas: ringkasan teks untuk setiap chart, warna tidak menjadi satu-satunya penanda, kontras >= 4.5:1.

## Acceptance Criteria
- [ ] **Given** user tanpa jawaban apa pun **When** `GET /me/skills/radar` **Then** 200, `skills` tepat 6 elemen berurutan, semua `score_percent=null`, `sample_size=0`, `prediction.complete=false`, `prediction.overall_band=null`, `indicative_band=null`.
- [ ] **Given** vektor uji R1 (50 jawaban LISTENING, 40 benar) **When** dihitung ulang **Then** `score_percent=80.00`, `estimated_band=7.5`, `sample_size=50`; **Given** 60 jawaban **Then** hanya 50 terbaru dipakai.
- [ ] **Given** 4 jawaban READING (3 benar) **When** dihitung **Then** `score_percent=75.00`, `estimated_band=null`, `sample_size=4`.
- [ ] **Given** GRAMMAR 12 benar dari 20 **When** dihitung **Then** `score_percent=60.00`, `estimated_band=6.0`, `is_proxy=true`.
- [ ] **Given** soal AI (`is_correct IS NULL`) pada attempt **When** dihitung **Then** tidak masuk sampel objektif.
- [ ] **Given** attempt `IN_PROGRESS` **When** dihitung **Then** jawabannya tidak masuk sampel.
- [ ] **Given** evaluasi Writing AI_LOCAL `[6.0, 6.5, 5.5]` **When** dihitung **Then** `estimated_band=6.0`, `score_percent=66.67`, `sample_size=3`; submission ke-4 yang lebih baru menggeser submission tertua keluar sampel.
- [ ] **Given** hanya evaluasi `SELF_ASSESSMENT` atau yang `injection_suspected=true` **When** dihitung **Then** WRITING tanpa baris skor (`score_percent=null`).
- [ ] **Given** komponen (L 7.0, R 6.0, W 6.0, S 6.5) **When** prediksi dihitung **Then** `overall_band=6.5`, `complete=true`, `range_low=6.0`, `range_high=7.0`; komponen hanya (6.5, 6.0) -> `overall_band=null`, `indicative_band=6.5`, `complete=false`.
- [ ] **Given** Boss selesai dengan L dan R saja **When** hook berjalan **Then** satu baris `user_band_predictions` `trigger="BOSS"`, `attempt_id` benar, `overall_band` = `indicative_band`, `components` memuat W dan S null.
- [ ] **Given** evaluasi Writing selesai dan `x` berubah **When** hook berjalan **Then** baris `RECALC` ditulis; bila `x` sama dengan baris terbaru -> tidak ada baris baru.
- [ ] **Given** hasil hitung ulang dijalankan dua kali pada data sama **When** dibandingkan **Then** `user_skill_scores` identik (kecuali `updated_at`) dan tidak ada baris prediksi ganda.
- [ ] **Given** user A dan B **When** A memanggil endpoint apa pun **Then** hanya data A muncul (uji tenant; tidak ada parameter `user_id`).
- [ ] **Given** tabel band aktif berganti **When** skill dihitung ulang berikutnya **Then** memakai tabel aktif baru; nilai lama tidak berubah sampai ada pemicu.
- [ ] **Given** `GET /me/exam-history?assessment_type=FOO` **When** dipanggil **Then** 400 `VALIDATION_ERROR`; tanpa filter hanya attempt `EXAM` selesai milik user yang muncul (tidak ada attempt Drill).
- [ ] **Given** `GET /me/skills/radar` **When** diukur lokal **Then** p95 < 100 ms dan tepat <= 3 query SQL.
- [ ] **Given** UI `RadarCard` **When** diuji komponen **Then** 6 sumbu berlabel, garis target hanya muncul bila `target_band` tidak null, toggle tabel menampilkan 6 baris, `aria-label` ringkasan ada, dan `EstimasiNotice` terlihat.
- [ ] **Given** viewport 375x812 **When** dashboard dimuat **Then** label sumbu berupa singkatan (Lis, Rea, Wri, Spk, Gra, Voc), tidak ada scroll horizontal.
- [ ] **Given** E2E Playwright (fixture drill Grammar dan attempt Boss mock) **When** learner menyelesaikan Drill lalu membuka `/` **Then** radar menampilkan Grammar > 0 dan kartu prediksi berlabel "Indikatif"; setelah Boss selesai, `/riwayat/ujian` menampilkan satu titik pada grafik dan satu baris tabel.

## Edge Cases & Validation
- [ ] `users.target_band` null: tidak ada garis target dan legenda target disembunyikan.
- [ ] Tabel band aktif tidak ada (galat konfigurasi): hitung ulang skill objektif tetap menulis `score_percent`, `estimated_band=null`, dan mencatat `error` `band_table_inactive`; endpoint radar tidak gagal.
- [ ] Attempt dihapus/akun dianonimisasi: baris skor dipertahankan tanpa identitas; tidak ada hitung ulang.
- [ ] `sample_size` tepat 5: `estimated_band` dihitung (batas inklusif); 4: null.
- [ ] Evaluasi tanpa `flags` (data lama): diperlakukan `injection_suspected=false`.
- [ ] Kegagalan hook skor membatalkan transaksi pemicu (attempt tetap `IN_PROGRESS` / evaluasi tidak tersimpan) dan dicatat `error`.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft |
