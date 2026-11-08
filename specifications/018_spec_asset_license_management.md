# SPEC-018: Admin Sumber Konten & Aset Berlisensi (Unggah, Verifikasi Lisensi)

> **DIGANTIKAN sebagian oleh SPEC-025 / ADR-005 (2026-11-08).** UI dan API admin untuk fitur ini dihapus. Konten diimpor lewat CLI (`npm run content:validate|import`, `bank:validate`); pipeline impor batch, manajemen aset via UI, dan kurasi via UI tidak ada lagi. Dokumen dipertahankan sebagai riwayat.

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-001, SPEC-002, SPEC-004
- **Prioritas:** P0 (prasyarat mitigasi risiko R4 dan publikasi konten)
- **Cakupan:** Backend (unggah aman, verifikasi hak) + Frontend (halaman admin Sumber dan Aset)

## User Story
Sebagai Admin (kurator konten), saya ingin mencatat sumber materi beserta lisensinya, mengunggah aset (slide, dokumen, audio, gambar) atau menautkan aset eksternal (video YouTube, rujukan), dan memverifikasi status hak tiap aset, sehingga tidak ada konten berhak cipta atau bersumber tak jelas yang terpublikasi.

## Non-Goals / Out of Scope
- Tidak mengunduh aset dari URL (tidak ada fetch server-side; anti-SSRF). Aset hanya diunggah admin atau ditautkan sebagai rujukan.
- Tidak mengunduh atau menyalin video pihak ketiga; video hanya `VIDEO_EMBED` dengan `external_ref`.
- Tidak mendukung SVG, makro Office (`.docm`, `vbaProject.bin`), atau berkas selain yang ada di matriks.
- Tidak ada pengeditan isi berkas setelah unggah (ganti = unggah aset baru).
- Tidak menyunting kurikulum/soal (SPEC-019/020) dan tidak memublikasikan konten.
- Tidak ada deteksi otomatis lisensi dari berkas; verifikasi selalu keputusan manusia (Admin).
- Tidak mengelola rekaman Speaking pengguna (SPEC-013).
- Tidak ada OCR, transkripsi, atau pembuatan alt-text otomatis.

## Technical Flow
1. Admin membuka `/admin/konten/sumber` dan menambah sumber (`POST /admin/content-sources`) bila belum ada (14 sumber awal dari seed tersedia).
2. Admin membuka `/admin/konten/aset`, menekan "Unggah Aset", memilih berkas dan mengisi `kind`, `title`, `source_id`, `asset_code` (opsional), `attribution_text` (opsional); klien memanggil `POST /api/v1/admin/assets` (multipart).
3. Server membaca aliran dengan batas ukuran per `kind`, mendeteksi MIME dari magic bytes, memvalidasi isi (gambar dire-encode `sharp` untuk membuang EXIF; DOCX diperiksa struktur ZIP dan tanpa `vbaProject.bin`; audio dibaca `ffprobe`), menghitung `sha256`, dan menolak duplikat.
4. Server menyimpan berkas lewat `StorageDriver` dengan nama UUID, membuat baris `content_assets` (`rights_status='UNVERIFIED'`), menulis `audit_log` `ASSET_UPLOADED`, dan merespons 201.
5. Untuk video/rujukan, Admin memakai `POST /api/v1/admin/assets/external`.
6. Admin memeriksa lisensi, lalu memanggil `PATCH /api/v1/admin/assets/{id}` dengan `rights_status` baru; server memvalidasi kesesuaian dengan sumber dan jenis aset, mengisi `license_verified_at/by`, dan menulis `audit_log` `LICENSE_STATUS_CHANGED`.
7. Aset yang sudah `OWN_ORIGINAL`/`VERIFIED_OPEN`/`EMBED_ONLY`/`LINK_ONLY` tidak lagi menghalangi publikasi (view `v_publish_blockers`, SPEC-000).
8. Admin dapat melihat ringkasan lisensi lewat `GET /api/v1/admin/license-summary` pada banner admin.

