# Dev Log TASK-009: Konverter Band IELTS dan Overall Band

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W3)

Spec: `specifications/009_spec_band_converter.md` (bagian UI/UX: komponen bersama + admin `/admin/band`). Fungsi murni konversi dan validasi final adalah milik Backend.

### Yang dibangun
- **Kontrak (baru, hanya ditambah)**: `src/contracts/band.ts` (`BandRowSchema`, `ActiveBandTablesResponseSchema`, daftar admin, request/response create & activate). Backend kemudian menambah `CreateBandTableBodySchema` dst. pada berkas yang sama (tidak bentrok).
- **Klien API**: `src/lib/api/band.ts` (`active`, `adminList`, `create`, `activate`, `remove`).
- **Komponen bersama** (`components/band/band-display.tsx`): `EstimasiNotice` ("Perkiraan latihan, bukan skor resmi IELTS." + ikon Info), `BandBadge` (1 desimal, format Indonesia, label teks), `BandResultBlock` (kontainer yang menjamin `EstimasiNotice` selalu menyertai band), `BandConversionTable` (tabel "Skor mentah -> Band" menyorot baris yang dicapai dengan teks "Dicapai"; daftar kartu di mobile; label versi).
- **Admin `/admin/band`** (`components/admin/band-panel.tsx`, item "Tabel Band" di nav admin): Table (Skill, Label, Aktif Badge, Baris, Dipakai oleh attempt, Aksi), banner permanen, Sheet "Buat Versi Baru" (skill, label, catatan, editor baris Dari/Sampai/Band, tambah/hapus baris, "Salin dari tabel aktif"), Dialog konfirmasi Aktifkan/Hapus (Hapus hanya untuk versi tidak aktif yang belum dipakai), galat server (`VERSION_LABEL_TAKEN`, detail validasi) tampil di sheet.
- **Validasi klien** (`lib/band-rows.ts`, UX saja; server tetap memvalidasi): celah ("Celah: skor 16 tidak tercakup."), tumpang tindih ("Tumpang tindih di 18-22."), band bukan kelipatan 0,5, rentang tidak valid, band menurun; "Simpan" disabled sampai valid dan label terisi; pesan per baris memakai `role=alert` + `aria-describedby`.
- `BandBadge`/`EstimasiNotice`/`BandConversionTable` dipakai oleh `ExamResultView` (TASK-008) bila `band_score` ada; layar Reading/Listening/Boss (SPEC-010/011/014) tinggal memakainya bersama `GET /band-tables/active`.

### Keputusan dan asumsi
1. Tidak ada halaman learner khusus konverter (spec hanya meminta komponen bersama); tidak ada hook `useActiveBandTables` terpisah, cukup `bandApi.active()` oleh pemakai.
2. Hapus tabel disembunyikan di klien untuk tabel aktif/terpakai (UX); penolakan sebenarnya `409 BAND_TABLE_IN_USE` dari server.

### Verifikasi (dijalankan di `codes/`, 2026-11-03)
`npx tsc --noEmit` bersih; `npx eslint src tests --max-warnings=0` bersih; `npx vitest run`: 34 berkas, 442 tes lulus. Tes khusus: `components/band/band.test.tsx` (11: komponen, validasi baris, panel admin termasuk alur Simpan disabled saat celah, Aktifkan, VERSION_LABEL_TAKEN).
Belum diverifikasi: integrasi backend nyata, E2E admin, visual terang/gelap dan 375px, pembaca layar.


---

## [BACKEND] 2026-11-03 12:30 (Backend Engineer, wave W3)

**Spec:** 009 | **Status:** Completed (sisi server)

