# SPEC-001: Akun & Sesi (Daftar, Masuk, Keluar, Ganti Password, Profil Dasar)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-000
- **Prioritas:** P0
- **Cakupan:** Backend + Frontend (kedua sisi wajib selesai)

## User Story
Sebagai Learner (termasuk pemilik yang juga Admin), saya ingin mendaftar dengan email dan password, masuk, keluar, dan mengganti password saya, sehingga progres belajar saya tersimpan aman di akun saya dan tidak dapat diakses orang lain.

## Non-Goals / Out of Scope
- Tidak ada OAuth/SSO, login sosial, magic link, 2FA, atau "ingat saya" terpisah.
- Tidak ada reset password mandiri atau email apa pun (tanpa SMTP). Reset dilakukan Admin (SPEC-002).
- Tidak ada verifikasi email.
- Tidak ada pembuatan/pengelolaan undangan, daftar pengguna, ubah peran (SPEC-002). SPEC-001 hanya MEMAKAI kode undangan saat mendaftar.
- Tidak ada halaman dashboard isi (SPEC-007), peta belajar (SPEC-003), maupun pengaturan rekaman suara (SPEC-013). Halaman `/profil` hanya memuat: nama, target band, tema, ganti password, keluar.
- Tidak ada hapus akun oleh pengguna (dilakukan Admin, SPEC-002).
- Tidak ada pelacak/analitik pihak ketiga.

## Technical Flow
1. Pengguna membuka `/daftar`; browser memanggil `GET /api/v1/auth/signup-config` untuk mengetahui mode (`open` | `invite` | `closed`) dan menampilkan form sesuai mode (field kode undangan hanya pada `invite`; pesan "Pendaftaran ditutup" pada `closed`).
2. Pengguna mengirim form; browser memanggil `POST /api/v1/auth/register`.
3. Server memvalidasi body dengan `RegisterRequestSchema`, memeriksa rate limit bucket `register_ip`, lalu membaca `app_settings.signup.mode`.
4. Server (mode `invite`) menghitung SHA-256 dari kode undangan ternormalisasi, lalu menandai undangan terpakai dalam satu transaksi yang sama dengan pembuatan user.
5. Server menghitung hash `argon2id` dari password ternormalisasi NFKC, menyisipkan baris `users` (`role='learner'`), memanggil semua `userCreatedHooks`, menulis `audit_log` `AUTH_REGISTER`, lalu mengembalikan 201 tanpa membuat sesi.
6. Pengguna membuka `/masuk` dan mengirim email + password; browser memanggil `POST /api/v1/auth/login`.
7. Server memeriksa rate limit (`login_ip`, `login_email`), mencari user, memverifikasi password (hash dummy bila user tidak ada), memperbarui penghitung kegagalan/lockout, dan pada sukses membuat cookie sesi Auth.js (JWT).
8. Browser mengarahkan ke `next` (path relatif tervalidasi) atau `/`; bila `must_change_password=true`, browser mengarahkan ke `/ganti-password` dan semua endpoint lain menolak dengan `PASSWORD_CHANGE_REQUIRED`.
9. Pada setiap permintaan terproteksi, server menjalankan `requireUser()`: memverifikasi JWT, lalu memuat baris user dan menolak bila `status<>'ACTIVE'`, `deleted_at IS NOT NULL`, `token_version` JWT berbeda dari DB, atau `abs_exp` terlewati.
10. Pengguna menekan "Keluar"; browser memanggil `POST /api/v1/auth/logout`; server menghapus cookie sesi dan menulis `audit_log` `AUTH_LOGOUT`.
11. Pengguna mengganti password lewat `POST /api/v1/auth/change-password`; server memverifikasi password lama, menyimpan hash baru, menaikkan `token_version` 1, mengosongkan `must_change_password`, menerbitkan cookie baru untuk sesi saat ini (sesi lain menjadi tidak valid).
12. Pengguna menyunting nama atau target band lewat `PATCH /api/v1/me/profile`.