### Matriks Unggah (WAJIB; security 4.2)
| `kind` | MIME (magic bytes) | Batas | Pemrosesan | `storage_key` |
|---|---|---|---|---|
| `SLIDE_IMAGE` | `image/webp`, `image/png`, `image/jpeg` | 5 MB (`UPLOAD_MAX_MB_IMAGE`) | re-encode `sharp` (buang EXIF), simpan ekstensi asli | `public/slides/<uuid>.<ext>` |
| `IMAGE` | sama | 5 MB | sama | `public/images/<uuid>.<ext>` |
| `DOCUMENT` | `application/pdf`; DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) | 25 MB (`UPLOAD_MAX_MB_DOCUMENT`) | DOCX: validasi ZIP, tolak `vbaProject.bin`/`.docm` | `public/documents/<uuid>.<pdf\|docx>` |
| `AUDIO_LISTENING` | `audio/mpeg`, `audio/ogg`, `audio/wav` | 50 MB (`UPLOAD_MAX_MB_AUDIO_ASSET`) | `ffprobe` -> `duration_sec` (wajib terbaca) | `public/audio/<uuid>.<mp3\|ogg\|wav>` |
Ekstensi/`Content-Type` klien diabaikan. Nama berkas asli tidak disimpan di path.

## API Contract
Konvensi: `_api-contract.md` bagian 1. Zod di `src/contracts/assets.ts`. Semua endpoint **Auth: admin**. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN`, `CSRF_ORIGIN_MISMATCH` (mutasi), `NOT_FOUND`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`, `INTERNAL_ERROR`.

**`SourceDTO`:** `{ id: uuid, code: string, name: string, url: string|null, license_type: enum license_type, license_note: string|null, attribution_template: string|null, share_alike: boolean, non_commercial_only: boolean, may_store_copy: boolean, asset_count: int }`
**`AssetDTO`:** `{ id: uuid, asset_code: string|null, kind: enum asset_kind, title: string, source: { id: uuid, code: string, name: string, license_type: string }, rights_status: enum rights_status, storage_backend: "FILESYSTEM"|"MINIO"|"EXTERNAL", mime_type: string|null, size_bytes: int|null, duration_sec: int|null, external_url: string|null, external_ref: string|null, attribution_text: string|null, license_verified_at: string|null, license_verified_by_name: string|null, created_at: string, updated_at: string }` (tanpa `storage_key`, `sha256`).

### GET /api/v1/admin/content-sources
- **Success status:** 200 | **Response:** `{ "data": [ <SourceDTO> ] }` (semua sumber, urut `code ASC`, tanpa paginasi).

