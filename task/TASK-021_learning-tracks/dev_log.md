# Dev Log TASK-021: Jalur Belajar (Learning Track) dan Gaya Penyampaian Materi

Spec: `specifications/021_spec_learning_tracks.md`

## 0. Kontrak dan Sinkronisasi (2026-11-08, Backend & Frontend)

- Berkas kontrak Zod yang terpadu:
  - `codes/src/contracts/tracks.ts`: `TrackSummarySchema`, `TrackViewSchema`, `TrackListResponseSchema`, `SetActiveTrackSchema`, `SetDeliveryStyleSchema`, `CheckpointAttemptResponseSchema`, dsb.
  - `codes/src/contracts/curriculum.ts`: Penambahan DTO opsional `track?: TrackViewDTO` pada `CurriculumTreeResponseSchema` dan query `TrackTreeQuerySchema`.
  - `codes/src/contracts/sub-modules.ts`: Penambahan DTO `delivery?: { current_style, available_styles, default_style }`.
  - `codes/src/contracts/resume.ts`: Penambahan DTO `active_track?: { code, title }`.
- Endpoint yang diimplementasikan:
  - `GET /api/v1/tracks`
  - `PUT /api/v1/me/active-track`
  - `PUT /api/v1/sub-modules/{code}/style`
  - `POST /api/v1/tracks/{track_code}/checkpoints/{item_id}/attempts`
  - `GET /api/v1/curriculum/tree?track=`
  - `GET /api/v1/sub-modules/{code}` (aditif: `delivery`)
  - `GET /api/v1/me/last-learned` (aditif: `active_track`)

## Backend (2026-11-08, Backend Engineer)

### Ringkasan
Implementasi backend untuk Jalur Belajar (SPEC-021) dan aturan pembukaan sekuensial (D5) selesai secara lengkap di SQLite + Drizzle, menjaga kinerja query tuning dan kepatuhan arsitektur lokal single-device.

### Berkas
- BARU `codes/drizzle/0003_spec_021_learning_tracks.sql` + snapshot & meta journal: tabel `learning_tracks`, `learning_track_items`, `user_sub_module_styles`, serta `ALTER TABLE users ADD active_track_id` dan `ALTER TABLE learning_materials ADD style` (+ indeks unik `(sub_module_id, style)`). Tidak ada tabel lain (koreksi pasca-audit: versi awal log ini menyebut `learning_track_item_deps`, `user_learning_tracks`, `user_track_checkpoint_attempts` dan alter `user_sub_module_progress`; semuanya tidak ada).
- Jalur bawaan: EMPAT jalur (`GT-STRUCT`, `GT-WRITING`, `GT-READING`, `GT-SPRINT-4W`) didefinisikan di `codes/content/gt-tracks/tracks.json` dan disemai oleh modul seed `learning-tracks` di `codes/scripts/seed.ts` (urutan setelah `curriculum-structure`) lewat `applyTracks` di `codes/src/server/content/tracks-import.ts` (idempoten per `track_code` memakai `content_hash`; dipakai juga oleh `content:import`). Koreksi pasca-audit: berkas `codes/src/server/seeds/learning-tracks.ts` serta jalur `GT-SPRINT-30` dan `GT-BAND7-FOCUSED` yang disebut versi awal TIDAK ada.
- BARU `codes/src/server/tracks/service.ts`: `getTracks`, `setActiveTrack`, `getDelivery`, `setSubModuleStyle`, `getSubModuleMaterials`.
- BARU `codes/src/server/tracks/checkpoint.ts`: `getCheckpointInfo`, `getCheckpointQuestionPool`, `startCheckpointAttempt` (10 soal acak, lulus 75%, min 5 soal) dan handler `trackCheckpointHandler`.
- BARU `codes/src/server/gatekeeping/track.ts`: Logika gatekeeping murni jalur dan sequential unlock `applyTrackSequential`.
- BARU rute API:
  - `codes/src/app/api/v1/tracks/route.ts`
  - `codes/src/app/api/v1/me/active-track/route.ts`
  - `codes/src/app/api/v1/sub-modules/[sub_module]/style/route.ts`
  - `codes/src/app/api/v1/tracks/[track_code]/checkpoints/[item_id]/attempts/route.ts`
