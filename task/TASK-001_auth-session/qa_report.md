# QA & Security Report: TASK-001 Akun dan Sesi (Auth)
**Date:** 2026-11-03
**Target Branch:** claude/ielts-learning-platform-a3ccc4 (working tree, belum di-commit)
**Reviewer:** QA Agent (review statis; WORK_DEPTH standard). Tidak menjalankan next build/dev, E2E, maupun tes integrasi.
**Verifikasi yang dijalankan:** `tsc --noEmit` lulus; `eslint . --max-warnings=0` lulus; `vitest run` 18 berkas / 199 tes lulus.
**Status keseluruhan:** LULUS DENGAN CATATAN (0 CRITICAL, 1 HIGH, 4 MEDIUM). Aman lanjut ke Tester; F-01 sebaiknya diperbaiki sebelum Hardening.

## 1. Code Quality & Standards
- [x] Pass
- Lint/typecheck bersih. `withApi` konsisten: semua `route.ts` di `src/app/api/` (kecuali `/api/health`) dibungkus `withApi({auth})` dan dijaga `tests/security/endpoint-guards.test.ts`.
- Catatan: F-08 (urutan validasi register), F-15 (berkas bersama tertimpa lintas agen).

## 2. Security Assessment
- [ ] Pass dengan catatan (tidak ada secret hardcoded; ada 1 HIGH kebocoran log)
- Terverifikasi baik: authz di tiap handler (`requireUser` memuat user dari DB tiap permintaan: ACTIVE, deleted_at, token_version, abs_exp; `guards.ts:62-88`); CSRF Origin/Sec-Fetch-Site pada semua mutasi (`withApi.ts:71-83,137`); Zod `strictObject` (mass assignment `role` ditolak); argon2id m=19456,t=2,p=1 + NFKC (`password.ts:6-20`); hash dummy untuk waktu seragam (`service.ts:131-139`); lockout eksponensial dengan SELECT FOR UPDATE (`service.ts:143-170`); pesan login generik; cookie httpOnly + SameSite=Lax + Secure bila https (`session.ts:42-52`); `Cache-Control: private, no-store` pada semua respons; kode undangan disimpan SHA-256, klaim atomik, tidak terpakai bila EMAIL_TAKEN (`service.ts:72-96`); DTO user tanpa password_hash (`guards.ts:39-51`); `safeNext` aman; tidak ada `dangerouslySetInnerHTML`, `sql.raw`, `eval`; tidak ada secret nyata di kode (hanya nilai tes di `tests/setup.ts`); `.env` di-ignore, `.env.example` tanpa nilai nyata.
- Temuan:

| ID | Sev | Lokasi | Ringkas |
|---|---|---|---|
| F-01 | HIGH | `src/server/http/withApi.ts:219,242-245`; `src/server/admin/health.ts:81` | Galat tak terduga dicatat dengan `err.message` + `stack`. Drizzle 0.45 `DrizzleQueryError.message` = `Failed query: <SQL>\nparams: <nilai>` (`node_modules/drizzle-orm/errors.js:11-13`). Kegagalan DB sementara pada INSERT users / SELECT login menulis email mentah, `password_hash` argon2, display_name ke log. Pino `redact` hanya berdasar nama key, tidak menyentuh string pesan. Melanggar security-standards bagian 2 (Log) dan 13.2. |
| F-02 | MEDIUM | `src/server/config.ts:9-11`; `src/worker/index.ts:29` | `parseEnv`/`getEnv` hanya dipanggil worker. Proses web tidak pernah memvalidasi env (tidak ada `instrumentation.ts`): `AUTH_SECRET`/`IP_HMAC_SECRET` pendek (<32 byte) dan DATABASE_URL berpassword `postgres` diterima. Standar 1.1 mewajibkan >=32 byte. Efek lain: kegagalan `hashIp` ditelan diam-diam (`withApi.ts:141-146`) sehingga `ip_hash` audit kosong. |
| F-03 | MEDIUM | `src/server/http/withApi.ts:92-106` | `req.text()` membaca seluruh body sebelum batas 1 MB diperiksa; cek `Content-Length` (baris 96) tidak berlaku untuk chunked. Endpoint publik (login/register) menerima body tak terbatas (DoS memori). Standar 3.1/4.1.3 meminta batas ditegakkan saat streaming. |
| F-04 | MEDIUM | `next.config.ts:3-4` | CSP (nonce) belum ada; hanya header dasar. Standar 8.2 WAJIB enforce sebelum release. Dapat ditunda ke Hardening tetapi harus dilacak. |
| F-05 | MEDIUM | `src/server/http/withApi.ts:60-70` | `AUTH_TRUST_HOST=false` (default): semua klien berbagi kunci `direct`, sehingga satu penyerang menghabiskan `login_ip` 5/mnt dan memblokir login semua orang (DoS). `=true`: memakai elemen KIRI `X-Forwarded-For`, aman hanya bila Caddy menimpa header; harus didokumentasikan/diuji pada profil proxy. |
| F-06 | LOW | `src/server/http/rate-limit.ts:57` | Bila `store` penuh (50k kunci) dan prune tidak cukup, `store.clear()` mereset semua limiter. Kunci `login_email` berasal dari input bebas. |
| F-08 | LOW | `src/server/auth/service.ts:62-69` | Kebijakan password dicek sebelum mode pendaftaran: mode `closed` + password lemah menghasilkan 400, bukan 403 SIGNUP_CLOSED. Argon2 dihitung sebelum undangan divalidasi (CPU tak terautentikasi; dibatasi 5/jam/IP). Cek mode dan keberadaan undangan (tanpa klaim) sebelum hash. |
| F-09 | LOW | `src/server/auth/service.ts:51` | Mode `open` membocorkan keberadaan email lewat EMAIL_TAKEN. Sesuai spec/AC; pastikan `open` hanya untuk localhost (standar 1.3). |
| F-19 | LOW | `src/server/auth/common-passwords.txt` | 10.000 entri dibangkitkan kombinatorial, bukan top-10k nyata (diakui dev_log #5). Cakupan lebih lemah dari spec; ganti dengan SecLists. |
| INFO | - | dev_log TASK-001 butir 4 | Logout stateless; cookie curian valid sampai kedaluwarsa/token_version berubah. Risiko diterima spec; admin dibatasi 12 jam. |

## 3. Architecture Alignment
- [x] Pass
- Struktur `src/server/*`, `src/app/api/v1/*`, `src/contracts/*` sesuai `_api-contract.md`. Kontrak auth (7 endpoint) cocok dengan spec 001: status/kode galat/regex undangan/Retry-After. Deviasi sadar dan terdokumentasi: rute `/api/auth/*` Auth.js tidak dipasang (JWT dibuat lewat `next-auth/jwt`); dapat diterima.
- F-15 (LOW, proses): `src/contracts/admin.ts` dan `tests/setup.ts` pernah tertimpa antar agen; isi asli FE tidak terpulihkan. Tambahkan tes snapshot kontrak terhadap `_api-contract.md`.

## 4. Recommendations
1. (HIGH) `withApi.ts:242-245`: log hanya `{name, code: err.cause?.code ?? err.code}` + stack terpangkas; jangan sertakan `message` untuk `DrizzleQueryError`. Terapkan pula di `health.ts:81`, `src/worker/index.ts:93`, dan output galat teknis `scripts/content-import.ts`.
2. (MEDIUM) Tambah `src/instrumentation.ts` yang memanggil `getEnv()` saat start web; tes unit bahwa `AUTH_SECRET` <32 byte ditolak.
3. (MEDIUM) `readJsonBody`: baca `req.body` sebagai stream dengan penghitung byte dan hentikan di 1 MB (413).
4. (MEDIUM) Catat keputusan CSP nonce (middleware) di backlog Hardening; dokumentasikan konfigurasi Caddy yang menimpa XFF, dan uji `AUTH_TRUST_HOST=true`.
5. (LOW) F-06, F-08, F-19 sesuai tabel.

**Keputusan:** Aman dilanjutkan ke Tester (E2E). Minta Backend/Fixer memperbaiki F-01..F-03 sebelum Hardening.