### POST /api/v1/admin/content-sources
- **Success status:** 201 | **Zod:** `CreateSourceRequestSchema`
| Field | Type | Required | Constraint |
|---|---|---|---|
| `code` | string | ya | regex `^[A-Z][A-Z0-9_]{1,39}$`; unik |
| `name` | string | ya | 1-150 |
| `url` | string | tidak | `https://` valid, <= 500 |
| `license_type` | enum | ya | `OWN` \| `CC0` \| `CC_BY` \| `CC_BY_SA` \| `CC_BY_NC` \| `MIT` \| `EMBED_TOS` \| `LINK_ONLY_COPYRIGHTED` \| `OTHER` |
| `license_note` | string | tidak | <= 1000 |
| `attribution_template` | string | tidak | <= 500 |
| `share_alike` | boolean | tidak | default `true` bila `license_type = CC_BY_SA`, selain itu `false` |
| `non_commercial_only` | boolean | tidak | default `true` bila `CC_BY_NC`, selain itu `false` |
| `may_store_copy` | boolean | tidak | default `false`; `true` DILARANG bila `license_type` `LINK_ONLY_COPYRIGHTED` atau `EMBED_TOS` |
```json
{ "code": "OPENLEARN_X", "name": "OpenLearn (contoh)", "url": "https://www.open.edu/openlearn/", "license_type": "CC_BY_NC", "license_note": "CC BY-NC-SA 4.0", "attribution_template": "Sumber: OpenLearn, The Open University (CC BY-NC-SA 4.0)" }
```
**Response (Success) 201:** `{ "data": <SourceDTO> }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Format salah; `details[].code = "store_copy_not_allowed"` bila `may_store_copy=true` dengan tipe lisensi terlarang |
| 409 | SOURCE_CODE_TAKEN | `code` sudah ada |

### PATCH /api/v1/admin/content-sources/{source_id}
- **Success status:** 200 | **Zod:** `UpdateSourceRequestSchema`
Field boleh diubah (minimal satu): `name`, `url`, `license_note`, `attribution_template`, `share_alike`, `non_commercial_only`, `may_store_copy` (aturan sama dengan POST). `code` dan `license_type` tidak dapat diubah (field itu ditolak `unrecognized_key`).
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body kosong (`empty_update`), `store_copy_not_allowed`, `unrecognized_key` |
| 404 | NOT_FOUND | Sumber tidak ada |
| 409 | SOURCE_IN_USE | `may_store_copy` diubah ke `false` padahal ada aset tersimpan berkas dari sumber ini |

### POST /api/v1/admin/assets
- **Success status:** 201 | **Content-Type:** `multipart/form-data` | **Zod:** `UploadAssetFieldsSchema` | **Rate limit:** `general_user`
| Part | Type | Required | Constraint |
|---|---|---|---|
| `kind` | text | ya | `SLIDE_IMAGE` \| `IMAGE` \| `DOCUMENT` \| `AUDIO_LISTENING` |
| `title` | text | ya | 1-200 |
| `source_id` | text uuid | ya | sumber dengan `may_store_copy = true` |
| `asset_code` | text | tidak | regex `^[a-z0-9][a-z0-9/_-]{2,79}$`; unik |
| `attribution_text` | text | tidak | <= 500 |
| `file` | file | ya (tepat satu) | sesuai Matriks Unggah |
**Response (Success) 201:**
```json
{ "data": { "id": "c1d2e3f4-0002-4000-8000-0000000000a2", "asset_code": "tier2/slides/passive-diagram-flow", "kind": "SLIDE_IMAGE", "title": "Diagram alur pasif pabrik", "source": { "id": "5a5a5a5a-0001-4000-8000-000000000001", "code": "OWN", "name": "Konten orisinal pemilik", "license_type": "OWN" }, "rights_status": "UNVERIFIED", "storage_backend": "FILESYSTEM", "mime_type": "image/webp", "size_bytes": 182340, "duration_sec": null, "external_url": null, "external_ref": null, "attribution_text": null, "license_verified_at": null, "license_verified_by_name": null, "created_at": "2026-11-03T09:00:00.000Z", "updated_at": "2026-11-03T09:00:00.000Z" } }
```
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | `details[].code`: `file_required`, `multiple_files`, `invalid_kind`, `asset_code_invalid`, `audio_unreadable`, `docx_invalid`, `unrecognized_key` |
| 404 | NOT_FOUND | `source_id` tidak ada |
| 409 | SOURCE_NOT_STORABLE | Sumber `may_store_copy=false`. Pesan: "Sumber ini hanya boleh ditautkan, bukan disimpan." |
| 409 | ASSET_CODE_TAKEN | `asset_code` sudah dipakai |
| 409 | DUPLICATE_ASSET | `sha256` sama dengan aset lain; `details[0] = { "path": "file", "code": "duplicate_of", "message": "<id aset yang sudah ada>" }` |
| 413 | PAYLOAD_TOO_LARGE | Melewati batas ukuran `kind` (pembacaan dihentikan saat batas terlampaui) |
| 415 | UNSUPPORTED_MEDIA_TYPE | Bukan `multipart/form-data` |
| 415 | UNSUPPORTED_FILE_TYPE | Magic bytes tidak ada di matriks `kind` (termasuk SVG). Pesan: "Jenis berkas tidak didukung." |
| 415 | MACRO_NOT_ALLOWED | DOCX berisi `vbaProject.bin` atau bertipe makro |

### POST /api/v1/admin/assets/external
- **Success status:** 201 | **Zod:** `CreateExternalAssetRequestSchema`
| Field | Type | Required | Constraint |
|---|---|---|---|
| `kind` | enum | ya | `VIDEO_EMBED` \| `REFERENCE_LINK` |
| `title` | string | ya | 1-200 |
| `source_id` | uuid | ya | sumber ada |
| `external_url` | string | ya | `https://`, <= 500; `VIDEO_EMBED`: host `www.youtube.com`, `youtube.com`, `youtu.be`, atau `www.youtube-nocookie.com` |
| `external_ref` | string | wajib bila `VIDEO_EMBED` | regex `^[A-Za-z0-9_-]{11}$` dan sama dengan id video di `external_url`; dilarang bila `REFERENCE_LINK` |
| `attribution_text` | string | tidak | <= 500 |
```json
{ "kind": "VIDEO_EMBED", "title": "Passive Voice - Kampung Inggris LC", "source_id": "5a5a5a5a-0008-4000-8000-000000000008", "external_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "external_ref": "dQw4w9WgXcQ" }
```
Status awal: `VIDEO_EMBED` -> `UNVERIFIED`; `REFERENCE_LINK` -> `LINK_ONLY`. `storage_backend="EXTERNAL"`, `storage_key=NULL`.
**Response (Success) 201:** `{ "data": <AssetDTO> }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Host tidak diizinkan (`host_not_allowed`), `external_ref` tidak cocok dengan URL (`ref_mismatch`), format salah |
| 404 | NOT_FOUND | Sumber tidak ada |
| 409 | ASSET_ALREADY_EXISTS | `VIDEO_EMBED` dengan `external_ref` sama sudah ada; `details[0].message` = id aset |

### GET /api/v1/admin/assets
- **Success status:** 200
| Query | Type | Required | Constraint |
|---|---|---|---|
| `kind` | enum | tidak | nilai `asset_kind` |
| `rights_status` | enum | tidak | nilai `rights_status` |
| `source_id` | uuid | tidak | |
| `q` | string | tidak | 1-100; cocok `ILIKE` pada `title` atau `asset_code` (escape `%` `_`) |
| `referenced` | boolean | tidak | `true` = dirujuk konten; `false` = yatim |
| `page`, `page_size` | int | tidak | page >= 1; page_size 1-100 (default 20) |
Urutan `created_at DESC`. **Response:** `{ "data": [ <AssetDTO + reference_count: int> ], "meta": { ... } }`.

### GET /api/v1/admin/assets/{asset_id}
- **Success status:** 200 | **Response:** `{ "data": { ...AssetDTO, "referenced_by": [ { "entity_type": "SUB_MODULE", "entity_id": "<uuid>", "label": "2.1.3 Passive Voice", "status": "DRAFT" } ] } }` (`entity_type`: `SUB_MODULE` (slides/attachments/videos), `ASSESSMENT_SET` (listening/stimulus)).
**Response (Error):** `NOT_FOUND` (404).

### GET /api/v1/admin/assets/{asset_id}/file
- **Success status:** 200 | Pratinjau berkas aset tersimpan (kind bukan `VIDEO_EMBED`/`REFERENCE_LINK`) dengan header `Content-Type` dari DB, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `Content-Disposition: attachment` untuk `DOCUMENT` dan `inline` selainnya; audio mendukung `Range`. **Error:** `NOT_FOUND` (404) bila aset eksternal atau berkas hilang.

### PATCH /api/v1/admin/assets/{asset_id}
- **Success status:** 200 | **Zod:** `UpdateAssetRequestSchema`
| Field | Type | Required | Constraint |
|---|---|---|---|
| `title` | string | tidak | 1-200 |
| `attribution_text` | string \| null | tidak | <= 500 |
| `rights_status` | enum | tidak | lihat aturan di bawah |
Minimal satu field. Aturan `rights_status` (tabel nilai yang diizinkan per `kind`): `SLIDE_IMAGE`, `IMAGE`, `DOCUMENT`, `AUDIO_LISTENING` -> `UNVERIFIED` \| `OWN_ORIGINAL` \| `VERIFIED_OPEN`; `VIDEO_EMBED` -> `UNVERIFIED` \| `EMBED_ONLY`; `REFERENCE_LINK` -> `LINK_ONLY` saja. Kesesuaian sumber: `OWN_ORIGINAL` hanya bila `source.license_type = OWN`; `VERIFIED_OPEN` hanya bila `source.license_type` salah satu `CC0`, `CC_BY`, `CC_BY_SA`, `CC_BY_NC`, `MIT`. Atribusi: bila sumber `share_alike` atau `license_type` diawali `CC_BY`, memverifikasi (`VERIFIED_OPEN`) membutuhkan `attribution_text` non-kosong pada aset (di request atau sudah ada). Efek: status terverifikasi mengisi `license_verified_at = now()` dan `license_verified_by` = admin; kembali ke `UNVERIFIED` mengosongkan keduanya.
```json
{ "rights_status": "OWN_ORIGINAL" }
```
**Response (Success) 200:** `{ "data": <AssetDTO> }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body kosong (`empty_update`), nilai `rights_status` tidak diizinkan untuk `kind` (`rights_status_invalid_for_kind`) |
| 404 | NOT_FOUND | Aset tidak ada |
| 409 | RIGHTS_SOURCE_MISMATCH | `OWN_ORIGINAL`/`VERIFIED_OPEN` tidak cocok dengan lisensi sumber |
| 409 | ATTRIBUTION_REQUIRED | Atribusi wajib tetapi kosong |
| 409 | ASSET_IN_PUBLISHED_USE | Mengubah ke `UNVERIFIED` padahal dirujuk entitas `PUBLISHED` |