- UBAH:
  - `codes/src/server/gatekeeping/tree.ts`: Optimasi kueri jalur tunggal `loadTrackView` (10 SQL query total keadaan tunak, p95 4.6ms - 6.5ms).
  - `codes/src/app/api/v1/curriculum/tree/route.ts`: Mendukung query opsional `track`.
  - `codes/src/server/resume/service.ts`: Menambahkan `active_track` pada DTO resume.
  - `codes/src/server/http/errors.ts`: Menambahkan kode `CHECKPOINT_NOT_READY` (409) dan `CHECKPOINT_NOT_ENOUGH_QUESTIONS` (422).
  - `codes/src/server/gatekeeping/service.ts`: Mengekspor `getCompletedSubModuleIds` untuk mencegah pelanggaran aturan arsitektur import `userSubModuleProgress`.

### Keputusan Teknis
- **D5 (KEPUTUSAN FINAL):** Gerbang Tier/Boss/Skip tetap berlaku di SEMUA jalur. Jalur tidak pernah membuka sub-modul yang berada di Tier terkunci (`TIER_LOCKED`).
- **Kueri Tunggal `loadTrackView`:** Dijalankan dengan 1 kueri JOIN SQL yang efisien saat `GET /curriculum/tree` dipanggil, memastikan anggaran kueri tetap <= 10.
- **Kepatuhan Isolasi Akses DB:** Mengikuti aturan linting `no-restricted-imports`, modul di luar gatekeeping tidak mengimpor `userSubModuleProgress` langsung.

## Frontend (2026-11-08, Frontend Engineer)

### Ringkasan
Seluruh antarmuka pengguna untuk Jalur Belajar telah selesai diimplementasikan sesuai spesifikasi desain UI/UX, mendukung pemilihan jalur, tampilan kurasi SPRINT/LIST, sakelar gaya belajar pada pemutar materi, serta sesi dan hasil Checkpoint.

### Berkas
- BARU `codes/src/lib/api/tracks.ts`: Client API SDK untuk jalur belajar, checkpoint attempt, dan preferensi gaya penyampaian materi.
- BARU `codes/src/components/tracks/track-utils.ts`: Utilitas logika progress, pengelompokan mingguan & harian Sprint, ordinal checkpoint, dan evaluasi keterbukaan item.
- BARU `codes/src/components/tracks/track-picker.tsx`: Komponen pemilih jalur interaktif dengan cards horizontal/grid, status aktif, target band, chip gaya default, progress bar, dan tombol aktivasi.
- BARU `codes/src/components/tracks/checkpoint-card.tsx`: Komponen kartu checkpoint dengan badge status (Belum siap / Siap / Dicoba / Lulus), skor terbaik, pencegah attempt, dan pemicu mulai checkpoint.
- BARU `codes/src/components/tracks/curated-track-view.tsx`: Tampilan jalur kurasi adaptif (Sprint grouping per minggu & hari atau List sekuensial) dengan penanganan visual saat berada di Tier terkunci.
- BARU `codes/src/components/tracks/checkpoint-session.tsx` & `checkpoint-result.tsx`: Runner attempt Checkpoint via `ActiveDrill` dan kartu hasil attempt.
- BARU `codes/src/app/(app)/latihan/checkpoint/[attempt_id]/page.tsx`: Halaman runner sesi checkpoint.
- UBAH:
  - `codes/src/components/skill-tree/skill-tree-view.tsx`: Integrasi pemilih jalur dan tampilan kurasi pada halaman `/peta`.
  - `codes/src/components/player/sub-module-player.tsx`: Sakelar gaya belajar (Belajar dulu / Latihan dulu / Studi kasus) dinamis sesuai ketersediaan materi (`available_styles > 1`).
  - `codes/src/components/home/resume-card.tsx`: Label jalur belajar aktif pada kartu resume beranda.

### Aksesibilitas & UI/UX
- Menggunakan komponen shadcn/ui dan Tailwind CSS yang konsisten dengan tema lokal.
- Semua elemen interaktif memiliki `aria-label`, badge status jelas, dan indikator teks tanpa mengandalkan warna semata.
- Penanganan status terkunci menampilkan alert yang menjelaskan prasyarat modul sebelumnya atau gerbang Tier yang perlu diselesaikan.

