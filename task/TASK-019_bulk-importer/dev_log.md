# Dev Log TASK-019: Admin Bulk Importer JSON/CSV

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W4)

Spec: `specifications/019_spec_bulk_importer.md` (bagian UI/UX) dan `_api-contract.md`.

### Yang dibangun
- **Kontrak (baru, hanya ditambah)**: `src/contracts/import.ts` (`BatchDTO`, `ItemDTO`, detail item, status/aksi/tingkat, `ImportBlocker`, request publish). Backend kemudian menambahkan skema sisi server pada berkas yang sama tanpa mengubah skema klien.
- **Klien API**: `lib/api/imports.ts` (daftar, detail/polling, item, `allItems` berhalaman 200, publish, cancel, rollback, kontrak, unggah multipart dengan progres, URL templat).
- **Riwayat `/admin/impor`** (`import/imports-panel.tsx`): tabel -> kartu mobile, filter status, auto-refresh 3 dtk bila ada batch aktif, "Impor Baru", aksi Lanjutkan/Lihat, Batalkan, Kembalikan (Rollback) lewat Dialog destruktif yang menjelaskan I6; `ROLLBACK_BLOCKED` menampilkan entitas penahan dari `details[]`.
- **Wizard** `/admin/impor/baru` (langkah 1) dan `/admin/impor/[batch_id]` (`import/import-wizard.tsx`): stepper 4 langkah dengan `aria-current="step"`; langkah dipaksa status batch (UPLOADED/VALIDATING/FAILED -> 2; PUBLISHING/PUBLISHED/CANCELLED/ROLLED_BACK -> 4) dan bebas maju/mundur saat `PREVIEW_READY`; polling 2 dtk selama batch aktif; banner sumber NC pada langkah 2-4.
  1. `step-upload.tsx`: dropzone besar, `.json`/`.csv`, batas 5 MB (UX), unduh templat JSON/CSV, Dialog "Lihat kontrak data" (JSON Schema dari `/import-contract`), progres unggah; `IMPORT_FILE_INVALID` menampilkan daftar kode + penjelasan Indonesia, `DUPLICATE_BATCH` menautkan batch lama.
  2. `step-validate.tsx`: 3 kartu (Valid/Peringatan/Error), Progress job (antrean/berjalan), tabel galat Baris/Path/Pesan(+kode)/Tingkat (ikon + teks), filter "Hanya error", "Unduh laporan galat" (CSV klien dari `items?status=INVALID`, sel berawalan `= + - @ \t \r` diberi `'`), "Lanjut" disabled bila `invalid_items > 0`, peringatan butuh centang pengakuan.
  3. `step-preview.tsx` + `item-preview-sheet.tsx`: pohon Tier > Modul > Sub-Modul dengan Badge Baru/Diubah/Tanpa perubahan (ikon + teks); Sheet pratinjau baca-saja (artikel lewat `MarkdownArticle`, video/slide/lampiran, soal dengan kunci jawaban hanya di pratinjau admin; `payload: null` -> pesan retensi 90 hari).
  4. `step-publish.tsx`: RadioGroup draf (default) / publikasikan (nonaktif + alasan bila ada peringatan `asset_unverified`), Dialog konfirmasi "{n} dibuat, {m} diperbarui, {k} tanpa perubahan", Progress job `IMPORT_PUBLISH`, hasil + tautan ke `/admin/konten/kurikulum`, kartu `PUBLISH_BLOCKED` dengan daftar penghalang bertautan ke `/admin/konten/aset`, rollback dari hasil.

### Keputusan dan asumsi
1. Pratinjau memakai tampilan soal baca-saja sendiri (`ReadOnlyQuestion`) alih-alih `QuestionRenderer`, karena renderer pemutar terikat state jawaban/umpan balik; tidak ada panggilan API attempt. Perlu keputusan bila ingin pemakaian ulang renderer asli.
2. Pengelompokan pohon bergantung pada format `entity_code` (`2.1`, `2.1.3`); item set asesmen dan soal CSV dikelompokkan terpisah ("Set asesmen dan soal"). Format `entity_code` set asesmen tidak diatur kontrak, hanya ditampilkan apa adanya.
3. Struktur `Blocker` tidak didefinisikan spec; skema klien longgar (`code` wajib, `message`/`asset_code`/`entity_code` opsional).
4. Tabel galat menampilkan maksimal 100 baris; daftar lengkap lewat unduhan laporan.
5. Tautan `/admin/konten/kurikulum` (SPEC-020) belum ada halamannya.

