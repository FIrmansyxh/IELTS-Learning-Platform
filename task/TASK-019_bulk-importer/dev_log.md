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
