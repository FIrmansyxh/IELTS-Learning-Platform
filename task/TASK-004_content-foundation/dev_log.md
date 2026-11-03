# Dev Log TASK-004: Fondasi Konten

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W1)

SPEC-004 tidak memiliki layar baru (library konten, seed, CLI, Golden Sample). Tidak ada kode frontend yang dibuat untuk task ini.
Dampak ke klien: setelah seed/impor, `/peta` (TASK-003) menampilkan 31 sub-modul "Segera hadir" dan node Golden Sample yang `PUBLISHED` sebagai tersedia; tidak ada perubahan klien yang dibutuhkan. Kontrak konten v1.1 (`src/contracts/content.ts`) dimiliki Backend/konten dan tidak dikonsumsi UI W1.


---

## [BACKEND] 2026-11-03 07:55 (Backend Engineer, wave W1)

**Target Spec:** `specifications/004_spec_content_foundation.md` | **Status:** Partial (library, seed, CLI selesai; Golden Sample BELUM dibuat)

### 1. Implementation Summary
- **Seed** `curriculum-structure` (`scripts/seed.ts` + `src/server/content/curriculum-structure.ts`): 4 Tier, 13 Modul, 31 Sub-Modul `DRAFT` (T1=8, T2=8, T3=9, T4=6), nilai gerbang Tier sesuai tabel; idempoten (`ON CONFLICT DO NOTHING`, dijalankan dua kali pada DB nyata).
- **Migrasi** `0004_spec_004_content_foundation.sql`: `content_assets.asset_code varchar(80)` + indeks unik parsial `content_assets_asset_code_uq`.
- **Kontrak v1.1** (`src/contracts/content.ts`): `z.strictObject` untuk Package/Module/SubModule/AssessmentSet/Manifest dan 12 tipe soal (`discriminatedUnion`). Validator (`src/server/content/validate.ts`) menambah normalisasi (NFC+trim), `forbidden_key` (`__proto__/constructor/prototype`, tanpa pencemaran), `max_depth`, `control_char`, seluruh aturan silang tabel Question, aturan set, markdown (`raw_html_not_allowed`, `unsafe_link_scheme`), video/slide, penerjemahan v1.0 (`image_url`/`file_url` -> `asset_code`), sumber/atribusi, rujukan aset (`asset_not_found`, `asset_kind_mismatch`), `parsePassages`. Bentuk keluaran `ContentIssue {path, code, message, severity}`.
- **Aset** (`assets.ts`): `validateAssetFile` (path traversal, `.svg`, magic bytes `file-type`, kecocokan ekstensi `mime_mismatch`, batas ukuran dari env, makro DOCX, re-encode gambar `sharp` tanpa EXIF, durasi `ffprobe` dengan cadangan header WAV) dan `registerFromManifest` (nama UUID via `FsStorageDriver`, `asset_code_conflict`, `duplicate_file`). Video YouTube otomatis `VIDEO_EMBED/EXTERNAL/UNVERIFIED`.
- **Plan/Apply/Publish**: `planContentPackage` (CREATE/UPDATE/NOOP lewat snapshot kanonik/`content_hash`), `applyContentPlan` (satu transaksi, `content_revisions`), `PublishService.publish/changeStatus` (penghalang `ASSET_UNVERIFIED`, `SOURCE_MISSING`, `MATERIAL_MISSING`, `DRILL_NOT_PUBLISHED`, `NO_QUESTIONS`, `NO_OBJECTIVE_QUESTIONS`, `PLACEMENT_BANK_TOO_SMALL`, `BOSS_SECTIONS_MISSING` dari `v_publish_blockers` + pemeriksaan kode). Orkestrasi `runImport` + CLI `scripts/content-import.ts` (`validate`, `import [--dry-run] [--publish]`, exit 0/1/2/3, ringkasan `OK: modules +a ~b =c | ...`).

### 2. Files Created/Modified
`src/contracts/content.ts`, `src/server/content/{curriculum-structure,validate,passages,assets,plan,apply,publish,import-service}.ts`, `src/server/storage/index.ts`, `scripts/{content-import,seed}.ts`, `drizzle/0004_spec_004_content_foundation.sql`, `src/db/schema.ts`, `tests/unit/{content-validate,assets-validate}.test.ts` (60), `tests/integration/content.itest.ts` (13, termasuk 2 uji CLI proses terpisah), `tests/fixtures/content/builders.ts`.

### 3. Technical Notes / keputusan
1. **Golden Sample (GS-1..GS-6) BELUM dibuat.** Paket `content/golden-sample/` membutuhkan teks artikel >= 600 kata, bacaan 650-800 kata, 100+ soal, slide WebP orisinal, PDF, dua audio rekaman pemilik, dan pilihan ID video YouTube oleh pemilik; itu pekerjaan konten (backlog C-01..C-04, ADR-003 #14) yang tidak dapat dipalsukan. Akibatnya AC berikut BELUM terverifikasi: "validate content/golden-sample exit 0 dengan hitungan 3 sub-modul/3 drill/1 placement 30 soal/1 skip 12 soal/1 boss + 4 section", "komposisi tipe soal GS-1/2/3", dan "/peta menampilkan GS-1 UNLOCKED". Semua perilaku yang akan dipakai Golden Sample diuji dengan paket sintetis (`tests/fixtures/content/builders.ts` + berkas dibuat saat tes); paket sintetis TIDAK pernah dimuat ke DB produksi. Task 004 karena itu tetap `development`.
2. Sub-modul hasil seed sudah ada (DRAFT), sehingga impor pertama yang membawa `materials` berstatus **UPDATE** untuk sub-modul (bukan CREATE) dan menaikkan `content_version` ke 2; set penilaian dan aset berstatus CREATE.
3. **Revisi**: tiap CREATE menulis snapshot versi 1; tiap UPDATE menjamin snapshot versi lama ada lalu menulis snapshot versi baru (indeks unik `(entity_type, entity_id, version)`), dan menaikkan `version`/`content_version` untuk semua status (bukan hanya PUBLISHED). Revisi `LEARNING_MATERIAL` tidak dipakai (digabung ke snapshot `SUB_MODULE`).
4. `--publish` juga mempublikasikan modul induk dari sub-modul/set Skip Modul yang disentuh (AC "modul terkait PUBLISHED"). Penghalang apa pun membatalkan seluruh transaksi (impor + publikasi) dan menghapus berkas yang sudah disalin; exit 2.
5. `explanation_id` wajib untuk semua tipe objektif; `module_category` wajib pada kontrak 1.0 (`module_category_required`) dan origin wajib pada 1.1 (`origin_required`); `points != jumlah butir` pada Matching hanya peringatan (`points_mismatch`).
6. Validasi struktur (Zod) menghentikan aturan silang: galat struktural dan galat silang tidak muncul bersamaan dalam satu jalan `validate`.
7. `ffprobe` tidak terpasang di mesin ini: durasi audio MP3/OGG akan kosong dengan peringatan `ffprobe_unavailable` (WAV tetap terbaca). `STORAGE_DRIVER=s3` belum diimplementasikan (melempar galat jelas).
8. `parsePassages` (SPEC-010) diimplementasikan minimal di `src/server/content/passages.ts` untuk validasi; SPEC-010 dapat memperluasnya.
9. Verifikasi menyeluruh tercantum di `TASK-003/dev_log.md`.

### 4. Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 07:55 | Backend W1: seed struktur, kontrak v1.1, validator, aset, plan/apply/publish, CLI (Golden Sample tertunda) |