### Verifikasi (di `codes/`, 2026-11-03)
`tsc --noEmit` bersih; `eslint src tests --max-warnings=0` bersih; `vitest run` 35 berkas / 512 tes lulus (tes di `components/admin/content-admin.test.tsx`: sanitasi CSV laporan, pohon, riwayat + aksi, rollback ditahan, stepper, unggah + galat, validasi + pengakuan + progres, pratinjau + payload purged, publish + blockers + hasil).
Belum diverifikasi: integrasi backend nyata (polling job, templat unduh), E2E Playwright, tampilan terang/gelap dan 375x812, pembaca layar.


---

## [BACKEND] 2026-11-03 12:40 (Backend Engineer, wave W4)

**Spec:** 019 | **Status:** Completed (sisi server)

### Implementasi (audit terhadap kontrak dan AC)
- `src/server/import/file-check.ts` (I2 sinkron: ukuran, tipe, UTF-8, BOM ganda, karakter kontrol, kedalaman, kunci terlarang, `contract_version`, batas item/baris/kolom/sel, nama berkas disanitasi), `service.ts` (unggah dengan `file_sha256` + kunci advisory 727019 anti-duplikat/batch aktif, daftar, item, publish-request, cancel, `batchDto`), `evaluate.ts` (I3/I4: kontrak SPEC-004 per item, rencana CREATE/UPDATE/NOOP, peringatan baku, `set_has_active_attempts`, adapter CSV `QUESTIONS` + `formula_injection`), `jobs.ts` (`runImportValidate`, `runImportPublish`: satu transaksi, rencana segar, `PublishService` untuk target `PUBLISHED`, `PUBLISH_BLOCKED`/`VALIDATION_CHANGED`, idempoten), `csv-apply.ts` (soal CSV digabung per set, `version` +1 sekali), `rollback.ts` (I6), `purge.ts` (I7), `templates.ts`.
- Worker: `src/worker/registry.ts` mendaftarkan handler `import-validate` dan `import-publish` (di luar limiter AI); `src/worker/purge.ts` memuat `purgeImportBatches`; queue dibuat `scripts/migrate.ts` (retry 1, expire 900 dtk).
- Rute: `import-batches` (GET, POST dengan bucket `import_admin` 10/jam), `[id]` (GET), `[id]/items`, `[id]/items/[row]`, `[id]/publish` (202), `[id]/cancel`, `[id]/rollback`, `import-templates/[kind]`, `import-contract`.
- Audit AC SPEC-019 terhadap kode: seluruh endpoint dan AC sudah terimplementasi (termasuk worker job pg-boss); kontrak API tidak berubah, tidak ada perubahan skema DB baru di wave ini.

### Celah tes yang ditutup (W4)
- `import.itest.ts` blok baru: learner 403 dan tanpa sesi 401 pada SEMUA 9 endpoint impor (tanpa efek pada batch), handler worker lewat `jobHandlers['import-validate'|'import-publish']` (batch hingga `PUBLISHED`, pengulangan job idempoten), worker mati saat `VALIDATING` (dikerjakan ulang), batch dibatalkan sebelum worker jalan (dilewati), cancel saat `VALIDATING` ditolak.
- `import.itest.ts` kini membersihkan datanya di `afterAll` lewat `cleanupContentFixtures()` (lihat dev_log TASK-018).