### Keputusan Teknis Tetap
| Topik | Nilai |
|---|---|
| Hash | `@node-rs/argon2` `Algorithm.Argon2id`, `memoryCost: 19456` (KiB), `timeCost: 2`, `parallelism: 1`, `outputLen: 32` |
| Normalisasi password | Unicode NFKC sebelum hash/verify; spasi di dalam dipertahankan; tidak di-trim |
| Daftar password umum | berkas `src/server/auth/common-passwords.txt` (10.000 entri teratas, huruf kecil, satu per baris); pembanding: NFKC + huruf kecil |
| Strategi sesi | Auth.js `session: { strategy: 'jwt', maxAge: 604800 (7 hari), updateAge: 3600 }`; klaim kustom `uid`, `role`, `tv` (token_version), `abs_exp` (epoch detik) |
| Batas absolut | `abs_exp = iat + 2592000` (30 hari) untuk `learner`; `abs_exp = iat + 43200` (12 jam) untuk `admin` |
| Cookie | nama default Auth.js (`authjs.session-token`, `__Secure-authjs.session-token` pada HTTPS); `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `secure` = true bila `AUTH_URL` berskema `https` |
| Lockout | gagal ke-5 dan seterusnya dalam jendela 15 menit: `locked_until = now + min(15 * 2^(failed_login_count - 5), 60) menit`; `failed_login_count` direset ke 0 saat login sukses, atau direset ke 1 bila kegagalan baru terjadi > 15 menit setelah `last_failed_login_at` |
| Respons gagal login | selalu `401 INVALID_CREDENTIALS` dengan pesan "Email atau password salah." (termasuk akun tidak ada, nonaktif, terkunci); waktu respons disamakan lewat hash dummy |
| Bentuk email | disimpan sesuai input setelah trim; unik lewat indeks `users_email_lower_uq` |
| Redirect `next` | hanya string yang diawali `/`, tidak diawali `//`, tanpa `\`, panjang <= 200 |
| Guard endpoint | Semua Route Handler dibungkus `withApi({ auth: 'public' | 'user' | 'admin', rateLimit?, body?, query? })` di `src/server/http/withApi.ts`; wrapper menerapkan Origin check, Content-Type check, Zod `.strict()`, `requireUser/requireAdmin`, `must_change_password` guard, dan format error `_api-contract.md` bagian 1 |

## API Contract
Konvensi umum (envelope `data`, error body, snake_case, ISO-8601, ID uuid) mengikuti `specifications/_api-contract.md` bagian 1. Kode error umum yang berlaku sesuai kolom Auth: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `PASSWORD_CHANGE_REQUIRED` (403), `CSRF_ORIGIN_MISMATCH` (403), `UNSUPPORTED_MEDIA_TYPE` (415), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500). Skema Zod berada di `src/contracts/auth.ts`.

### GET /api/v1/auth/signup-config
- **Auth:** public
- **Success status:** 200
- **Zod:** `SignupConfigResponseSchema`

**Request:** tanpa parameter.
**Response (Success):**
```json
{ "data": { "mode": "invite" } }
```
| Field | Tipe | Nullable | Constraint |
|---|---|---|---|
| `data.mode` | string enum | tidak | `open` \| `invite` \| `closed` |

**Response (Error):** hanya kode umum (`RATE_LIMITED` bucket `general_ip` 60/menit/IP, `INTERNAL_ERROR`).

### POST /api/v1/auth/register
- **Auth:** public
- **Success status:** 201
- **Zod:** `RegisterRequestSchema`, `RegisterResponseSchema`
- **Rate limit:** bucket `register_ip`

**Request**
| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `email` | string | ya | trim; 3-254 karakter; format email valid (`z.email()`) |
| `display_name` | string | ya | trim; 2-80 karakter; regex `^[^\p{Cc}]+$` (flag `u`) |
| `password` | string | ya | 10-128 karakter setelah NFKC; tidak boleh ada di daftar password umum; tidak boleh sama (tanpa membedakan huruf besar/kecil) dengan `email` |
| `invite_code` | string | tidak | regex tanpa membedakan huruf `^[0-9A-HJKMNP-TV-Z]{4}(-?[0-9A-HJKMNP-TV-Z]{4}){4}$`; wajib bila mode `invite`; diabaikan bila mode `open` |
```json
{ "email": "budi.santoso@example.test", "display_name": "Budi Santoso", "password": "kopi-tubruk-2026!", "invite_code": "K7QM-4XZP-9T2V-HD8W-RJ3N" }
```
**Response (Success) 201:**
```json
{ "data": { "user": { "id": "b8f2c1a4-5d3e-4a7b-9c21-0e6f7a8b9c10", "email": "budi.santoso@example.test", "display_name": "Budi Santoso", "role": "learner", "target_band": null, "must_change_password": false, "consent_recording_at": null, "keep_recordings": true, "placement_completed_at": null } } }
```
`user` memakai `UserDTO` (`_api-contract.md` bagian 4). Tidak ada Set-Cookie.