### DELETE /api/v1/admin/assets/{asset_id}
- **Success status:** 204 (berkas fisik dihapus, baris dihapus, `audit_log` `ASSET_DELETED`)
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Tidak ada |
| 409 | ASSET_IN_USE | Dirujuk konten mana pun (status apa pun) |

### GET /api/v1/admin/license-summary
- **Success status:** 200
**Response (Success):**
```json
{ "data": { "assets_by_rights_status": { "UNVERIFIED": 3, "VERIFIED_OPEN": 2, "OWN_ORIGINAL": 18, "EMBED_ONLY": 4, "LINK_ONLY": 1 }, "publish_blockers": 3, "non_commercial_sources_in_use": ["OPENLEARN"], "share_alike_sources_in_use": ["NGSL"] } }
```
`publish_blockers` = jumlah baris `v_publish_blockers` (aset `UNVERIFIED` yang dirujuk). Daftar sumber = `code` sumber dengan flag terkait yang punya aset.

## Database Changes
Tidak ada tabel/kolom baru (memakai `content_sources`, `content_assets`; `asset_code` dari SPEC-004). Kendala diandalkan: `content_assets_nocopy_chk`, `content_assets_location_chk`, `content_assets_sha256_uq`, `content_assets_asset_code_uq`, `content_sources_nocopy_chk`. Audit: `SOURCE_CREATED`, `SOURCE_UPDATED`, `ASSET_UPLOADED`, `ASSET_EXTERNAL_CREATED`, `LICENSE_STATUS_CHANGED` (`metadata`: `asset_id`, `from`, `to`), `ASSET_DELETED`. Penulisan lewat `AssetRegistryService` (SPEC-004).