### Verifikasi (codes/, 2026-11-03)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus (0 galat) |
| `npx eslint src tests scripts --max-warnings=0` | lulus |
| `npx vitest run` | 35 berkas, 520 tes lulus |
| `npm run test:integration` | 13 berkas, 280 tes lulus (Postgres 16 lokal, `ielts_test`) |
Tidak diverifikasi: E2E Playwright, `next build`/`next dev`, integrasi FE-BE di browser, worker pg-boss sebagai proses terpisah (handler diuji lewat `jobHandlers` + `runImport*` langsung; enqueue ke pg-boss diuji), uji beban 2.000 item.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 12:40 | Backend W4: audit endpoint/AC, worker diuji lewat registry, celah tes akses, isolasi data tes |


---

## [BACKEND] 2026-11-03 13:45 (Backend Engineer, wave W4) - Perbaikan QA (qa_report TASK-019)

| ID | Status | Perubahan |
|---|---|---|
| F-19-01 (HIGH) | DITUTUP | `jobs.ts` `blockersForPublishedUpdates`: setelah apply, setiap entitas `SUB_MODULE`/`ASSESSMENT_SET` berstatus `PUBLISHED` yang di-UPDATE dicek `computeBlockers` (apa pun `target_status`); ada penghalang -> transaksi dibatalkan, batch `PREVIEW_READY` + `PUBLISH_BLOCKED`. Tes: slide UNVERIFIED baru dan video YouTube baru pada sub-modul PUBLISHED, target DRAFT dan PUBLISHED; konten tayang, versi, dan revisi tidak berubah. |
| F-19-02 (MEDIUM) | DITUTUP | `service.ts` `recoverStuckBatches` (job terminal atau tanpa kemajuan > 30 menit: UPLOADED/VALIDATING -> FAILED, PUBLISHING -> PREVIEW_READY, `JOB_STALLED`), dipanggil lazy sebelum `IMPORT_IN_PROGRESS`, saat boot worker, dan oleh tugas retensi `recoverStuckImportBatches`. `cancel` diizinkan pada VALIDATING/PUBLISHING bila job terakhir bukan RUNNING. Tes: job FAILED, PUBLISHING macet via jam maju, pembatalan. |
| F-19-03 (LOW) | DITUTUP | Audit `IMPORT_PUBLISH_REQUESTED` di `requestPublish`; `runImportPublish` memakai `async_jobs.user_id` (penekan Publikasikan) sebagai aktor revisi, `CONTENT_PUBLISHED`, dan `IMPORT_PUBLISHED`. Tes dengan admin kedua. |
| F-19-04 (LOW) | DITUTUP | `hasForbiddenKey` memakai loop, bukan spread. Tes: array 300.000 elemen -> 400 `too_many_items`. |
| F-19-05 (LOW) | DITUTUP | `item-preview-sheet.tsx` (`questionsOf`, judul) mendukung payload CSV `{ set_type, scope_code, question }`; tes komponen. (Perubahan kecil di folder FE atas permintaan koordinator.) |
| F-19-06, 07, 08 (sebagian), 09, 10, 11 | DITUNDA | 06 (kedaluwarsa batch menggantung), 07 (kunci baris + 23503 -> ROLLBACK_BLOCKED, cek blocker saat restore), 08 (tes rollback JSON dengan CREATE + video, pg-boss proses terpisah), 09-11 INFO. Dicatat untuk hardening rilis. |

Kontrak diubah aditif saja; dicatat di spec 019 dan `_api-contract.md`.

### Isolasi tes
`player.itest.ts` "ambang waktu mengikuti app_settings learn.min_active_seconds": `UPDATE` pada baris `app_settings` yang tidak ada pada urutan berkas tertentu (0 baris terubah, ambang tetap 60). Diganti upsert. Lulus pada `--sequence.shuffle.files` seed 1, 2, 3.

### Verifikasi (codes/, 2026-11-03)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npx eslint src tests scripts --max-warnings=0` | lulus |
| `npx vitest run` | 35 berkas, 521 tes lulus |
| `npm run test:integration` | 13 berkas, 288 tes lulus; juga lulus dengan `--sequence.shuffle.files` seed 1, 2, 3 (288/288) |

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 13:45 | Backend W4: perbaikan QA F-19-01..05, isolasi player.itest |