**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body gagal `RegisterRequestSchema`. `details[].code` salah satu: `invalid_email`, `display_name_invalid`, `password_too_short`, `password_too_long`, `password_too_common`, `password_same_as_email`, `invalid_invite_format`, `unrecognized_key` |
| 403 | SIGNUP_CLOSED | `signup.mode = 'closed'`. Pesan: "Pendaftaran sedang ditutup." |
| 403 | INVITE_INVALID | Mode `invite` dan kode tidak ada, kosong, kedaluwarsa, terpakai, atau dicabut. Pesan: "Kode undangan tidak valid atau sudah kedaluwarsa." |
| 409 | EMAIL_TAKEN | Email (tanpa membedakan huruf) sudah ada, HANYA dikembalikan setelah mode `open` atau kode undangan valid. Pesan: "Email sudah terdaftar." Undangan tidak terpakai (transaksi dibatalkan) |
| 429 | RATE_LIMITED | Bucket `register_ip` terlampaui (5/jam/IP) |

### POST /api/v1/auth/login
- **Auth:** public
- **Success status:** 200 (+ header `Set-Cookie` sesi)
- **Zod:** `LoginRequestSchema`, `LoginResponseSchema`
- **Rate limit:** `login_ip` (5/menit/IP), `login_email` (10/15 menit per email ternormalisasi huruf kecil)

**Request**
| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `email` | string | ya | trim; 3-254 karakter |
| `password` | string | ya | 1-128 karakter |
```json
{ "email": "budi.santoso@example.test", "password": "kopi-tubruk-2026!" }
```
**Response (Success) 200:**
```json
{ "data": { "user": { "id": "b8f2c1a4-5d3e-4a7b-9c21-0e6f7a8b9c10", "email": "budi.santoso@example.test", "display_name": "Budi Santoso", "role": "learner", "target_band": 6.0, "must_change_password": false, "consent_recording_at": null, "keep_recordings": true, "placement_completed_at": null } } }
```
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body tidak lolos skema |
| 401 | INVALID_CREDENTIALS | Email tidak ada, password salah, akun `DISABLED`/terhapus, atau sedang terkunci. Pesan: "Email atau password salah." |
| 429 | RATE_LIMITED | Bucket `login_ip` atau `login_email` terlampaui; header `Retry-After` detik |

### POST /api/v1/auth/logout
- **Auth:** user (sesi valid; boleh saat `must_change_password=true`)
- **Success status:** 204 (tanpa body; cookie dihapus)
- **Request:** tanpa body.
**Response (Error):** hanya kode umum (`UNAUTHENTICATED`, `CSRF_ORIGIN_MISMATCH`).

### GET /api/v1/auth/me
- **Auth:** user (boleh saat `must_change_password=true`)
- **Success status:** 200
- **Zod:** `MeResponseSchema`
**Response (Success):**
```json
{ "data": { "user": { "id": "b8f2c1a4-5d3e-4a7b-9c21-0e6f7a8b9c10", "email": "budi.santoso@example.test", "display_name": "Budi Santoso", "role": "learner", "target_band": 6.0, "must_change_password": false, "consent_recording_at": null, "keep_recordings": true, "placement_completed_at": null } } }
```
**Response (Error):** `UNAUTHENTICATED` (401).

### POST /api/v1/auth/change-password
- **Auth:** user (boleh saat `must_change_password=true`)
- **Success status:** 200 (+ `Set-Cookie` sesi baru)
- **Zod:** `ChangePasswordRequestSchema`
- **Rate limit:** `account_action` (5/jam/user)

**Request**
| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `current_password` | string | ya | 1-128 karakter |
| `new_password` | string | ya | aturan sama dengan `password` pada register; tidak boleh sama dengan `current_password`; tidak boleh sama dengan email akun |
```json
{ "current_password": "kopi-tubruk-2026!", "new_password": "teh-tarik-hangat-77" }
```
**Response (Success) 200:** `{ "data": { "user": <UserDTO dengan must_change_password=false> } }`

