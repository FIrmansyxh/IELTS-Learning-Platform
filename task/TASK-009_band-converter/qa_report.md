# QA & Security Report: TASK-009 Konverter Band IELTS dan Overall Band
**Date:** 2026-11-03 12:45
**Target Branch:** claude/ielts-learning-platform-a3ccc4 (working tree, belum di-commit)
**Reviewer:** QA Agent (review statis + OWASP; WORK_DEPTH standard). Tidak menjalankan `test:integration` (DB `ielts_test` dipakai agen lain), `next build`, `next dev`, maupun E2E.
**Verifikasi yang dijalankan (di `codes/`):** `tsc --noEmit` bersih; `eslint src tests scripts --max-warnings=0` bersih; `vitest run` 34 berkas / 446 tes lulus (termasuk `band.test.ts`, 54 tes, vektor spec).
**Status keseluruhan:** LULUS dengan catatan (0 CRITICAL, 0 HIGH, 1 MEDIUM latent, 5 LOW, 2 INFO). Aman lanjut ke Tester; perbaiki MEDIUM sebelum SPEC-010/011 memanggil konverter.

## 1. Code Quality & Standards
- [x] Pass
- Fungsi murni `band/convert.ts` kecil, tanpa DB, aritmetika bilangan bulat per-1/1000 (`roundToHalfBand`), mudah diuji. `validate.ts` murni dengan kode galat sesuai spec. `service.ts` memisahkan baca/tulis dan memakai `writeAudit` untuk setiap mutasi. Komponen FE (`BandBadge`, `EstimasiNotice`, `BandResultBlock`, `BandConversionTable`, `band-panel`) dan validasi klien `lib/band-rows.ts` (UX saja; server tetap otoritatif).
- **Data seed dicocokkan baris demi baris dengan spec**: `seed-data.ts` LISTENING (17 baris) dan READING_ACADEMIC (17 baris) identik dengan spec 009; cakupan 0..40 tanpa celah. Batas yang diminta (LISTENING 25/26/29/30, READING 14/15/18/19/26/27) jatuh benar.
- Vektor `roundToHalfBand` (6.125->6.0, 6.25->6.5, 6.375->6.5, 6.625->6.5, 6.75->7.0, 6.875->7.0), `overallBand`, `bossBand`, `scaleToForty` ((1,16)->3, (5,12)->17, (1,3)->13) ditelusuri terhadap kode dan konsisten; suite unit lulus.

## 2. Security Assessment
- [x] Pass (tidak ada secret hardcoded, tidak ada injeksi, otorisasi admin benar)

