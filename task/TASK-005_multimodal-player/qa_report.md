# QA & Security Report: TASK-005 Pemutar Materi Multimodal
**Date:** 2026-11-03 12:10
**Target Branch:** claude/ielts-learning-platform-a3ccc4 (working tree, belum di-commit)
**Reviewer:** QA Agent (review statis; WORK_DEPTH standard). Tidak menjalankan next build/dev, E2E, maupun tes integrasi (butuh Postgres).
**Verifikasi yang dijalankan (di `codes/`):** `tsc --noEmit` lulus (0 galat; 4 galat `hooks.test.tsx` yang dilaporkan Backend sudah hilang); `eslint . --max-warnings=0` lulus; `vitest run` 30 berkas / 339 tes lulus.
**Status keseluruhan:** LULUS DENGAN CATATAN (0 CRITICAL, 0 HIGH, 2 MEDIUM, 6 LOW). Aman lanjut ke Tester; F-05-01 sebaiknya diperbaiki sebelum SPEC-016 memakai `learn-complete` sebagai pemicu poin.

## 1. Code Quality & Standards
- [x] Pass
- Semua `route.ts` baru dibungkus `withApi({auth:'user'})` (dijaga `tests/security/endpoint-guards.test.ts`). Param divalidasi `z.strictObject` (`player/schemas.ts:222-224`), body strict (`contracts/player.ts:97-100`). `withApi` kini boleh mengembalikan `Response` mentah dan tetap menambah `X-Request-Id` (`withApi.ts:212-239`).
- Nama, struktur, komentar Indonesia konsisten. Aturan murni dipisah (`player/rules.ts`) sehingga dapat diuji unit.

## 2. Security Assessment
- [ ] Pass dengan catatan (tidak ada secret hardcoded, tidak ada injeksi/XSS yang dapat dieksploitasi; 2 MEDIUM defense-in-depth/integritas)
- **Terverifikasi baik:**
  - XSS Markdown: `react-markdown` 10.1.0 tanpa `rehype-raw`, HTML mentah tidak dirender; `urlTransform` + komponen `a` menyaring skema (`markdown-article.tsx:110-120,166-179,203`), `javascript:`/`data:`/`vbscript:` (termasuk varian huruf besar dan sisipan tab) jatuh ke `undefined`; gambar Markdown dibuang (`:181`); tautan eksternal `noopener noreferrer`. Tidak ada `dangerouslySetInnerHTML`/`innerHTML`/`eval` di `src/` (grep bersih).
  - Embed YouTube: `video_id` divalidasi dua lapis, server (`material.ts:77`, `rules.ts:222`, korup = entri dibuang) dan klien (`video-card.tsx:41,54`); URL embed tidak dirakit dari string, hanya `new YT.Player(..., {videoId})` dengan `host=youtube-nocookie` dan `start/end` berupa angka.
  - `GET /assets/{id}/file` (`player/assets.ts`): `asset_id` Uuid, aset hanya dilayani bila dirujuk `slides_json`/`attachments_json` sub-modul+modul PUBLISHED dan minimal satu sub-modul perujuk tidak LOCKED bagi pengguna (`:163-189`); 304 baru dievaluasi SETELAH otorisasi (`:206`, tidak ada oracle); mime putih (webp/png/jpeg/pdf/docx, tanpa SVG) dan `nosniff`; dokumen `attachment` dengan nama berkas di-slug (`:209`, `rules.ts:277`); `storage_key` tidak pernah di DTO.
  - Path traversal: `storage_key` berasal dari DB, bukan input; `FsStorageDriver.resolve` memaksa regex `^[0-9a-f]{2}/[0-9a-f-]{36}\.[a-z0-9]{1,5}$` lalu `startsWith(root+sep)` (`storage/index.ts:16,22-26`). Galat berkas hilang dilog tanpa path (`assets.ts:195`).
  - DTO `GET /sub-modules/{code}` tanpa `storage_key`, `sha256`, `external_url`, `ai_rubric_criteria` (peta eksplisit di `material.ts:72-126`); akses lewat `assertSubModuleAccessible` (404 DRAFT/arsip, 403 LOCKED_CONTENT).
  - Kepemilikan bukti belajar: kunci baris `(user_id, sub_module_id)` dari sesi, bukan body; ping serentak diserialkan `FOR UPDATE` (`service.ts:161`); `learn-complete` dan `mini-task/complete` idempoten dan menghitung ulang syarat di server (`:182-217`); `mini-task` AI ditolak 409.
  - PlayerService penulis tunggal `learn_*`/`mini_task_completed_at`: grep seluruh `src/server` tidak menemukan penulis lain; update hanya menyentuh kolom tersebut + `updated_at` (`service.ts:166-169,200,215`). Status/skor tetap lewat `GatekeepingService`.
  - SQL: semua parameter lewat drizzle/`sql` tagged template (`assets.ts:164-168` memakai `${ref}::jsonb`); tidak ada `sql.raw`.
  - Tidak ada secret di kode; log tanpa PII.
