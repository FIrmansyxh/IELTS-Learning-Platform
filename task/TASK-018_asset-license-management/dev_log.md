# Dev Log TASK-018: Admin Sumber Konten dan Aset Berlisensi

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W4)

Spec: `specifications/018_spec_asset_license_management.md` (bagian UI/UX) dan `_api-contract.md`.

### Yang dibangun
- **Kontrak (baru, hanya ditambah)**: `src/contracts/assets.ts` (enum `license_type`/`asset_kind`/`rights_status`, `SourceDTO`, `AssetDTO` + `reference_count`/`referenced_by`, response `license-summary`, request create sumber/external/PATCH, tabel `ALLOWED_RIGHTS_BY_KIND`, batas unggah klien). DTO memakai `z.object` (bukan strict) agar field aditif server tidak memutus klien.
- **Klien API**: `lib/api/assets.ts` (sumber, daftar/detail/PATCH/DELETE aset, external, unggah, `licenseSummary`, `fileUrl`) dan `lib/api/upload.ts` (`uploadMultipart` via XMLHttpRequest untuk progres unggah; galat memakai envelope yang sama dengan `apiFetch`).
- **Halaman** (nav admin: "Sumber & Lisensi", "Aset", "Impor Konten"): `/admin/konten/sumber` (`sources-panel.tsx`: tabel kode/nama/lisensi/share-alike/NC/boleh simpan/jumlah aset, Sheet "Tambah Sumber" dengan peringatan CC BY-NC / tautan-saja, default flag mengikuti jenis lisensi, "boleh simpan salinan" dikunci untuk `LINK_ONLY_COPYRIGHTED`/`EMBED_TOS`); `/admin/konten/aset` (`assets-panel.tsx`: pratinjau kecil, filter jenis/hak/sumber/pencarian/"Hanya belum diverifikasi", baris `UNVERIFIED` yang dirujuk bertanda merah + ikon + teks "Menghalangi publikasi", tabel -> kartu di mobile).
- **Sheet**: unggah aset (`upload-asset-sheet.tsx`: dropzone `<label>` bagi input file asli, pilih jenis, judul, sumber hanya yang boleh simpan salinan, kode aset opsional, atribusi, progres, galat per field, "Coba lagi", tautan ke aset duplikat), tautkan video/rujukan (`external-asset-sheet.tsx`: host YouTube, ID 11 karakter terisi otomatis dari URL), detail aset (`asset-detail-sheet.tsx`: pratinjau gambar/audio/dokumen/tautan, metadata, "Dipakai oleh", status hak per `kind` + Dialog konfirmasi menyebut sumber dan lisensi, Hapus disabled bila dirujuk).
- **Banner lisensi** (`license-banner.tsx`) di `/admin` dari `GET /admin/license-summary`: merah untuk `publish_blockers`, kuning untuk sumber NC, info untuk share-alike; mode `nonCommercialOnly` dipakai importer.
- Badge status hak selalu ikon + teks (`license-badges.tsx`). Semua teks di `src/i18n/id.ts` (`assets.*`, kode galat API, kode detail validasi).

### Keputusan dan asumsi
1. Verifikasi, atribusi wajib, kesesuaian sumber, dan penolakan "kembali ke UNVERIFIED saat dipakai konten terbit" HANYA divalidasi server; klien menampilkan pesan Indonesia dari kode (`ATTRIBUTION_REQUIRED`, `RIGHTS_SOURCE_MISMATCH`, `ASSET_IN_PUBLISHED_USE`, dst.). Satu pengecualian UX: klien menahan simpan `VERIFIED_OPEN` untuk sumber `CC_BY*` tanpa atribusi.
2. Tautan "Dipakai oleh" menuju `/admin/konten/kurikulum` (halaman SPEC-020, belum ada); tidak ada deep link per entitas.
3. Pratinjau berkas privat lewat `GET /admin/assets/{id}/file` (sesi admin, `no-store`); dokumen dibuka di tab baru (unduh), video tidak disematkan di admin.
4. Tidak ada pengeditan sumber (PATCH sumber) di UI; spec UI hanya meminta daftar + tambah.

### Verifikasi (di `codes/`, 2026-11-03)
`tsc --noEmit` bersih; `eslint src tests --max-warnings=0` bersih; `vitest run` 35 berkas / 512 tes lulus (tes khusus di `components/admin/content-admin.test.tsx`: banner, sumber, daftar aset + penanda merah + kosong + error, detail, unggah, `uploadMultipart` dengan XHR palsu).
Belum diverifikasi: integrasi dengan backend nyata, interaksi Radix Select di browser, E2E Playwright, tampilan terang/gelap dan 375x812, pembaca layar.


---

## [BACKEND] 2026-11-03 12:40 (Backend Engineer, wave W4)

**Spec:** 018 | **Status:** Completed (sisi server)

