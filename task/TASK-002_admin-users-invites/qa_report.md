# QA & Security Report: TASK-002 Admin: Pengguna, Undangan, Pengaturan
**Date:** 2026-11-03
**Target Branch:** claude/ielts-learning-platform-a3ccc4 (working tree, belum di-commit)
**Verifikasi:** `tsc` lulus, `eslint --max-warnings=0` lulus, `vitest run` 199 tes lulus. Temuan bersama (F-01..F-06) ada di `task/TASK-001_auth-session/qa_report.md`.
**Status:** LULUS DENGAN CATATAN (0 CRITICAL; tidak ada HIGH khusus task ini, mewarisi F-01 HIGH).

## 1. Code Quality & Standards
- [x] Pass. Service terpisah rapi (`src/server/admin/{users,invites,settings,audit,health}.ts`), transaksi + `FOR UPDATE`, escape LIKE (`users.ts:37`), registri setting bertipe (`settings/registry.ts`).

## 2. Security Assessment
- [x] Pass dengan catatan
- Authz: 12 route `/api/v1/admin/**` semuanya `withApi({auth:'admin'})` -> `requireUser({requireAdmin:true})` yang memuat role dari DB (bukan klaim JWT); mutasi diproteksi CSRF Origin. Mass assignment ditolak oleh `strictObject` (AdminUpdateUserRequestSchema hanya role/status).
- Self-protection: CANNOT_MODIFY_SELF di update/reset/delete (`users.ts:112,154,176`); LAST_ADMIN dengan kunci baris admin (`users.ts:90-98,121,179`); `token_version` naik pada perubahan role/status/reset/hapus (`users.ts:126,164,184`) sehingga sesi lama mati. Temporary password 16 karakter CSPRNG `randomInt` (`password.ts:46-52`), `must_change_password=true`, tidak masuk log/audit; respons `no-store`.
- Undangan: `code` hanya dikembalikan sekali saat POST; list tidak memuat code; DB menyimpan hash. Aksi admin tercatat di audit (INVITE_*, USER_*, SETTINGS_CHANGED, PROGRESS_OVERRIDE); UPDATE/DELETE `audit_log` dicabut dari `app_rw` (`drizzle/0002_custom_views_triggers.sql:42`). Email di audit dimasking (`audit.ts:26`).
- Health: probe URL hanya dari env (bukan input) sehingga tidak ada SSRF; detail hanya untuk admin.
- Temuan khusus task:

| ID | Sev | Lokasi | Ringkas |
|---|---|---|---|
| F-07b | LOW | `src/server/admin/health.ts:33-46` | `dirSizeMb` menelusuri `ASSETS_DIR` tanpa batas jumlah berkas (budget 1,5 dtk hanya dicek antar direktori; `readdir` besar tetap menahan). Cache hasil beberapa puluh detik agar endpoint admin tidak jadi beban disk. |
| F-13 | LOW | `src/app/api/health/route.ts:23-43` | `/api/health` publik, tanpa rate limit, setiap panggilan `SELECT 1` ke pool (max 10). Tambah bucket ringan atau cache 2-5 dtk. Isi respons sudah minimal (sesuai standar 9.8). |
| F-16 | LOW | `src/server/admin/users.ts:153-173` | Admin dapat mereset/menghapus akun tanpa batas laju khusus (hanya `general_user` 300/mnt). Pertimbangkan bucket `account_action` untuk aksi destruktif. |

## 3. Architecture Alignment
- [x] Pass. Endpoint dan DTO cocok dengan spec 002 (termasuk `SettingDTO.options` aditif yang sudah ada di spec dan `_api-contract.md`). Tugas `anonymizeDeletedUsers` ada di `src/worker/purge.ts` (idempoten, 30 hari) dan terdaftar di `purgeTasks`.

## 4. Recommendations
1. Perbaiki F-01 (log) karena jalur admin memakai transaksi dengan parameter email/hash.
2. F-13, F-16, F-07b opsional (LOW).
3. Tester: pastikan AC berikut tercakup: learner ke `/admin/*` -> 403, tanpa sesi -> 401, LAST_ADMIN, DISABLED -> 401 dalam <=1 dtk, E2E undangan -> daftar -> nonaktif.

**Keputusan:** Lulus untuk E2E.