- **Temuan:**

| ID | Sev | Lokasi | Ringkas |
|---|---|---|---|
| F-05-01 | MEDIUM | `src/server/player/rules.ts:228-233`; `service.ts:163`; `rate-limit.ts:16`; `learn-progress/route.ts:34` | Anti-farming bocor: `delta = min(klaim, 30, elapsed + 2)`. Slack `+2` berlaku per ping tanpa anggaran total. Batas 30 ping/mnt memungkinkan salvo 30 ping dalam ~1 detik (elapsed=0, tiap ping +2, ping pertama +5) = 63 detik "aktif" dari satu detik waktu nyata; ping tiap 2 detik = 2x kecepatan. Dengan `learn.min_active_seconds=60` syarat waktu terlewati dalam sekitar 1 detik oleh skrip (sub-tab dapat "dikunjungi" lewat ping bertanda `subtab`). Dampak: gerbang belajar dapat dilompati; bukan kebocoran lintas pengguna. |
| F-05-02 | MEDIUM | `next.config.ts:3-4` (belum berubah sejak F-04 TASK-001) | CSP belum ada, padahal pemutar memuat skrip pihak ketiga `https://www.youtube.com/iframe_api` (`youtube.ts:214,257-265`) dan membingkai `youtube-nocookie.com`. Tanpa CSP, satu celah XSS apa pun tidak tertahan, dan tidak ada daftar putih sumber. Wajib sebelum release (standar 8.2); lacak ke Hardening dengan nilai konkret: `script-src 'self' 'nonce-..' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube-nocookie.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. |
| F-05-03 | LOW | `src/components/player/markdown-article.tsx:113` | `safeHref` menganggap `url.startsWith('/') && !startsWith('//')` tautan internal. `/\evil.com` dan `/<TAB>/evil.com` lolos; peramban menormalkannya menjadi `//evil.com` (protokol-relatif) dan tautan dibuka di tab yang sama tanpa `noopener` (`:169`). Memerlukan penulis konten (admin) berniat jahat + klik pengguna. Perbaiki: tolak karakter `\` dan kontrol/spasi, atau `new URL(url, 'https://x.invalid')` lalu bandingkan `origin`. |
| F-05-04 | LOW | `src/server/player/assets.ts:172,193` | Setiap permintaan berkas menjalankan `recomputeStatuses` penuh (banyak query) dan memuat seluruh berkas ke memori (`Buffer`); tidak ada rate limit. Carousel dengan prefetch N slide = N recompute. DoS ringan oleh pengguna terautentikasi. Saran: cek akses cukup via sub-modul perujuk (`assertSubModuleAccessible` untuk id yang sudah diketahui), stream berkas, bucket rate limit, dan batas ukuran saat impor (periksa di TASK-004/018). |
| F-05-05 | LOW | `src/server/player/assets.ts:200-205` | Respons inline (gambar) tanpa `Content-Security-Policy: default-src 'none'; sandbox` dan `Cross-Origin-Resource-Policy: same-origin`. Mime dipercaya dari kolom DB (tidak ada sniff magic-byte saat disajikan). Defense-in-depth; validasi magic-byte ada di jalur impor (`assets-validate.test.ts`), pastikan juga di SPEC-018. |
| F-05-06 | LOW | `src/server/player/rules.ts:230` | Ping pertama dipotong ke 5 detik, sedangkan klien baru mengirim pada detik ke-15 (`use-active-learn-timer.ts:7,68`), sehingga 10 detik sah hilang sekali di awal. Fungsional, bukan keamanan; selaraskan (mis. ping pertama maks 15) bersama perbaikan F-05-01. |
| F-05-07 | LOW | `src/hooks/use-active-learn-timer.ts:44-47` | Kegagalan apa pun (termasuk 403/404/409/429 permanen) mengembalikan detik ke penampung dan dicoba lagi tiap 15 detik tanpa henti. Berhenti pada 4xx selain 429; hormati `Retry-After`. |
| F-05-08 | LOW | `src/server/player/material.ts:123`; spec 005 baris 78 | `success_criteria` = `ai_rubric_criteria`: rubrik penilaian AI terlihat oleh pelajar (sesuai spec/AC 005 baris 180, hanya nama kunci yang berbeda). Untuk Mini-Task AI (SPEC-012/013) pelajar dapat menyesuaikan jawaban dengan rubrik. Keputusan produk: pastikan disengaja; bila tidak, pisahkan field tampilan dari rubrik. |
| INFO | - | `eslint.config.*:52-68` | Aturan `no-restricted-imports` hanya mencocokkan path `@/db/schema` dan nama impor; impor relatif (`../../db/schema`) atau `import * as schema` melewatinya, dan seluruh `src/server/player/**` dikecualikan. Disiplin "penulis tunggal" kini tidak otomatis. Tambahkan tes statis yang memeriksa kolom pada `.set({...})` di `player/service.ts` dan melarang impor relatif ke schema di luar direktori izin. |
| INFO | - | `extractToc` (`markdown-article.tsx:99`) | Regex `^(#{1,3})\s+(.+?)\s*#*\s*$` per baris berpotensi backtracking polinomial pada baris sangat panjang bertanda `#`/spasi. Konten milik admin dan dibatasi ukuran; abaikan, atau batasi panjang baris. |

