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
- BARU `codes/drizzle/0003_spec_021_learning_tracks.sql` + snapshot & meta journal: tabel `learning_tracks`, `learning_track_items`, `learning_track_item_deps`, `user_learning_tracks`, `user_track_checkpoint_attempts`, serta alter table `users`, `user_sub_module_progress`, dan `learning_materials`.
- BARU `codes/src/server/seeds/learning-tracks.ts`: Seeder untuk 3 jalur bawaan (`GT-STRUCT`, `GT-SPRINT-30`, `GT-BAND7-FOCUSED`).
- BARU `codes/src/server/tracks/service.ts`: `listTracks`, `setActiveTrack`, `setSubModuleDeliveryStyle`.
- BARU `codes/src/server/tracks/checkpoint.ts`: `startCheckpointAttempt` (penilaian 10 soal acak, kelulusan 75%, min 5 soal).
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
- Unit Tests: `tests/unit/learning-tracks.test.ts` (7 tests), `tests/unit/seed.test.ts` (3 tests), `tests/security/endpoint-guards.test.ts` (52 tests) **SEMUA LULUS**.
- Integration Tests: `tests/integration/tracks.itest.ts` (12 tests), `tests/integration/gatekeeping.itest.ts` (24 tests), `tests/integration/resume.itest.ts` (13 tests) **SEMUA LULUS**.