### Terverifikasi baik
- **Otorisasi**: semua rute `admin/band-tables*` memakai `withApi({ auth: 'admin' })`; `GET /band-tables/active` `auth: 'user'`. Mutasi (POST/DELETE) melewati pemeriksaan CSRF origin/`sec-fetch-site` di `withApi`. Learner -> 403 `FORBIDDEN`. `table_id` divalidasi `Uuid` (`BandTableIdParamSchema` strict), query `skill` enum strict.
- **Validasi input**: `CreateBandTableBodySchema` = `strictObject` (`unrecognized_key`), `version_label` trim 1-60, `source_note` <= 500, `rows` 1-41 dengan baris strict. Validasi semantik server (`validateBandRows`): `range_invalid`, `band_invalid` (kelipatan 0.5 via `Number.isInteger(band*2)`, aman untuk 0.5-step), `coverage_gap`, `coverage_overlap` (duplikat `raw_min` terdeteksi, rentang bersarang terdeteksi), `non_monotonic`. Baris diurutkan server (`sort raw_min`). Validasi dijalankan SEBELUM transaksi insert; insert tabel + baris + audit satu transaksi.
- **SQL**: semua query lewat Drizzle/`sql` terparameter; `LIKE ${'%'+tableId+'%'}` memakai nilai ter-bind dan `tableId` sudah uuid tervalidasi (tidak ada karakter wildcard). Tidak ada `sql.raw`.
- **Aktivasi serentak**: `activateTable` mengambil `pg_advisory_xact_lock('band_activate:{skill}')`, lalu `FOR UPDATE` pada baris, menonaktifkan tabel aktif lama dan mengaktifkan yang baru dalam satu transaksi; indeks unik parsial `band_tables_one_active_uq` jaring pengaman. Aktivasi vs hapus pada tabel yang sama aman (hapus mengunci baris `FOR UPDATE`; yang kalah melihat 404/`BAND_TABLE_IN_USE`). Pembaca (`getActiveTable`) tidak pernah melihat keadaan tanpa tabel aktif (READ COMMITTED, commit atomik).
- **Audit**: `BAND_TABLE_CREATED`, `BAND_TABLE_ACTIVATE` (metadata `previous_table_id`), `BAND_TABLE_DELETED` dengan `actorUserId` dan `ipHash`; tanpa PII/secret.
- **DELETE tabel dipakai**: ditolak `BAND_TABLE_IN_USE` bila `is_active`, `attempts.band_table_id` cocok, atau uuid tabel muncul di `attempts.result_json::text` (`service.ts:182-186`); pemeriksaan dan penghapusan dalam satu transaksi setelah `FOR UPDATE`. Sisipan attempt konkuren yang merujuk tabel itu tertahan kunci KEY SHARE FK lalu gagal 23503, sehingga tidak ada rujukan hilang diam-diam pada jalur normal.
- **Kebocoran**: tidak ada secret; `source_note` hanya teks (dirender sebagai teks React, tidak ada `dangerouslySetInnerHTML` pada `components/band`, `components/admin/band-panel.tsx`). Endpoint learner hanya mengembalikan data tabel publik + disclaimer.
- **Pembulatan band vs tabel resmi**: `roundToHalfBand` memakai `Math.round(x*1000)` (spec), `overallBand` mensyaratkan keempat band finite (`typeof number`), `convertRawToBand` melempar `band_row_missing` bila tak ada baris (tidak diam-diam mengembalikan 0). Seed idempoten (`onConflictDoNothing`), tidak menimpa tabel aktif lain.
- **Attempt lama tak berubah**: aktivasi hanya membalik `is_active`; baris/atribut tabel lama tidak diedit (tidak ada endpoint PUT/PATCH), sehingga `band_table_id` lama tetap valid dan tidak dapat dihapus.

### Temuan