### Implementasi (audit terhadap kontrak dan AC)
- `src/server/assets/registry.ts` (`AssetRegistryService`): sumber (`listSources`, `createSource`, `updateSource`), unggah aman (`uploadAsset`: batas ukuran per `kind`, magic bytes, re-encode `sharp` buang EXIF, DOCX tanpa `vbaProject.bin`, `ffprobe` durasi, sha256 unik, nama UUID di `public/<dir>/`), aset eksternal (`createExternalAsset`: host YouTube, `external_ref` cocok URL, advisory lock anti-duplikat), `listAssets` (filter, `ILIKE` dengan escape, `referenced`), `getAsset` (+`referenced_by`), `updateAsset` (matriks hak per `kind`, kesesuaian sumber, atribusi wajib, `ASSET_IN_PUBLISHED_USE`, `license_verified_at/by`), `deleteAsset` (`ASSET_IN_USE`, berkas fisik dihapus setelah commit), `serveAdminAssetFile` (nosniff, `no-store`, `Range` audio), `licenseSummary` (`v_publish_blockers`).
- Rute: `admin/content-sources` (GET, POST, PATCH), `admin/assets` (GET, POST multipart), `admin/assets/external`, `admin/assets/[id]` (GET, PATCH, DELETE), `admin/assets/[id]/file`, `admin/license-summary`. Semua `auth: 'admin'`; mutasi lewat CSRF origin check `withApi`. Audit: `SOURCE_CREATED/UPDATED`, `ASSET_UPLOADED`, `ASSET_EXTERNAL_CREATED`, `LICENSE_STATUS_CHANGED` (`asset_id`, `from`, `to`), `ASSET_DELETED`.
- Audit AC SPEC-018 terhadap kode: seluruh butir terpetakan ke implementasi; kontrak API (method, path, status, kode galat) tidak berubah dan tidak ada perubahan skema DB.

### Celah tes yang ditutup (W4)
- `assets.itest.ts`: MP3 valid (`duration_sec` dari ffprobe, key `public/audio/<uuid>.mp3`; dilewati bila ffmpeg tidak ada), audio 51 MB -> 413 tanpa baris, `title` hanya spasi -> 400, ENOSPC pada penyimpanan -> galat tanpa baris parsial.
- Isolasi DB bersama: helper `cleanupContentFixtures()` di `tests/integration/helpers.ts` dipakai `beforeEach` dan `afterAll` pada `assets.itest.ts` dan `import.itest.ts`, sehingga tidak ada sisa batch impor (FK `import_batches_admin_user_id_users_id_fk` memblokir `bootstrapAdmin` di `auth.itest.ts`), modul/sub-modul `1.99`, aset, atau set di berkas lain. Memperbaiki 3 kegagalan integrasi sebelumnya (`auth.itest.ts:467`, `gatekeeping.itest.ts:95` modul 14 != 13, `:114` 32 != 31) tanpa melonggarkan asersi.

### Catatan
- Di luar lingkup: dengan urutan berkas acak (`--sequence.shuffle.files --sequence.seed=1`) `player.itest.ts` "ambang waktu mengikuti app_settings learn.min_active_seconds" gagal (409); lulus pada urutan default dan sendirian. Bergantung pada keadaan berkas lain; bukan bagian SPEC-018/019.

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
| 2026-11-03 12:40 | Backend W4: audit endpoint/AC, celah tes unggah, isolasi data tes |


---

## [BACKEND] 2026-11-03 13:45 (Backend Engineer, wave W4) - Perbaikan QA (qa_report TASK-018)

| ID | Status | Perubahan |
|---|---|---|
| F-18-01 (MEDIUM) | DITUTUP | Migrasi baru `drizzle/0007_qa_w4_publish_blockers_stimulus.sql` (+ jurnal, snapshot) mengganti `v_publish_blockers`: cabang set kini mencakup `questions_json[].stimulus_asset_code` selain `listening_asset_id`. `registry.ts`: `referencesOf`, `reference_count`, filter `referenced` memakai predikat set yang sama, sehingga `DELETE` -> `ASSET_IN_USE`, `PATCH UNVERIFIED` pada set PUBLISHED -> `ASSET_IN_PUBLISHED_USE`, dan `computeBlockers` memuat `ASSET_UNVERIFIED`. Tes `assets.itest.ts` (F-18-01). |
| F-18-02 (LOW) | DITUTUP | `non_commercial_only=false` pada `CC_BY_NC` dan `share_alike=false` pada `CC_BY_SA` ditolak (400 `flag_required_by_license`) di POST dan PATCH. Tes ditambah. |
| F-18-03 (LOW) | DITUTUP | Pengosongan atribusi pada aset `VERIFIED_OPEN` sumber CC BY/SA -> 409 `ATTRIBUTION_REQUIRED`. Tes ditambah. |
| F-18-07 (LOW) | DITUTUP (sebagian) | `ffprobe` memakai `-protocol_whitelist file` dan dihentikan (SIGKILL) setelah 10 dtk. Pembatasan `-f <format>` tidak dilakukan. |
| F-18-04, 05, 06, 08, 09, 10(b,d) | DITUNDA | 04 (banner dari `source_id` materi/set), 05 (TOCTOU PATCH vs publish; jendela sempit, admin saja), 06 (pemindaian aksi aktif PDF/DOCX), 08 (memori unggahan, `limitInputPixels`), 09 (bucket rate limit unggah), 10(b,d) (tes serentak/urutan multipart). Dicatat untuk hardening rilis. |

Kontrak diubah aditif saja (kode detail baru, view); dicatat di spec 018 dan `_api-contract.md`.

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
| 2026-11-03 13:45 | Backend W4: perbaikan QA F-18-01/02/03/07 |