## UI/UX
Rujukan: `design-system.md` 5.20 Admin Importer (kolom `source`/`license`, aset tanpa lisensi ditandai merah), 5.6 Table, 5.4 Dialog/Sheet, 5.2 Input/Form (dropzone file), 5.7 Badge/Toast.

- **`/admin/konten/sumber`:** Table (Kode, Nama, Lisensi (Badge), Share-alike, Non-komersial, Boleh simpan salinan, Jumlah aset) + Button "Tambah Sumber" (Sheet form; Select lisensi dengan peringatan teks "Sumber CC BY-NC hanya untuk penggunaan non-komersial" dan "Sumber tautan-saja tidak boleh disimpan salinannya"). Kosong tidak mungkin (seed).
- **`/admin/konten/aset`:** Table (Pratinjau kecil, Judul, Kode, Jenis, Sumber, Hak (Badge ikon + teks), Dirujuk, Tanggal) + filter jenis, hak, sumber, pencarian, "Hanya belum diverifikasi"; baris `UNVERIFIED` yang dirujuk ditandai merah dengan ikon `AlertTriangle` dan teks "Menghalangi publikasi". Button "Unggah Aset" membuka Sheet: dropzone (klik/seret, juga tombol "Pilih berkas"), Select jenis, Input judul, Select sumber (hanya yang boleh simpan salinan), kode aset opsional, atribusi; progres unggah; galat per field. Button "Tautkan Video/Rujukan" membuka Sheet kedua.
- **Detail aset (Sheet):** pratinjau (gambar/PDF tautan/audio player), metadata, daftar "Dipakai oleh" (tautan ke kurikulum), Select "Status hak" + Button "Simpan status" (Dialog konfirmasi menyebut sumber dan lisensi), tombol destruktif "Hapus" (disabled bila dirujuk).
- **Banner** di `/admin` (SPEC-002): "{n} aset belum diverifikasi menghalangi publikasi" dari `license-summary`; banner kuning "Sumber non-komersial dipakai: OPENLEARN. Jangan dikomersialkan." bila `non_commercial_sources_in_use` tidak kosong.
- State: loading Skeleton tabel; unggah gagal: galat inline + Button "Coba lagi"; kosong: "Belum ada aset. Unggah aset pertama Anda."
- Mobile: Table menjadi daftar kartu; Sheet jadi layar penuh.

