# Dev Log TASK-001: Akun dan Sesi (Auth)

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W1)

Spec: `specifications/001_spec_auth_session.md` (bagian UI/UX + API Contract). Backend bekerja paralel di `src/server/**`, `src/app/api/**`.

### Yang dibangun
- **Rute** (`codes/src/app/`): `(public)/masuk`, `(public)/daftar`, `(app)/ganti-password`, `(app)/profil`, `(app)/page.tsx` (beranda placeholder sampai SPEC-007; `src/app/page.tsx` lama dipindahkan ke sini), `nav.config.ts`.
- **Komponen**: `components/auth/{login-form,register-form,change-password-form,profile-card,logout-button}.tsx`, `components/shell/{app-shell,auth-gate,authenticated-layout}.tsx`, `components/form/{password-input,form-error-summary}.tsx`, `components/common/state-views.tsx`, `components/providers.tsx` (next-themes kunci `theme`, TanStack Query, Tooltip, Toast).
- **Klien API** (`src/lib/api/`): `client.ts` (`apiFetch`: envelope `data`/`error`, `ApiError` dengan `code`/`details`/`requestId`/`Retry-After`, parse respons dengan Zod; respons yang menyimpang dari kontrak menjadi `RESPONSE_INVALID`, tidak ditambal), `auth.ts`, `errors.ts` (pemetaan kode ke pesan Indonesia, `details[]` ke field RHF). Dapat ditiru lewat `fetch` global (`components/test-utils.tsx`), tanpa MSW dan tanpa mengubah kontrak.
- **Form** (RHF + Zod, `src/lib/forms.ts`): validasi sama dengan spec (NFKC, 10-128, nama 2-80 tanpa karakter kontrol, kode undangan). Daftar password umum tetap hanya di server (`password_too_common` datang dari `details[]`).
- **Perilaku**: pesan login tunggal "Email atau password salah."; 429 memakai `Retry-After` ("Coba lagi dalam {n} menit."); `next` divalidasi `safeNext` (path internal, bukan `//`, tanpa `\`, <= 200); `must_change_password` memaksa `/ganti-password` dan menyembunyikan navigasi; tanpa sesi dialihkan ke `/masuk?next=<path>`; tombol Keluar dengan Dialog konfirmasi dan `queryClient.clear()`; tema Terang/Gelap/Ikuti sistem (localStorage `theme`); PATCH profil hanya mengirim field yang berubah; target band null lewat sentinel `none`.
- **AppShell**: bottom nav (mobile) + sidebar (>= lg), `aria-current`, item `disabled` + Tooltip "Segera hadir" untuk rute belum ada (`/riwayat`), item Admin hanya untuk admin, skip link, fokus pindah ke `<main>` saat pindah rute.
- **Primitif UI** disesuaikan design-system: Button default 44px + prop `loading` (spinner, disabled, `aria-busy`), Input/Select 44px, FormMessage berikon, `Progress` kini meneruskan `value` ke Radix (sebelumnya `aria-valuenow` tidak terisi).
- **Token**: ditambah `--color-crown-*` dan `--color-streak` (design-system 2.3) di `globals.css`.

### Keputusan dan temuan
1. **Bug W0 diperbaiki**: `.gitignore` akar repo berisi `codes/*`; deteksi sumber otomatis Tailwind 4 mengikuti `.gitignore`, sehingga seluruh utilitas (termasuk halaman placeholder lama) tidak dibuat. Ditambah `@source '../';` di `src/app/globals.css`. Terverifikasi di browser (halaman `/masuk` mobile 375px, tanpa overflow horizontal, tema gelap mengikuti OS).
2. Otorisasi hanya UX di klien (`AuthGate`); server tetap otoritatif. Tidak ada `middleware.ts` yang ditulis frontend; pengalihan tanpa sesi terjadi di klien setelah `GET /auth/me` 401 (ada kilasan skeleton). Bila Backend menambah middleware cookie-check, `next` yang sama dapat dipakai.
3. Tautan di dark mode memakai `--color-primary` (#6366F1 pada dark) bukan `--primary` shadcn (#4F46E5, khusus latar tombol) agar kontras memenuhi desain.
4. Tipe klien diturunkan dengan `z.infer` di `src/lib/api/types.ts` (bukan dari nama tipe ekspor backend) untuk mengurangi kopling dengan berkas `src/contracts/*` yang juga disunting Backend.

### Drift/catatan untuk Backend (lihat `state/agent_handoff.json`)
- `src/contracts/auth.ts`: `INVITE_CODE_RE` memicu `security/detect-unsafe-regex` sehingga `npm run lint` (max-warnings=0) gagal.
- `src/server/auth/password.ts:6`: `Algorithm.Argon2id` (const enum ambient) gagal di `tsc`/`next build` karena `isolatedModules` (TS2748). Memblokir `npm run typecheck` dan `npm run build` secara keseluruhan.

### Verifikasi (dijalankan di `codes/`)
- Lihat bagian ringkasan di akhir `TASK-003/dev_log.md` (satu kali jalan untuk seluruh W1 frontend).
- Test terkait: `src/components/auth/*.test.tsx`, `src/components/shell/shell.test.tsx`, `src/lib/*.test.ts`, `src/lib/api/client.test.ts`.
- Belum dilakukan: E2E Playwright (butuh server + DB), integrasi nyata dengan endpoint Backend, uji screen reader, audit kontras otomatis.


---

## [BACKEND] 2026-11-03 07:55 (Backend Engineer, wave W1)

**Target Spec:** `specifications/001_spec_auth_session.md` | **Status:** Completed (sisi server)

### 1. Implementation Summary
- **Pembungkus endpoint** `withApi({ auth, body, query, params, rateLimit, allowPasswordChangeRequired })` (`src/server/http/withApi.ts`). Urutan: cek CSRF (mutasi) -> bucket `general_ip` (public) -> `requireUser`/`requireAdmin` (muat user dari DB di SETIAP permintaan: `ACTIVE`, `deleted_at IS NULL`, `token_version`, `abs_exp`) -> guard `must_change_password` -> bucket `general_user` -> bucket statis (`login_ip`, `register_ip`, `account_action`) -> params/query/body (Zod `strictObject`, `Content-Type` JSON, maks 1 MB) -> bucket dinamis (`login_email`) -> handler. Semua respons `Cache-Control: private, no-store` + `X-Request-Id`; galat tak terduga menjadi `500 INTERNAL_ERROR` generik (stack hanya di log pino yang meredaksi `password/token/cookie/email`).
- **Sesi**: JWT Auth.js (JWE) lewat `next-auth/jwt` `encode/decode` dengan `salt` = nama cookie (`authjs.session-token`, `__Secure-` bila `AUTH_URL` https). Klaim `uid, role, tv, abs_exp`; `maxAge` 7 hari, cookie diperbarui bila token > 1 jam (`updateAge`) tanpa melewati `abs_exp` (learner 30 hari, admin 12 jam). Peran diambil dari DB, bukan dari klaim.
- **Auth**: register (mode dibaca dari `app_settings.signup.mode`; klaim undangan atomik `UPDATE ... WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`; `EMAIL_TAKEN` hanya setelah undangan valid dan transaksi dibatalkan sehingga undangan tidak terpakai), login (hash dummy untuk waktu seragam, lockout `min(15*2^(n-5),60)` menit, jendela 15 menit, audit `AUTH_LOGIN_SUCCESS/FAILED`, `AUTH_LOCKOUT`), logout, me, change-password (naik `token_version`, cookie baru), PATCH profil. Hash `@node-rs/argon2` argon2id m=19456,t=2,p=1.
- **Hook** `userCreatedHooks` (`src/server/auth/hooks.ts`); `src/server/hooks-register.ts` mendaftarkan `GatekeepingService.initializeProgress` (SPEC-003). Hook berjalan di transaksi register/admin-create.
- **CLI** `npm run admin:bootstrap` (idempoten, advisory lock, password tidak dicetak) dan `npm run user:reset-password -- <email>`.

### 2. Files Created/Modified
`src/server/http/{withApi,errors,rate-limit,zod-errors}.ts`, `src/server/auth/{session,guards,service,password,invite-code,common-passwords(.ts/.txt),hooks,bootstrap}.ts`, `src/server/{audit,config,logger,db,hooks-register}.ts`, `src/contracts/{common,auth}.ts`, `src/app/api/v1/auth/{signup-config,register,login,logout,me,change-password}/route.ts`, `src/app/api/v1/me/profile/route.ts`, `scripts/{admin-bootstrap,reset-password,gen-common-passwords,_env}.ts|mjs`, migrasi `drizzle/0003_spec_001_auth_security.sql`, `src/db/schema.ts` (kolom `users` + `signup_invites`), `next.config.ts` (`outputFileTracingIncludes` untuk daftar password).
Tes: `tests/integration/auth.itest.ts` (36 tes), `tests/unit/{auth-units (11),with-api (7)}.test.ts`, `tests/security/endpoint-guards.test.ts` (22).

### 3. Technical Notes / keputusan konservatif untuk spec yang ambigu
1. **Auth.js**: rute `/api/auth/*` bawaan Auth.js TIDAK dipasang; cookie dibuat/dibaca dengan primitif JWT Auth.js agar bentuk respons mengikuti `_api-contract.md`. Frontend cukup memakai `/api/v1/auth/*`. Untuk Server Component tersedia `getUserFromCookieHeader(cookieHeader)` di `src/server/auth/guards.ts`.
2. **CSRF**: `Origin` harus ada dalam `ALLOWED_HOSTS` + host `AUTH_URL`; tanpa `Origin` hanya lolos bila `Sec-Fetch-Site: same-origin`. Klien non-browser (curl) wajib mengirim `Origin`.
3. **IP**: `X-Forwarded-For` hanya dipercaya bila `AUTH_TRUST_HOST=true`; selain itu semua klien berbagi kunci `direct` (konservatif: bucket `login_ip` 5/menit berlaku bersama pada akses langsung tanpa proxy). Rate limit in-memory per proses (sesuai kontrak).
4. **Logout stateless**: cookie dihapus di klien, token tidak dicabut di server (desain JWT spec; `token_version` hanya naik pada ganti/reset password, ubah peran/status, hapus). Cookie yang sudah dicuri tetap valid sampai kedaluwarsa atau `token_version` berubah (risiko diterima spec).
5. **Daftar password umum**: `common-passwords.txt` (10.000 entri) DIBANGKITKAN oleh `scripts/gen-common-passwords.mjs` dari kata dasar x sufiks (bukan salinan SecLists/HIBP, tidak ada unduhan). Cakupan lebih lemah dari daftar 10k nyata; ganti berkas dengan SecLists top-10k (pemilik) bila ingin cakupan penuh.
6. Kebijakan password dicek di service (bukan di Zod) agar `password_too_common`/`password_same_as_email` tidak membocorkan daftar ke bundel klien; `RegisterRequestSchema` di `src/contracts/auth.ts` hanya memuat aturan panjang.
7. Lockout: kegagalan ke-5 menyetel `locked_until` (+15 mnt) dan respons tetap 401; kegagalan baru > 15 menit setelah `last_failed_login_at` mereset hitungan ke 1; permintaan saat terkunci tidak menaikkan hitungan.
8. **Tabrakan berkas bersama** (lihat juga TASK-002): `src/contracts/*` dan `tests/setup.ts` disunting oleh Backend dan Frontend bersamaan. `tests/setup.ts` tertimpa sebentar (hilang `afterEach(cleanup)` milik FE yang kemudian saya pulihkan); `src/contracts/admin.ts` ditimpa Backend lalu dilengkapi alias yang dipakai FE (`ResetPasswordResponseSchema`, `SettingListResponseSchema`, `AuditLogListResponseSchema`, tipe `AdminUser/Setting/Invite/AuditLogEntry/UnlockLevel`). Isi asli admin.ts versi FE tidak dapat dipulihkan; semua test FE (86) lulus terhadap versi sekarang.
9. Drift FE yang dilaporkan di `agent_handoff.json` sudah diselesaikan: `INVITE_CODE_RE` (lint), `Algorithm.Argon2id` const enum (TS2748), TS2559 di bootstrap, peringatan `fs`, `seed.test.ts`.

### 4. Verifikasi (dijalankan di `codes/`, Node v24.21.0, Postgres 16.15 lokal)
Lihat ringkasan menyeluruh di `TASK-003/dev_log.md`. AC yang tercakup uji otomatis: register open/invite/closed, undangan terpakai/tanpa kode/kedaluwarsa/dicabut, `EMAIL_TAKEN` (undangan tak terpakai), kode validasi password, `unrecognized_key`, cookie httpOnly+Lax, lockout 5x, waktu respons email-tak-ada vs salah (median < 100 ms, 20 percobaan), rate limit 429+`Retry-After`, logout, nonaktif, ganti password dua sesi (`token_version` +1), `must_change_password`, batas absolut 12 jam/30 hari, CSRF, profil, bootstrap dua kali, endpoint-guards.
Belum: E2E Playwright (butuh browser + server), uji redirect `/profil` -> `/masuk?next=` di browser (milik FE).

### 5. Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 07:55 | Backend W1: sesi/auth, withApi, rate limit, bootstrap |

---

## [BACKEND] 2026-11-03 11:58 - Perbaikan temuan QA W1 (F-01, F-02, F-03)

- F-01: src/server/safe-error.ts (safeErr: name + code SQLSTATE + frame stack tanpa baris pesan; err.message tidak pernah dicatat). Dipakai di withApi.ts, admin/health.ts, worker/index.ts (pg-boss error, heartbeat, shutdown, main), content/import-service.ts (pesan CLI hanya name/code). Tes: tests/unit/qa-w1-fixes.test.ts.
- F-02: src/instrumentation.ts memanggil getEnv() saat start proses web Node (dilewati pada fase build). Belum diverifikasi dengan next start nyata.
- F-03: withApi membaca body lewat stream berhitung byte dan membatalkan di 1 MB (413), tanpa req.text(). Tes chunked tanpa Content-Length lulus.
- Lain (catatan Frontend): testTimeout vitest.config.ts dinaikkan ke 30 dtk (tes endpoint-guards timeout saat paralel). CSP untuk youtube-nocookie.com (frame-src) dan script-src IFrame API dicatat untuk Hardening (F-04).
