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
