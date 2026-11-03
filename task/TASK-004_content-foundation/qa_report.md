# QA & Security Report: TASK-004 Fondasi Konten
**Date:** 2026-11-03
**Target Branch:** claude/ielts-learning-platform-a3ccc4 (working tree, belum di-commit)
**Verifikasi:** `tsc`, `eslint --max-warnings=0`, `vitest run` (`content-validate` 60 tes, `assets-validate` 7, `seed` 4) lulus. Tes integrasi konten (13) tidak dijalankan QA. Temuan bersama ada di `task/TASK-001_auth-session/qa_report.md`.
**Status:** KODE LULUS DENGAN CATATAN; TASK BELUM SELESAI (Golden Sample GS-1..GS-6 belum dibuat, AC terkait tidak terverifikasi).

## 1. Code Quality & Standards
- [x] Pass. Pipeline jelas (validate -> plan -> apply -> publish), idempoten, satu transaksi, pembersihan berkas bila rollback (`import-service.ts:176-243`), kontrak `strictObject`, kode galat terstruktur. `validate.ts` 510 baris (cukup besar; pertimbangkan dipecah pada refactor berikutnya).

## 2. Security Assessment
- [x] Pass dengan catatan
- Terverifikasi: tolak kunci `__proto__/constructor/prototype` dan salin objek dengan `defineProperty` (`validate.ts:98-118`); batas kedalaman 10, ukuran paket 5 MB (`import-service.ts:17,38`), 2.000 item, karakter kontrol ditolak; Markdown: HTML mentah dan skema `javascript:/data:/vbscript:` ditolak; `image_url/file_url` tidak pernah di-fetch (hanya `/storage/..` dipetakan ke asset_code; tidak ada SSRF); SVG ditolak; magic bytes `file-type` + kecocokan ekstensi (`assets.ts:117-134`); path traversal (`assets.ts:93-100`); DOCX makro ditolak; gambar di-re-encode `sharp` (EXIF hilang) dengan `limitInputPixels`; nama berkas UUID + `FsStorageDriver` memvalidasi `KEY_RE` dan memastikan tetap di bawah root (`storage/index.ts:255-266`); `sha256`/`size`/`mime` disimpan. Lisensi: `OPEN_LICENSED_ADAPTED` wajib source, sumber `mayStoreCopy=false`/LINK_ONLY ditolak, atribusi CC BY wajib, `EMBED_ONLY/LINK_ONLY` tidak boleh berkas (`validate.ts` manifest), publish diblok `v_publish_blockers` (`publish.ts`). Audit `CONTENT_IMPORTED_CLI/PUBLISHED/STATUS_CHANGED`.
- DTO tanpa kunci jawaban: W1 tidak punya endpoint penyaji soal, jadi tidak ada kebocoran; `src/contracts/content.ts` memuat `correct_answers` hanya sebagai kontrak IMPORT, bukan DTO publik. DTO publik terpisah wajib dibuat dan dites di SPEC-006 (security-standards 6.1).
- Temuan:

| ID | Sev | Lokasi | Ringkas |
|---|---|---|---|
| F-21 | MEDIUM (proses) | dev_log TASK-004 butir 1 | Golden Sample belum ada: AC "validate content/golden-sample exit 0 (3 sub-modul, 3 drill, placement 30, skip 12, boss + 4 section)", komposisi tipe soal GS-1/2/3, dan GS-1 UNLOCKED di `/peta` tidak terverifikasi. SPEC-005/006/008/010/011/014/015 bergantung pada konten ini. |
| F-10 | LOW | `src/server/content/assets.ts:54,76,103` | (a) `ffprobe` dijalankan tanpa timeout dan `-nostdin` (standar 14.2); (b) `wavDuration` membaca `readUInt32LE(off+16)` tanpa cek batas bila chunk `fmt ` terpotong, melempar RangeError tak tertangkap saat ffprobe tidak ada; (c) `stat(full)` mengikuti symlink di dalam `assets/` tanpa `realpath`, sehingga symlink dapat keluar dari root. Berlaku untuk CLI admin lokal; wajib dibereskan sebelum SPEC-019 (importer web). |
| F-11 | LOW | `src/server/content/validate.ts:127-133` | `stripCode` membuang `~~~ ... ~~~` di tengah baris (bukan fence CommonMark) sebelum cek HTML mentah, sehingga `~~~ <img onerror=..> ~~~` lolos validator. Pertahanan sebenarnya ada di renderer: pada SPEC-005 pastikan `react-markdown` TANPA `rehype-raw` dan ada tes XSS. Perketat regex fence ke awal baris. |
| F-12 | LOW | `codes/.dockerignore`; `codes/Dockerfile:23` | `.local-pg/` (berisi `secrets.json` password PG lokal + data) tidak dikecualikan dari konteks build; `COPY . .` pada stage builder membawanya ke layer/cache (bukan ke image akhir). Tambah `.local-pg`. |
| F-18 | LOW | `scripts/migrate.ts:36` | `pg_dump --dbname <url>` menaruh password di argumen proses (terlihat di daftar proses). Pakai `PGPASSWORD` di env anak proses. |
| F-14 | LOW | `src/server/content/import-service.ts:242` | Pesan "Galat teknis" mencetak `e.message` mentah (dapat memuat SQL + parameter Drizzle). Sederhanakan (lihat F-01). |
| F-20 | LOW | `src/server/storage/index.ts:255`; standar 4.1.1 | Layout key `xx/uuid.ext` datar, tanpa pemisahan `public|private/{kind}`. Aman untuk sekarang; saat SPEC-005/011/013 menyajikan berkas, sajikan hanya lewat route terotorisasi dengan `nosniff` dan Content-Type whitelist, dan tambahkan pemisahan private (rekaman). |

## 3. Architecture Alignment
- [x] Pass. 4 tier / 13 modul / 31 sub-modul DRAFT sesuai seed (T1=8, T2=8, T3=9, T4=6; teruji `seed.test.ts`); migrasi 0004 menambah `asset_code` + indeks unik parsial; kontrak v1.0 diterjemahkan ke v1.1; CLI exit code 0/1/2/3. `STORAGE_DRIVER=s3` belum ada (melempar galat jelas), sesuai dev_log.

## 4. Recommendations
1. Selesaikan Golden Sample (pekerjaan konten, backlog C-01..C-04) sebelum menandai TASK-004 done; Tester dapat menguji library/CLI dengan fixture sintetis dulu.
2. Perbaiki F-10 (timeout ffprobe, bounds WAV, `realpath`), F-11, F-12, F-18 (semuanya kecil).
3. Pada SPEC-006 buat `QuestionPublicDTO` allow-list + tes serializer (tidak ada `correct`, `answer`, `explanation`, `accepted`).

**Keputusan:** Kode aman untuk diuji; status task tetap `development` sampai Golden Sample selesai.