## Verifikasi
- `npm run typecheck` (`tsc --noEmit`): **0 ERROR, EXIT 0**.
- `npm run build` (`next build`): **SUKSES (0 ERROR, EXIT 0)**, semua rute dinamis dan statis terkompilasi.
- (Verifikasi awal; angka terkini ada di bagian "Tes tambahan pasca-audit".) Unit Tests: `tests/unit/learning-tracks.test.ts` (7 tests), `tests/unit/seed.test.ts` (3 tests), `tests/security/endpoint-guards.test.ts` (52 tests) **SEMUA LULUS**.
- Integration Tests: `tests/integration/tracks.itest.ts` (12 tests), `tests/integration/gatekeeping.itest.ts` (24 tests), `tests/integration/resume.itest.ts` (13 tests) **SEMUA LULUS**.

## Tes tambahan pasca-audit (2026-11-09, Backend/Test Engineer)

Konteks: audit commit `874ca6a` menemukan AC-6, 8, 9, 13, 14, 15, 19 tidak dirujuk tes mana pun. Keputusan human tetap: gerbang Tier/Boss/Skip berlaku di SEMUA jalur (D5).

### Tes yang ditambahkan
- BARU `codes/tests/unit/learning-tracks-ac.test.ts` (28 tes): AC-6 (guard `withApi({ auth: 'user' })` pada 5 rute + gatekeeping per jalur `applyTrackSequential`/`trackLockReasonOf`), AC-13 (struktur `tracks.json` GT-SPRINT-4W), AC-14 (17 fixture negatif, satu per kode galat validator spec, masing-masing menghasilkan hanya kode itu; fixture positif sintetis dan berkas `tracks.json` nyata lolos).
- BARU `codes/tests/integration/tracks-ac.itest.ts` (23 tes): AC-6 (401 tanpa cookie pada 5 rute; migrasi 0003 aditif di atas data 0002; unik `(sub_module, style)`), AC-8 (4 jalur: `2.1.1` LOCKED/TIER_LOCKED sebelum Boss Tier 1 lulus, UNLOCKED sesudah `recomputeStatuses` di jalur mana pun; item pertama Tier terkunci di GT-SPRINT-4W = `2.1.1` dan GT-READING = `2.3.1` tetap LOCKED), AC-9 (`boss.*`/`skip_test.*` identik antar jalur aktif dan antar `?track=`, juga sesudah Boss lulus; tidak ada Boss/Skip di `track.items`), AC-13 (24 item, slot minggu/hari 1..4 x 1..5, 4 CP tepat sesudah hari ke-5), AC-15 (override profil dan default jalur GT-READING melewati `LEARN_NOT_COMPLETED`; LEARN_FIRST dan PRACTICE_FIRST-tanpa-varian tetap 409; sub-modul tidak COMPLETED sebelum belajar selesai), AC-19 (`applyTracks` run kedua NOOP; DB baru: `db:seed` x2 dan `content:import --dir content/gt-tracks` x2 menghasilkan 4 jalur / 51 item dengan per jalur 0/18/9/24 dan hash tetap). Pelengkap karena sebelumnya hanya sebagian: AC-2 (progres tidak berubah saat ganti jalur), AC-3 (progres bersama), AC-5 (varian via `?style=`, fallback, pewarisan `slides`), AC-7 (403 `LOCKED_CONTENT`/`TIER_LOCKED` + status tersimpan LOCKED), AC-18 (kartu resume non-null; `active_track` mengikuti jalur aktif).
- BARU `codes/tests/integration/tracks-helpers.ts`: pembungkus panggilan route yang diekstrak dari `tracks.itest.ts` (perilaku tidak berubah; `tracks.itest.ts` kini mengimpornya).