## Acceptance Criteria
- [ ] **Given** admin **When** `POST /admin/assets` dengan WebP valid 180 KB, `kind=SLIDE_IMAGE`, sumber `OWN` **Then** 201, `rights_status="UNVERIFIED"`, `mime_type="image/webp"`, berkas ada di `public/slides/<uuid>.webp`, `sha256` terisi, dan respons tidak memuat `storage_key`/`sha256`.
- [ ] **Given** PNG yang dire-encode **When** diperiksa **Then** tidak ada metadata EXIF/GPS pada berkas tersimpan.
- [ ] **Given** berkas `.svg` atau EXE berekstensi `.png` **When** diunggah sebagai `SLIDE_IMAGE` **Then** 415 `UNSUPPORTED_FILE_TYPE`, tidak ada berkas/baris tersimpan.
- [ ] **Given** DOCX berisi `word/vbaProject.bin` **When** diunggah **Then** 415 `MACRO_NOT_ALLOWED`; PDF valid 3 MB -> 201 (`DOCUMENT`).
- [ ] **Given** gambar 6 MB **When** diunggah **Then** 413 `PAYLOAD_TOO_LARGE` dan byte tertulis <= 5 MB + 64 KB; audio 51 MB -> 413.
- [ ] **Given** MP3 valid **When** diunggah (`AUDIO_LISTENING`) **Then** 201 dengan `duration_sec` hasil `ffprobe`; berkas audio korup -> 400 `audio_unreadable`.
- [ ] **Given** berkas identik diunggah dua kali **When** kedua **Then** 409 `DUPLICATE_ASSET` dengan id aset pertama; `asset_code` ganda -> 409 `ASSET_CODE_TAKEN`.
- [ ] **Given** sumber `CAMBRIDGE_REF` (`may_store_copy=false`) **When** unggah berkas dengan `source_id` itu **Then** 409 `SOURCE_NOT_STORABLE`.
- [ ] **Given** `POST /admin/content-sources` dengan `license_type="LINK_ONLY_COPYRIGHTED"` dan `may_store_copy=true` **When** dikirim **Then** 400 `store_copy_not_allowed`; kode ganda -> 409 `SOURCE_CODE_TAKEN`.
- [ ] **Given** `PATCH` sumber dengan field `license_type` **When** dikirim **Then** 400 `unrecognized_key`.
- [ ] **Given** `POST /admin/assets/external` `VIDEO_EMBED` dengan URL `https://www.youtube.com/watch?v=dQw4w9WgXcQ` dan `external_ref` sama **When** dikirim **Then** 201, `rights_status="UNVERIFIED"`, `storage_backend="EXTERNAL"`, tidak ada `storage_key`; dengan `external_url` `https://evil.example/x` -> 400 `host_not_allowed`; `external_ref` tidak cocok -> 400 `ref_mismatch`; duplikat -> 409 `ASSET_ALREADY_EXISTS`.
- [ ] **Given** `REFERENCE_LINK` **When** dibuat **Then** `rights_status="LINK_ONLY"` dan `external_ref=NULL`.
- [ ] **Given** aset `SLIDE_IMAGE` sumber `OWN` **When** `PATCH rights_status=OWN_ORIGINAL` **Then** 200, `license_verified_at` dan `license_verified_by_name` terisi, `audit_log` `LICENSE_STATUS_CHANGED` (`from`/`to`); `PATCH rights_status=EMBED_ONLY` pada `SLIDE_IMAGE` -> 400 `rights_status_invalid_for_kind`.
- [ ] **Given** aset dari sumber `NGSL` (CC_BY_SA, share-alike) tanpa atribusi **When** `PATCH rights_status=VERIFIED_OPEN` **Then** 409 `ATTRIBUTION_REQUIRED`; dengan `attribution_text` -> 200.
- [ ] **Given** aset sumber `TATOEBA` **When** `PATCH rights_status=OWN_ORIGINAL` **Then** 409 `RIGHTS_SOURCE_MISMATCH`.
- [ ] **Given** aset `OWN_ORIGINAL` dirujuk sub-modul `PUBLISHED` **When** `PATCH rights_status=UNVERIFIED` **Then** 409 `ASSET_IN_PUBLISHED_USE`.
- [ ] **Given** aset dirujuk konten **When** `DELETE` **Then** 409 `ASSET_IN_USE`; aset yatim -> 204 dan berkas fisik hilang.
- [ ] **Given** aset `UNVERIFIED` yang dirujuk **When** `GET /admin/license-summary` **Then** `publish_blockers` >= 1; setelah diverifikasi berkurang 1.
- [ ] **Given** `GET /admin/assets?referenced=false&rights_status=UNVERIFIED` **When** dipanggil **Then** hanya aset yatim `UNVERIFIED`.
- [ ] **Given** `learner` **When** memanggil endpoint apa pun di sini **Then** 403 `FORBIDDEN`; `GET /admin/assets/{id}/file` oleh learner 403.
- [ ] **Given** `q="%"` **When** mencari **Then** diperlakukan literal (tidak mengembalikan semua baris).
- [ ] **Given** E2E Playwright **When** admin mengunggah slide, memverifikasi sebagai Milik Sendiri, lalu aset dipakai di Golden Sample **Then** `publish_blockers` turun dan baris tidak lagi merah; pada 375x812 tabel menjadi kartu tanpa scroll horizontal.

## Edge Cases & Validation
- [ ] Koneksi putus saat unggah: berkas sementara dibersihkan, tidak ada baris yatim.
- [ ] Dua unggahan berkas sama serentak: satu 201, satu 409 `DUPLICATE_ASSET` (indeks unik `sha256`).
- [ ] `title` hanya spasi: 400.
- [ ] Penyimpanan penuh (ENOSPC): 500 `INTERNAL_ERROR`, tanpa baris/berkas parsial.
- [ ] Path traversal tidak mungkin (nama server-generated); uji memastikan `asset_code` berisi `..` ditolak (`asset_code_invalid`).
- [ ] Mengubah `attribution_text` pada aset terverifikasi tidak mengubah `rights_status`.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft |
