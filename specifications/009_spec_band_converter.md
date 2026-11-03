# SPEC-009: Konverter Band IELTS & Overall Band (ASM-03)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-001, SPEC-002
- **Prioritas:** P0
- **Cakupan:** Backend (library pembulatan/konversi, tabel band berversi, API) + Frontend (admin tabel band, komponen tampilan band)

## User Story
Sebagai Admin, saya ingin tabel konversi skor mentah (0-40) ke band IELTS Listening dan Academic Reading disimpan sebagai data berversi yang dapat diubah, sedangkan Learner mendapat konversi dan Overall Band yang konsisten di semua hasil ujian, sehingga kalibrasi band tetap akurat ketika tabel resmi berubah tanpa mengubah kode atau riwayat hasil lama.

## Non-Goals / Out of Scope
- Tidak membuat ujian Reading/Listening/Boss (SPEC-010/011/014); spec ini hanya menyediakan fungsi dan data konversi yang mereka panggil.
- Tidak mengonversi skor Writing/Speaking (band berasal dari penilaian AI/self-assessment, SPEC-012/013).
- Tidak ada edit baris pada tabel yang sudah dibuat. Perubahan = buat versi baru lalu aktifkan.
- Tidak ada tabel General Training.
- Tidak ada prediksi band dari persentase Grammar/Vocab (SPEC-017).
- Tidak mengklaim tabel sebagai resmi; selalu berlabel "perkiraan" dan "bervariasi antar versi tes".
- Tidak ada impor tabel dari CSV.

## Fungsi Murni (`src/server/band/`; WAJIB unit-test; tanpa akses DB)
| Fungsi | Tanda tangan | Aturan |
|---|---|---|
| `roundToHalfBand` | `(x: number) => number` | `f = x - floor(x)`; `f < 0.25` -> `floor(x)`; `0.25 <= f < 0.75` -> `floor(x) + 0.5`; `f >= 0.75` -> `floor(x) + 1`. Dihitung dengan bilangan bulat per-1/1000 (`Math.round(x*1000)`) agar tanpa galat float |
| `overallBand` | `(c: {listening: number, reading: number, writing: number, speaking: number}) => number` | `roundToHalfBand((l + r + w + s) / 4)`. Semua empat WAJIB ada |
| `bossBand` | `(listening: number, reading: number) => number` | `roundToHalfBand((l + r) / 2)` (ADR-003 #1) |
| `averageBand` | `(values: number[]) => number \| null` | `roundToHalfBand(rata-rata)`; `null` bila array kosong |
| `scaleToForty` | `(raw: number, max: number) => number` | `max = 40` -> `raw` dibulatkan setengah-ke-atas ke bilangan bulat (skor parsial 29.5 -> 30, 28.4 -> 28; amandemen QA F-09-01, ADR-003 #28); selain itu pembulatan setengah-ke-atas dari `raw * 40 / max` (bilangan bulat 0-40); `max <= 0` atau `raw > max` -> error |
| `convertRawToBand` | `(rows: BandRow[], raw40: number) => number` | cari baris dengan `raw_min <= raw40 <= raw_max`; tidak ketemu -> error `band_row_missing` |

**Vektor uji WAJIB lulus** (`overallBand` L,R,W,S): (6.0,6.0,6.0,6.0)=6.0; (6.5,6.0,6.0,6.0)=6.0 [6.125]; (6.5,6.5,6.0,6.0)=6.5 [6.25]; (6.5,6.5,6.5,6.0)=6.5 [6.375]; (7.0,6.5,6.5,6.5)=6.5 [6.625]; (7.0,7.0,6.5,6.5)=7.0 [6.75]; (7.0,7.0,7.0,6.5)=7.0 [6.875]; (4.0,4.0,4.0,4.5)=4.0 [4.125]; (9,9,9,9)=9.0; (0,0,0,0)=0.0. `bossBand` (L,R): (5.0,5.0)=5.0; (5.0,5.5)=5.5 [5.25]; (5.5,6.0)=6.0 [5.75]; (6.0,6.5)=6.5 [6.25]; (6.0,5.0)=5.5; (7.0,7.5)=7.5 [7.25]. `scaleToForty`: (20,20)=40; (7,10)=28; (3,8)=15 [15.0]; (1,3)=13 [13.33]; (5,12)=17 [16.67]; (1,16)=3 [2.5 -> 3]; (29.5,40)=30; (28.4,40)=28; (8.5,40)=9.

## Technical Flow
1. `npm run db:seed` menjalankan modul seed `band-tables` yang membuat dua tabel aktif (`LISTENING`, `READING_ACADEMIC`) berlabel `v1-umum-2026-11` dengan baris di bawah.
2. Spec ujian (SPEC-010/011/014) memuat tabel aktif lewat `BandService.getActiveTable(skill)`, memanggil `scaleToForty` lalu `convertRawToBand`, dan menyimpan `attempts.band_table_id` / `attempt_sections.band_score` serta id tabel di `result_json`.
3. Learner membuka hasil ujian; klien memanggil `GET /api/v1/band-tables/active` untuk menampilkan rincian "Skor mentah 28/40 -> Band 6.5" memakai komponen `BandConversionTable`.
4. Admin membuka `/admin/band`, menyalin tabel aktif sebagai dasar, mengedit baris, dan menyimpan sebagai versi baru lewat `POST /api/v1/admin/band-tables` (status tidak aktif).
5. Server memvalidasi cakupan 0-40 tanpa celah dan tumpang-tindih serta monotonisitas; bila valid, menyimpan tabel + baris dalam satu transaksi.
6. Admin menekan "Aktifkan" memanggil `POST /api/v1/admin/band-tables/{id}/activate`; server menonaktifkan tabel aktif lama dan mengaktifkan yang baru dalam satu transaksi, menulis `audit_log` `BAND_TABLE_ACTIVATE`.
7. Attempt lama tetap merujuk `band_table_id` lamanya sehingga hasil tidak berubah.

### Data Seed Tabel Band `v1-umum-2026-11` (Academic; `source_note` = "Tabel konversi Academic yang umum dipublikasikan. Perkiraan, bervariasi antar versi tes (ADR-003 #2).")
**LISTENING** (`raw_min-raw_max: band`): 0-0: 0.0 | 1-1: 1.0 | 2-3: 2.0 | 4-5: 2.5 | 6-7: 3.0 | 8-9: 3.5 | 10-12: 4.0 | 13-15: 4.5 | 16-17: 5.0 | 18-22: 5.5 | 23-25: 6.0 | 26-29: 6.5 | 30-31: 7.0 | 32-34: 7.5 | 35-36: 8.0 | 37-38: 8.5 | 39-40: 9.0 (17 baris).
**READING_ACADEMIC**: 0-0: 0.0 | 1-1: 1.0 | 2-3: 2.0 | 4-5: 2.5 | 6-7: 3.0 | 8-9: 3.5 | 10-12: 4.0 | 13-14: 4.5 | 15-18: 5.0 | 19-22: 5.5 | 23-26: 6.0 | 27-29: 6.5 | 30-32: 7.0 | 33-34: 7.5 | 35-36: 8.0 | 37-38: 8.5 | 39-40: 9.0 (17 baris).
Tabel ini menggantikan placeholder `data-model.md` 3.11 (ADR-003 #2); nilai 0-15 dan 37-40 bukan placeholder.

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/band.ts`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN` (admin), `CSRF_ORIGIN_MISMATCH` (mutasi), `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.

### GET /api/v1/band-tables/active
- **Auth:** user | **Success status:** 200 | **Zod:** `ActiveBandTablesResponseSchema`
**Response (Success):**
```json
{ "data": {
  "listening": { "table_id": "aa11bb22-0001-4000-8000-000000000001", "version_label": "v1-umum-2026-11", "source_note": "Tabel konversi Academic yang umum dipublikasikan. Perkiraan, bervariasi antar versi tes.", "rows": [ { "raw_min": 0, "raw_max": 0, "band": 0.0 }, { "raw_min": 26, "raw_max": 29, "band": 6.5 }, { "raw_min": 39, "raw_max": 40, "band": 9.0 } ] },
  "reading_academic": { "table_id": "aa11bb22-0002-4000-8000-000000000002", "version_label": "v1-umum-2026-11", "source_note": "Tabel konversi Academic yang umum dipublikasikan. Perkiraan, bervariasi antar versi tes.", "rows": [ { "raw_min": 23, "raw_max": 26, "band": 6.0 } ] },
  "disclaimer": "Perkiraan latihan, bukan skor resmi IELTS." } }
```
(Contoh dipotong; respons nyata memuat 17 baris per tabel diurut `raw_min ASC`.)
**Response (Error):** hanya kode umum. Bila salah satu skill tidak punya tabel aktif: 500 `INTERNAL_ERROR` (galat konfigurasi, `error`-log `band_table_inactive`).

### GET /api/v1/admin/band-tables
- **Auth:** admin | **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `skill` | enum | tidak | `LISTENING` \| `READING_ACADEMIC` |
**Response (Success):**
```json
{ "data": [ { "id": "aa11bb22-0001-4000-8000-000000000001", "skill": "LISTENING", "version_label": "v1-umum-2026-11", "is_active": true, "effective_from": "2026-11-03T00:00:00.000Z", "row_count": 17, "used_by_attempts": 12, "created_at": "2026-11-03T00:00:00.000Z" } ] }
```

### GET /api/v1/admin/band-tables/{table_id}
- **Auth:** admin | **Success status:** 200 | **Response:** objek di atas + `source_note` (string \| null) + `rows` (`[{raw_min, raw_max, band}]`).
**Response (Error):** `NOT_FOUND` (404).

### POST /api/v1/admin/band-tables
- **Auth:** admin | **Success status:** 201 | **Zod:** `CreateBandTableRequestSchema`

| Field | Type | Required | Constraint |
|---|---|---|---|
| `skill` | enum | ya | `LISTENING` \| `READING_ACADEMIC` |
| `version_label` | string | ya | trim; 1-60; unik per `skill` |
| `source_note` | string | tidak | <= 500 |
| `rows` | array | ya | 1-41 elemen: `{ raw_min: int 0-40, raw_max: int 0-40, band: number }` dengan `raw_min <= raw_max`, `band` kelipatan 0.5 dalam [0, 9] |
Aturan silang: gabungan rentang HARUS menutup 0..40 tepat sekali (tanpa celah, tanpa tumpang-tindih), dan `band` tidak menurun saat `raw_min` naik.
```json
{ "skill": "READING_ACADEMIC", "version_label": "v2-contoh", "source_note": "Revisi uji", "rows": [ { "raw_min": 0, "raw_max": 14, "band": 4.0 }, { "raw_min": 15, "raw_max": 29, "band": 6.0 }, { "raw_min": 30, "raw_max": 40, "band": 7.5 } ] }
```
**Response (Success) 201:** `{ "data": { "id": "aa11bb22-0003-4000-8000-000000000003", "skill": "READING_ACADEMIC", "version_label": "v2-contoh", "is_active": false, "row_count": 3 } }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | `details[].code`: `range_invalid` (raw_min > raw_max atau di luar 0-40), `band_invalid`, `coverage_gap` (ada nilai 0-40 tak tercakup), `coverage_overlap`, `non_monotonic`, `unrecognized_key` |
| 409 | VERSION_LABEL_TAKEN | `version_label` sudah dipakai pada skill itu |

### POST /api/v1/admin/band-tables/{table_id}/activate
- **Auth:** admin | **Success status:** 200 | **Request body:** tidak ada
**Response (Success) 200:** `{ "data": { "id": "aa11bb22-0003-4000-8000-000000000003", "skill": "READING_ACADEMIC", "is_active": true, "effective_from": "2026-11-03T12:00:00.000Z" } }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Tabel tidak ada |
| 409 | ALREADY_ACTIVE | Tabel sudah aktif |

### DELETE /api/v1/admin/band-tables/{table_id}
- **Auth:** admin | **Success status:** 204
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Tabel tidak ada |
| 409 | BAND_TABLE_IN_USE | Tabel aktif, atau dirujuk `attempts.band_table_id` / `result_json` attempt mana pun. Pesan: "Tabel aktif atau sudah dipakai tidak dapat dihapus." |

## Database Changes
Tidak ada tabel/kolom baru (memakai `band_conversion_tables`, `band_conversion_rows`). Seed: modul `band-tables` (2 tabel, 34 baris, `is_active=true`, `created_by` NULL, `effective_from = now()`). Kendala yang diandalkan: indeks unik parsial `band_tables_one_active_uq (skill) WHERE is_active`, `band_tables_skill_version_uq`. Validasi cakupan/monotonisitas dilakukan aplikasi sebelum insert. Audit: `BAND_TABLE_CREATED`, `BAND_TABLE_ACTIVATE`, `BAND_TABLE_DELETED`.

## UI/UX
Rujukan: `design-system.md` 5.6 Table, 5.2 Input/Form, 5.4 Dialog, 5.19 (hasil: skor mentah -> band), 5.7 Badge.

- **Komponen bersama:** `EstimasiNotice` (teks "Perkiraan latihan, bukan skor resmi IELTS." dengan ikon `Info`, dipakai di semua hasil band/AI), `BandBadge` (angka band 1 desimal + label), `BandConversionTable` (tabel "Skor mentah -> Band" menyorot baris yang dicapai; tersedia juga sebagai daftar kartu di mobile).
- **Admin `/admin/band`:** Table tabel band (Skill, Label, Aktif (Badge "Aktif"), Baris, Dipakai oleh attempt, Aksi); Button "Buat Versi Baru" membuka Sheet: pilih skill, isi label, editor baris (kolom Dari, Sampai, Band) dengan Button "Tambah baris"/hapus baris dan Button "Salin dari tabel aktif"; validasi inline per baris ("Celah: skor 16 tidak tercakup", "Tumpang tindih di 18-22"); Button "Simpan" disabled sampai valid. Aksi "Aktifkan" dan "Hapus" lewat Dialog konfirmasi. Banner permanen: "Tabel ini perkiraan dan bervariasi antar versi tes. Hasil ujian lama tidak berubah saat Anda mengaktifkan versi baru."
- State: loading Skeleton; kosong tidak mungkin (seed); error validasi server ditampilkan per baris dengan `aria-describedby`.

## Acceptance Criteria
- [ ] **Given** DB hasil `db:seed` **When** query tabel aktif **Then** tepat 1 tabel aktif per skill berlabel `v1-umum-2026-11`, masing-masing 17 baris yang menutup 0..40 tanpa celah.
- [ ] **Given** tabel LISTENING seed **When** `convertRawToBand` untuk raw 25 / 26 / 29 / 30 / 0 / 40 **Then** 6.0 / 6.5 / 6.5 / 7.0 / 0.0 / 9.0.
- [ ] **Given** tabel READING_ACADEMIC seed **When** raw 14 / 15 / 18 / 19 / 26 / 27 **Then** 4.5 / 5.0 / 5.0 / 5.5 / 6.0 / 6.5.
- [ ] **Given** semua vektor uji `overallBand`, `bossBand`, `scaleToForty` di atas **When** unit test dijalankan **Then** semuanya lulus.
- [ ] **Given** input hasil rata-rata 6.125, 6.25, 6.375, 6.625, 6.75, 6.875 **When** `roundToHalfBand` **Then** 6.0, 6.5, 6.5, 6.5, 7.0, 7.0.
- [ ] **Given** `scaleToForty(41, 40)` atau `(5, 0)` **When** dipanggil **Then** melempar error (tidak mengembalikan angka).
- [ ] **Given** admin **When** `POST /admin/band-tables` dengan contoh valid di atas **Then** 201, `is_active=false`, `row_count=3`, tabel aktif lama tidak berubah.
- [ ] **Given** rows `[0-14, 16-40]` **When** `POST` **Then** 400 `coverage_gap`; rows `[0-20, 18-40]` -> `coverage_overlap`; band `6.3` -> `band_invalid`; band menurun (`0-20: 6.0`, `21-40: 5.0`) -> `non_monotonic`.
- [ ] **Given** label yang sudah ada pada skill sama **When** `POST` **Then** 409 `VERSION_LABEL_TAKEN`.
- [ ] **Given** tabel baru valid **When** `activate` **Then** 200, tepat 1 tabel aktif untuk skill itu (yang lama `is_active=false`), `audit_log` `BAND_TABLE_ACTIVATE`; `activate` ulang -> 409 `ALREADY_ACTIVE`.
- [ ] **Given** attempt lama dengan `band_table_id` tabel lama **When** tabel baru diaktifkan **Then** `band_score` attempt lama tidak berubah dan tabel lama tidak dapat dihapus (409 `BAND_TABLE_IN_USE`).
- [ ] **Given** `learner` **When** memanggil `POST /admin/band-tables` **Then** 403 `FORBIDDEN`; `GET /band-tables/active` oleh learner 200.
- [ ] **Given** dua `activate` serentak untuk dua tabel skill sama **When** selesai **Then** tetap tepat satu aktif (indeks unik parsial menolak yang kedua dan transaksi diulang/ditolak tanpa 500).
- [ ] **Given** UI hasil **When** menampilkan band **Then** `EstimasiNotice` selalu terlihat pada layar yang menampilkan band (uji komponen pada `BandBadge` container).
- [ ] **Given** E2E admin **When** membuat versi baru dengan celah **Then** tombol Simpan disabled dan pesan "Celah: skor 16 tidak tercakup" tampil.

## Edge Cases & Validation
- [ ] `rows` berisi baris duplikat `raw_min`: 400 `coverage_overlap`.
- [ ] `rows` tidak terurut: diterima (server mengurutkan `raw_min ASC`).
- [ ] `version_label` hanya spasi: 400 (`too_small`).
- [ ] `table_id` bukan uuid: 400 `invalid_uuid`.
- [ ] Aktivasi tabel yang `skill`-nya berbeda dari `skill` tabel aktif tidak saling memengaruhi.
- [ ] Hasil 0 benar dari 40: band 0.0 (bukan error).

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; seed tabel lengkap menggantikan placeholder (ADR-003 #2) |
| 2026-11-03 | Backend Engineer | `scaleToForty` membulatkan juga saat `max=40` (QA F-09-01); FK `attempts.band_table_id` menjadi `ON DELETE RESTRICT` (migrasi 0006; QA F-09-02, ADR-003 #29). |