**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | `details[].code`: `password_too_short`, `password_too_long`, `password_too_common`, `password_same_as_email`, `password_unchanged` |
| 403 | CURRENT_PASSWORD_INCORRECT | `current_password` tidak cocok. Pesan: "Password saat ini salah." |
| 429 | RATE_LIMITED | Bucket `account_action` terlampaui |

### PATCH /api/v1/me/profile
- **Auth:** user
- **Success status:** 200
- **Zod:** `UpdateProfileRequestSchema`

**Request** (minimal satu field)
| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `display_name` | string | tidak | trim; 2-80; regex `^[^\p{Cc}]+$` (u) |
| `target_band` | number \| null | tidak | `null` atau salah satu dari `5.0, 5.5, 6.0, 6.5, 7.0` |
```json
{ "display_name": "Budi S.", "target_band": 6.5 }
```
**Response (Success) 200:** `{ "data": { "user": <UserDTO terbaru> } }`
**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 400 | VALIDATION_ERROR | Body kosong (`details[].code = empty_update`), nilai di luar constraint, atau field tak dikenal (`unrecognized_key`, termasuk `role`, `email`, `status`) |

## Database Changes
Migrasi Drizzle bertag `spec_001_auth_security`. Nama harus identik dengan `data-model.md`.

**Tabel `users` (tambah kolom):**
| Kolom | Tipe | Null | Default |
|---|---|---|---|
| `token_version` | integer | NOT NULL | `0` |
| `must_change_password` | boolean | NOT NULL | `false` |
| `last_failed_login_at` | timestamptz | NULL | tanpa default |
| `consent_recording_at` | timestamptz | NULL | tanpa default (dipakai SPEC-013) |
| `keep_recordings` | boolean | NOT NULL | `true` (dipakai SPEC-013) |

**Tabel baru `signup_invites`:**
```ts
export const signupInvites = pgTable('signup_invites', {
  id: id(),
  codeHash: varchar('code_hash', { length: 64 }).notNull().unique(), // sha256 hex dari kode ternormalisasi (huruf besar, tanpa '-')
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('signup_invites_expires_idx').on(t.expiresAt)]);
```
**Seed:** `app_settings` kunci `signup.mode` (nilai awal dari env `SIGNUP_MODE`, default `invite`).
**Hook:** `userCreatedHooks: Array<(tx, user) => Promise<void>>` di `src/server/auth/hooks.ts` (SPEC-003 dan SPEC-016 mendaftarkan callback).
**CLI:** `npm run admin:bootstrap` (`scripts/admin-bootstrap.ts`): bila sudah ada user `role='admin'` dan `deleted_at IS NULL`, cetak "Admin sudah ada, tidak ada perubahan." exit 0; bila tidak, buat admin dari `ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD` (>= 16 karakter, jika kurang exit 1 dengan "ADMIN_INITIAL_PASSWORD minimal 16 karakter"), `display_name='Admin'`, `must_change_password=true`, tulis `audit_log` `ADMIN_BOOTSTRAPPED`; password tidak dicetak ke log.

## UI/UX
Rujukan: `design-system.md` 5.1 Button, 5.2 Input/Form, 5.3 Card, 5.5 Navbar, 5.7 Toast/Badge. Semua teks lewat `src/i18n/id.ts`.

| Rute | Isi | State |
|---|---|---|
| `/masuk` | Card berisi Input email, Input password (toggle tampil/sembunyi), Button primary "Masuk", tautan "Daftar" | loading: Button loading "Memeriksa..."; error: ringkasan `role="alert"` "Email atau password salah." (tanpa membedakan penyebab); 429: "Terlalu banyak percobaan. Coba lagi dalam {n} menit." |
| `/daftar` | Input email, nama tampilan, password (dengan penunjuk panjang 10+), kode undangan (hanya mode `invite`), Button "Daftar" | mode `closed`: Card informasi "Pendaftaran sedang ditutup. Hubungi pemilik." tanpa form; sukses: Toast "Akun dibuat. Silakan masuk." lalu redirect `/masuk`; error per field di bawah Input |
| `/ganti-password` | Input password saat ini, password baru, Button "Simpan" | dipaksa tampil bila `must_change_password=true`, dengan teks "Anda harus mengganti password sementara."; sukses: Toast + redirect `/` |
| `/profil` | Card profil: Input nama, Select target band (kosong, 5.0 s.d. 7.0), pilihan tema (Terang/Gelap/Ikuti sistem; disimpan di `localStorage` kunci `theme`, bukan di DB), tautan ke `/ganti-password`, Button destructive "Keluar" dengan Dialog konfirmasi | loading: Skeleton; sukses simpan: Toast "Profil disimpan." |