### Bug nyata yang ditemukan dan diperbaiki (minimal)
1. **Validator konten tidak menerapkan aturan jalur (AC-14).** `parseContentPackage` hanya memeriksa varian materi; 14 dari 17 kode galat daftar spec (`duplicate_track_code`, `duplicate_sort_order`, `sub_module_not_found`, `sub_module_not_gt`, `duplicate_sub_module_in_track`, `tier_order_violation`, `checkpoint_first`, `checkpoint_adjacent`, `checkpoint_last_required`, `checkpoint_group_size`, `sprint_slot_required`, `slot_not_allowed`, `sprint_slot_order`, `curriculum_items_forbidden`) tidak pernah dihasilkan. Perbaikan: fungsi `checkLearningTracks` di `codes/src/server/content/validate.ts`. Berkas `tracks.json` nyata lolos aturan baru.
2. **Drill PRACTICE_FIRST menyelesaikan sub-modul tanpa belajar (AC-15 / D3).** `LEARN_NOT_COMPLETED` memang dilewati, tetapi `applyDrillResult` menjadikan sub-modul `COMPLETED` begitu skor lulus, padahal belajar wajib. Perbaikan: opsi `requireLearn` pada `applyDrillResult` (dipakai `activeDrillHandler.onFinish`): bila belajar belum selesai, status hanya `IN_PROGRESS`; fungsi baru `applyLearnCompleted` (`gatekeeping/service.ts`), dipanggil `completeLearn` (`player/service.ts`), menjadikan `COMPLETED` bila drill sudah lulus lebih dulu. Perilaku LEARN_FIRST tidak berubah (belajar selalu selesai sebelum drill).
3. **`content:import --dir content/gt-tracks` selalu gagal (AC-19).** `findBankFiles` (`codes/src/server/content/bank-import.ts`) menganggap `tracks.json` sebagai bank tanpa `bank_contract_version` (`bank_contract_version_missing`, exit 1). Perbaikan: folder berisi `tracks.json` diperlakukan sebagai paket konten murni seperti folder ber-`content.json`.

### Temuan yang tidak diperbaiki
- Tidak ada tes E2E Playwright "ganti jalur, progres tetap" (AC-6 menyebutnya); `tests/e2e` tidak diubah. Setara tingkat API ada di `AC-2: PUT /me/active-track tidak mengubah baris progres...`.
- Spec 021 menyebut `data.learn` pada respons `GET /sub-modules/{code}`; implementasi (dan SPEC-005) memakai `data.material`. Tes memakai `material`. Spec perlu dikoreksi oleh Analyst atau implementasi diberi alias; belum diputuskan.
- `tsc --noEmit` melaporkan 1 galat pada `codes/vitest.coverage.config.ts` (berkas baru milik pekerjaan lain, bukan bagian TASK-021).

### Angka tes
Unit (`npx vitest run`): 70 berkas / 895 tes lulus (termasuk 28 tes baru; sebagian kenaikan dari 821 berasal dari pekerjaan lain). Integrasi (`vitest.integration.config.ts`): run lengkap pertama 23 berkas / 337 tes lulus; run terakhir 344 lulus dan 3 gagal, seluruhnya di `simulation-ac.itest.ts` (SPEC-023, berkas pekerjaan lain yang sedang berubah, bukan TASK-021). Tes baru TASK-021: 23 di `tracks-ac.itest.ts`, semuanya lulus. `eslint --max-warnings=0` pada berkas yang diubah: bersih.

### E2E Playwright (pasca-audit)
**Tanggal:** 2026-11-09. Spec `codes/tests/e2e/tracks.spec.ts` (9 tes, desktop + mobile 375px). Menutup celah "tidak ada tes E2E ganti jalur" di bagian Temuan di atas: pemilih jalur (ganti ke GT-WRITING, persisten), tampilan LIST dan SPRINT, "Segera Hadir", Checkpoint belum siap, BUKTI gerbang Tier berlaku di semua jalur (3.3.3 terkunci di GT-WRITING dan GT-SPRINT-4W: alasan + "Lihat Boss Stage", API 403, layar terkunci; terbuka setelah `progress unlock`), LEARN_FIRST memblokir drill (409), PRACTICE_FIRST mengizinkan `POST /attempts` (AC-15). Cara menjalankan dan ringkasan suite (52 tes, 0 gagal, 0 skip): lihat `task/TASK-023_ielts-test-simulation/dev_log.md`, bagian "E2E Playwright (pasca-audit)".
- **Bug terbuka (dilaporkan, `test.fail`):** `drill.can_start`/`blocked_reason` di `GET /sub-modules/{code}` mengabaikan gaya `PRACTICE_FIRST`, sehingga tombol "Mulai Latihan" nonaktif walau server mengizinkan attempt (`src/server/player/service.ts`). Tab awal Latihan pada `PRACTICE_FIRST` dan teks `practiceFirstNote` juga belum dipakai UI.
- **Bug diperbaiki:** overflow horizontal mobile pada pemutar sub-modul (tabel lebar): `grid-cols-[minmax(0,1fr)]` di `sub-module-player.tsx` dan `learn-tab.tsx`, dengan tes regresi.
- **Bug terbuka kecil:** impor konten mengabaikan `materials_variants` pada deteksi perubahan (NOOP bila hanya varian yang berubah). Konten produksi belum memiliki varian; E2E memakai varian sintetis dari runner.