### Deviasi Backend: regex kode sub-modul (spec `[1-4]`, kode `\d`)
`player/schemas.ts:222` memakai `^\d\.\d{1,2}\.\d{1,2}$` agar AC "9.9.9 valid format, tidak ada -> 404" terpenuhi sementara non-kode (`abc`) -> 400. **Risiko: LOW (dapat diterima).** `\d` di JS hanya ASCII; tidak ada injeksi karena kode hanya dipakai sebagai parameter query. Efek samping: kode seperti `0.1.1`/`7.2.2` kini 404, bukan 400 (tidak membocorkan apa pun karena pengguna terotentikasi dan 404 seragam). Catatan konsistensi: klien (`query.ts:17`) dan `contracts/content.ts:24` masih `[1-4]`; spec 005 sendiri kontradiktif antara regex dan AC. Revision History spec 005 sudah dicatat; sebaiknya `_api-contract.md` baris 395 dan konstanta klien disamakan.

## 3. Architecture Alignment
- [x] Pass
- Struktur `src/server/player/*`, `src/app/api/v1/{sub-modules,assets}/*`, `src/contracts/player.ts`, `src/components/player/*`, `src/hooks/*` sesuai kontrak. Perubahan aditif terdokumentasi: `progress.min_active_seconds` (tercatat di spec 005 dan `_api-contract.md`), segmen dinamis `[sub_module]` (path publik tidak berubah). 5 endpoint 005 cocok dengan `_api-contract.md` baris 23-27 (status 200/304, kode galat 409 `LEARN_REQUIREMENTS_NOT_MET`, `NO_MINI_TASK`, `MINI_TASK_NOT_SELF_CHECK`, `LEARN_NOT_COMPLETED` ada di registri `errors.ts`).
- `activityHooks` dipanggil di dalam transaksi pemicu (kegagalan membatalkan), selaras bagian 7 kontrak.
- Saran proses: tambah tes snapshot kontrak terhadap `_api-contract.md` (dari F-15 TASK-001) karena `contracts/player.ts` dibuat oleh FE dan diperluas BE.

## 4. Recommendations
1. (MEDIUM) `rules.ts:228-233`: ganti slack per-ping dengan anggaran total, mis. simpan `learn_first_ping_at` atau pakai `learn_last_ping_at` dan batasi `delta <= elapsed` (toleransi maksimal 1-2 detik hanya sekali, bukan tiap ping) dan `active_total <= (now - first_ping_at) + 5`; abaikan klaim bila `elapsed < 1`. Tambah tes salvo 30 ping serentak => <= 5 detik.
2. (MEDIUM) Catat CSP nonce + daftar putih YouTube di backlog Hardening (F-05-02) dan uji pada pemutar nyata.
3. (LOW) F-05-03 perketat `safeHref`; F-05-04 rate limit + hindari `recomputeStatuses` per berkas; F-05-06/07 selaraskan timer.
4. (INFO) Tes statis penjaga penulis tunggal; samakan konstanta regex kode sub-modul lintas klien/kontrak.

**Keputusan:** Aman dilanjutkan ke Tester (E2E). Belum diverifikasi oleh QA: video YouTube nyata + CSP, tes integrasi (30 tes player), uji visual.