- **Kerangka aplikasi terautentikasi** (komponen `AppShell`): bottom nav mobile 4 item (Beranda `/`, Peta `/peta`, Riwayat `/riwayat`, Profil `/profil`), sidebar desktop >= lg dengan item yang sama. Item yang rutenya belum dibangun spec lain ditampilkan `disabled` dengan Tooltip "Segera hadir" sampai spec terkait selesai (daftar rute aktif dibaca dari `src/app/nav.config.ts`). Mode Ujian menyembunyikan navigasi (SPEC-006).
- Pengguna belum masuk yang membuka rute terproteksi dialihkan ke `/masuk?next=<path>`.
- Admin melihat item tambahan "Admin" ke `/admin` (SPEC-002).
- Aksesibilitas: label terlihat, `aria-invalid`, fokus pindah ke field salah pertama setelah submit gagal, target sentuh 44px.

## Acceptance Criteria
- [ ] **Given** mode `open` **When** `POST /api/v1/auth/register` dengan body valid **Then** status 201, `data.user.role = "learner"`, baris `users` ada dengan `password_hash` berawalan `$argon2id$`, dan respons TIDAK memuat `password_hash` maupun Set-Cookie.
- [ ] **Given** mode `invite` dan undangan aktif **When** register dengan `invite_code` valid **Then** 201, dan `signup_invites.used_by` = id user baru, `used_at` terisi.
- [ ] **Given** undangan yang sudah terpakai **When** register dengan kode itu **Then** 403 `INVITE_INVALID`, tidak ada baris `users` baru.
- [ ] **Given** mode `invite` **When** register tanpa `invite_code` **Then** 403 `INVITE_INVALID` (bukan 400).
- [ ] **Given** mode `closed` **When** register **Then** 403 `SIGNUP_CLOSED`.
- [ ] **Given** email `Budi@Example.test` terdaftar **When** register dengan `budi@example.test` dan kode valid **Then** 409 `EMAIL_TAKEN` dan undangan tetap `used_at IS NULL`.
- [ ] **Given** password `abc123` **When** register **Then** 400 `VALIDATION_ERROR` dengan `details[].code = "password_too_short"`; password `passwordpassword` (ada di daftar umum) menghasilkan `password_too_common`.
- [ ] **Given** register dengan body berisi `"role":"admin"` **When** dikirim **Then** 400 `unrecognized_key` dan tidak ada user dibuat.
- [ ] **Given** kredensial benar **When** `POST /api/v1/auth/login` **Then** 200, cookie sesi `httpOnly` + `SameSite=Lax`, `users.last_login_at` terisi, `audit_log` `AUTH_LOGIN_SUCCESS` tercatat.
- [ ] **Given** password salah **When** login 4 kali berturut-turut **Then** keempatnya 401 `INVALID_CREDENTIALS` dengan pesan identik, dan percobaan ke-5 mengunci akun 15 menit (`locked_until` ~ now+15 menit); login dengan password BENAR saat terkunci tetap 401 `INVALID_CREDENTIALS`.
- [ ] **Given** email yang tidak terdaftar **When** login **Then** 401 dengan pesan dan bentuk body identik dengan kasus password salah, dan selisih waktu respons median keduanya < 100 ms pada 20 percobaan uji.
- [ ] **Given** lebih dari 5 permintaan login per menit dari satu IP **When** permintaan ke-6 **Then** 429 `RATE_LIMITED` dengan header `Retry-After` >= 1.
- [ ] **Given** sesi aktif **When** `POST /api/v1/auth/logout` **Then** 204, cookie dihapus, dan `GET /api/v1/auth/me` berikutnya 401 `UNAUTHENTICATED`.
- [ ] **Given** sesi aktif **When** Admin menonaktifkan akun (`status='DISABLED'`) **Then** permintaan terproteksi berikutnya (<= 1 detik) mengembalikan 401 `UNAUTHENTICATED`.
- [ ] **Given** dua sesi A dan B milik user yang sama **When** A memanggil `change-password` dengan data valid **Then** 200 dan cookie baru untuk A; permintaan B berikutnya 401; `users.token_version` naik tepat 1.
- [ ] **Given** `change-password` dengan `current_password` salah **When** dikirim **Then** 403 `CURRENT_PASSWORD_INCORRECT` dan hash tidak berubah.
- [ ] **Given** user dengan `must_change_password=true` **When** memanggil `GET /api/v1/curriculum/tree` (atau endpoint non-akun apa pun) **Then** 403 `PASSWORD_CHANGE_REQUIRED`; `GET /api/v1/auth/me`, `POST /auth/logout`, dan `POST /auth/change-password` tetap berfungsi.
- [ ] **Given** user `admin` yang masuk **When** 12 jam 1 menit berlalu sejak login **Then** permintaan terproteksi 401 `UNAUTHENTICATED` (batas absolut); untuk `learner` batas 30 hari.
- [ ] **Given** permintaan `POST` dengan header `Origin: https://evil.example` **When** ke endpoint mutasi apa pun **Then** 403 `CSRF_ORIGIN_MISMATCH`.
- [ ] **Given** `PATCH /api/v1/me/profile` dengan `{"target_band": 8.0}` **When** dikirim **Then** 400 `VALIDATION_ERROR`; dengan `{"target_band": 6.5}` 200 dan nilai tersimpan.
- [ ] **Given** `npm run admin:bootstrap` dijalankan dua kali dengan env valid **When** selesai **Then** tepat 1 admin dengan `must_change_password=true`, eksekusi kedua mencetak "Admin sudah ada, tidak ada perubahan." exit 0, dan log tidak memuat password.
- [ ] **Given** tes `tests/security/endpoint-guards.test.ts` **When** dijalankan **Then** setiap berkas `src/app/api/**/route.ts` mengekspor handler yang dibungkus `withApi` dengan opsi `auth` eksplisit, dan tes gagal bila ada yang tidak.
- [ ] **Given** akses ke `/profil` tanpa sesi **When** dibuka di browser **Then** dialihkan ke `/masuk?next=%2Fprofil`; `next=//evil.test` diabaikan dan pengguna dialihkan ke `/`.
- [ ] **Given** E2E Playwright **When** pengguna daftar (mode `open`), masuk, mengganti target band, keluar **Then** seluruh alur lulus pada viewport 1280x800 dan 375x812.