### Implementasi
- Fungsi murni `src/server/band/convert.ts`: `roundToHalfBand` (bilangan bulat per-1/1000), `overallBand`, `bossBand`, `averageBand`, `scaleToForty` (setengah-ke-atas; invalid melempar error), `convertRawToBand` (`band_row_missing`). `validate.ts`: `validateBandRows` (kode `range_invalid`, `band_invalid`, `coverage_gap`, `coverage_overlap`, `non_monotonic`). `seed-data.ts`: tabel Academic `v1-umum-2026-11` (Listening dan Reading terpisah, 17 baris masing-masing).
- `src/server/band/service.ts` (`BandService`): `getActiveTable(db, skill)` untuk spec ujian, `getActiveTables`, `listTables`, `getTable`, `createTable` (validasi + transaksi + `VERSION_LABEL_TAKEN`, termasuk balapan lewat 23505), `activateTable` (advisory lock per skill; nonaktifkan lama lalu aktifkan baru satu transaksi; audit `BAND_TABLE_ACTIVATE`), `deleteTable` (`BAND_TABLE_IN_USE` bila aktif, dirujuk `attempts.band_table_id`, atau uuid tabel muncul di `attempts.result_json`).
- Rute: `GET /band-tables/active` (user), `GET|POST /admin/band-tables`, `GET|DELETE /admin/band-tables/{table_id}`, `POST .../activate` (admin). Seed modul `band-tables` di `scripts/seed.ts` (idempoten).
- Audit: `BAND_TABLE_CREATED`, `BAND_TABLE_ACTIVATE`, `BAND_TABLE_DELETED`. Error baru: `VERSION_LABEL_TAKEN`, `ALREADY_ACTIVE`, `BAND_TABLE_IN_USE`.

### Keputusan / catatan
1. `src/contracts/band.ts` dibuat Frontend; Backend hanya MENAMBAH `CreateBandTableBodySchema` (angka longgar agar kode detail `range_invalid`/`band_invalid` keluar dari server, bukan `out_of_range` Zod), `BandTableIdParamSchema`, `BandTableListQuerySchema`. `CreateBandTableRequestSchema` Frontend tidak diubah.
2. `used_by_attempts` pada daftar = jumlah `attempts.band_table_id`; pemeriksaan hapus tambahan memindai `result_json::text` (jarang dipanggil).
3. `scaleToForty` untuk `max=40` dan raw bukan bilangan bulat dibulatkan setengah-ke-atas agar skor parsial tidak membuat `convertRawToBand` gagal.
4. Label kosong/spasi menghasilkan 400 dengan kode detail `out_of_range` (pemeta galat bersama memetakan `too_small`).
5. Dua aktivasi serentak diserialkan advisory lock; hasil akhir tepat satu aktif (teruji).

### Verifikasi
Satu rangkaian W3 dengan TASK-008 (tsc, eslint, vitest 446, integration 231 lulus); lihat dev_log TASK-008. Unit `band.test.ts` (54) dan `band.itest.ts` khusus tugas ini.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 12:30 | Backend W3: konverter band, tabel berversi, API admin, seed |


---

## [BACKEND] 2026-11-03 12:40 (Backend Engineer, wave W4) - Verifikasi perbaikan QA W3 (TASK-009)

| ID | Status | Bukti |
|---|---|---|
| F-09-01 | TERTUTUP (sudah ada, diverifikasi) | `scaleToForty(raw, 40)` membulatkan setengah ke atas (29.5 -> 30, 28.4 -> 28), selalu bilangan bulat. Unit `band.test.ts` (vektor `[29.5, 40, 30]`). |
| F-09-02 | TERTUTUP (sudah ada, diverifikasi) | Migrasi `0006_spec_019_import_entity_code_band_fk_restrict.sql`: FK `attempts.band_table_id` `ON DELETE restrict`; skema Drizzle `onDelete: 'restrict'`. Tes `band.itest.ts`: DELETE SQL langsung ditolak, `band_table_id` tidak dikosongkan. |
| F-09-03 | DITUTUP (baru) | `band/service.ts` `deleteTable`: `result_json::text LIKE '%uuid%'` diganti `jsonb_path_exists(result_json, '$.** ? (@.type() == "string" && @ == $id)')` (string persis, tanpa cast teks seluruh JSON, hanya baris ber-`result_json`). Masih pemindaian sekuensial tanpa indeks (admin-only, jarang); indeks GIN ditunda sampai SPEC-014 menetapkan bentuk `band_table_ids`. Tes `band.itest.ts` "tabel yang dirujuk result_json" lulus. |

Verifikasi: lihat dev_log TASK-018 (tsc, eslint, vitest 520, integration 280 lulus).

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 12:40 | Backend W4: verifikasi F-09-01/02, F-09-03 jsonpath |