| ID | Sev | Lokasi | Ringkas |
|---|---|---|---|
| F-09-01 | MEDIUM (latent) | `src/server/band/convert.ts:41-47`; dev_log BE keputusan #3 | **`scaleToForty(raw, 40)` mengembalikan `raw` tanpa pembulatan** (`if (max === 40) return raw;`), padahal catatan dev_log menyatakan skor parsial dibulatkan setengah-ke-atas. `rawH` attempt disimpan sentesimal dan dapat pecahan (kredit parsial `MCQ_MULTI`/matching). Nilai seperti 29.5 atau 8.5 jatuh di antara dua baris tabel (rentang integer berurutan, mis. 26-29 lalu 30-31), sehingga `convertRawToBand` melempar `band_row_missing` dan `submit` ujian Reading/Listening (SPEC-010/011) akan 500 untuk pelajar dengan skor parsial. Belum terpicu karena belum ada pemanggil, tetapi pasti terpicu saat 010/011 terhubung. Perbaikan: bulatkan setengah-ke-atas juga untuk `max===40` (atau di `convertRawToBand` gunakan `Math.floor(raw+0.5)` bila bukan integer), tambah uji `(29.5,40)=30`, `(28.4,40)=28`, atau putuskan di spec kebijakan raw pecahan. Spec menulis `max=40 -> raw`; konfirmasi dengan Analyst. |
| F-09-02 | LOW | `src/db/schema.ts:367` (`attempts.band_table_id ... onDelete: 'set null'`) | Perlindungan "hasil lama tidak berubah" hanya pada lapisan aplikasi. Penghapusan langsung via SQL/migrasi mengosongkan `band_table_id` secara diam-diam. Ganti ke `RESTRICT` (atau `NO ACTION`) pada migrasi berikutnya agar DB menjadi jaring pengaman. |
| F-09-03 | LOW | `src/server/band/service.ts:182-186` | Pemeriksaan `result_json::text LIKE '%uuid%'` memindai seluruh tabel `attempts` tanpa indeks (O(n) per DELETE). Admin-only dan jarang, tetapi tumbuh seiring data; cukup dengan kolom `band_table_id` selama spec 010/011/014 selalu mengisinya, atau tambah indeks GIN/ekspresi. Juga tidak menangkap uuid yang tersimpan dalam `attempt_sections` (spec 011) bila nanti ditambah. |
| F-09-04 | LOW | `src/server/band/convert.ts:15-17,34-36` | `Math.round(x*1000)` sebelum ambang membuat masukan acak seperti 6.2496 dibulatkan ke 6.5 (seharusnya 6.0). Untuk `overallBand`/`bossBand` masukan kelipatan 0.5 sehingga rata-rata kelipatan 0.125 persis, aman; hanya `averageBand` dengan masukan non-kelipatan yang terpengaruh. Spec mewajibkan metode ini; dokumentasikan bahwa masukan harus kelipatan 0.5. |
| F-09-05 | LOW | `src/server/band/service.ts:119-126`; rute admin | Tidak ada rate limit pada mutasi admin band, dan aktivasi tabel mengubah band semua pelajar tanpa konfirmasi ulang kata sandi / langkah dua orang. Risiko rendah (admin tepercaya, audit ada); catat untuk hardening rilis. |
| F-09-06 | LOW | `src/components/admin/band-panel.tsx`; `lib/band-rows.ts` | Validasi klien menduplikasi aturan server; perubahan satu sisi dapat menyimpang. Server tetap otoritatif (diuji `band.itest.ts` 20 kasus, tidak dijalankan di sini). Pertimbangkan berbagi `validateBandRows` murni antara FE dan BE. |
| F-09-07 | INFO | `src/server/band/service.ts:60-62` | `used_by_attempts` hanya menghitung `attempts.band_table_id`, sedangkan penghapusan juga memeriksa `result_json`; FE menyembunyikan "Hapus" berdasarkan hitungan, server menolak sisanya dengan 409 (konsisten dan aman, hanya UX). |
| F-09-08 | INFO | `src/server/band/service.ts:131-148` | Pesan `VERSION_LABEL_TAKEN` pada balapan dibedakan dari 23505 lain (`isUniqueViolation`) dengan benar; label tidak dinormalisasi huruf besar/kecil ("V1" vs "v1" dianggap berbeda), sesuai spec. |

## 3. Architecture Alignment
- [x] Pass
- Endpoint dan kode galat sesuai `specifications/009` dan `_api-contract.md`: `GET /band-tables/active`, `GET|POST /admin/band-tables`, `GET|DELETE /admin/band-tables/{id}`, `POST .../activate` (200, tanpa body); galat `VERSION_LABEL_TAKEN`/`ALREADY_ACTIVE`/`BAND_TABLE_IN_USE` terdaftar di `http/errors.ts`. Struktur `src/server/band/*`, `src/contracts/band.ts` (FE membuat, BE hanya menambah `CreateBandTableBodySchema` longgar agar kode detail spesifik keluar dari server), seed modul `band-tables` di `scripts/seed.ts`. Kendala DB yang diandalkan (`band_tables_one_active_uq`, `band_tables_skill_version_uq`, CHECK rentang/band) ada di skema.
- `BandService.getActiveTable(db, skill)` siap dipakai SPEC-010/011/014 (menerima `DbOrTx`). `BandResultBlock` menjamin `EstimasiNotice` menyertai band.

## 4. Recommendations
1. (MEDIUM latent) F-09-01: bulatkan skor pecahan sebelum lookup atau tentukan kebijakan di spec; tambah uji unit sebelum SPEC-010/011 dibangun.
2. (LOW) F-09-02: migrasi FK `attempts.band_table_id` ke `RESTRICT`; F-09-03: hindari pemindaian `result_json::text`.
3. (LOW/INFO) F-09-04..08 sesuai tabel.
4. Yang tidak diverifikasi QA: `band.itest.ts` (20 kasus, butuh DB, termasuk aktivasi serentak), E2E admin (Simpan disabled saat celah), tampilan visual terang/gelap/375px.

**Keputusan:** Aman dilanjutkan ke Tester (E2E). F-09-01 sebaiknya ditutup oleh Backend sebelum wave SPEC-010/011.