## Edge Cases & Validation
- [ ] `email` berisi spasi di awal/akhir: di-trim sebelum validasi. Berisi karakter non-ASCII pada bagian lokal: ditolak bila `z.email()` menolak (`invalid_email`).
- [ ] `display_name` berisi hanya spasi atau karakter kontrol: `display_name_invalid`.
- [ ] `password` tepat 10 karakter: diterima; 129 karakter: `password_too_long`; password berisi emoji: diterima (panjang dihitung dalam code point setelah NFKC).
- [ ] `invite_code` huruf kecil atau tanpa tanda hubung: dinormalisasi (huruf besar, hapus `-`) sebelum hash.
- [ ] Dua register serentak dengan email sama: satu 201, lainnya 409 `EMAIL_TAKEN` (dijamin indeks unik; tidak ada 500).
- [ ] Dua register serentak memakai satu undangan: tepat satu sukses, yang lain 403 `INVITE_INVALID`.
- [ ] `Content-Type` bukan `application/json` pada endpoint ber-body: 415 `UNSUPPORTED_MEDIA_TYPE`. Body > 1 MB: 413 `PAYLOAD_TOO_LARGE`.
- [ ] Cookie sesi rusak/kedaluwarsa: 401 `UNAUTHENTICATED` (bukan 500), cookie dihapus.
- [ ] Log aplikasi dan `audit_log.metadata` TIDAK memuat password, hash, atau email penuh (email dimasking `b***@example.test`).

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; delta skema security: `users.token_version`, `must_change_password`, `last_failed_login_at`, `consent_recording_at`, `keep_recordings`, tabel `signup_invites` |
