# QA & Security Report: TASK-003 Skill Tree & Gatekeeping
**Date:** 2026-11-03
**Target Branch:** claude/ielts-learning-platform-a3ccc4 (working tree, belum di-commit)
**Verifikasi:** `tsc`, `eslint --max-warnings=0`, `vitest run` (199 tes, termasuk `gatekeeping-rules.test.ts` 12 tes) lulus. Tes integrasi (Postgres) tidak dijalankan QA; dev_log melaporkan 96 lulus. Temuan bersama ada di `task/TASK-001_auth-session/qa_report.md`.
**Status:** LULUS (0 CRITICAL, 0 HIGH khusus task ini, 2 LOW).

## 1. Code Quality & Standards
- [x] Pass. Aturan murni dipisah dari I/O (`gatekeeping/rules.ts` tanpa DB; `service.ts` I/O; `tree.ts` DTO). Transisi monoton, `toHundredths` menghindari float pada perbandingan skor. `service.ts` 488 baris masih wajar.

## 2. Security Assessment
- [x] Pass
- "Gatekeeping hanya lewat service": grep `user_(tier|module|sub_module)_progress` / `userSubModuleProgress` di seluruh `src/` dan `scripts/` di luar `src/server/gatekeeping/` dan `src/db/schema.ts` = 0 hasil. Tidak ada endpoint "tandai selesai" dari klien. Satu-satunya route yang mengubah progres adalah admin override (`src/app/api/v1/admin/users/[user_id]/progress/unlock/route.ts`): `auth:'admin'`, body `strictObject {level,target_id}`, transaksi + `PROGRESS_OVERRIDE` di `audit_log`, unlock_source=ADMIN, hanya LOCKED -> UNLOCKED (ALREADY_UNLOCKED, NOT_AVAILABLE untuk DRAFT).
- Progres selalu per `userId` dari sesi: `GET /curriculum/tree` memanggil `getCurriculumTree(db, user.id)`; tidak ada parameter user dari klien. Baris dikunci urut (tier, modul, sub-modul; urut id) mencegah deadlock/balapan (`service.ts:57-62,226-238`). `assertSubModuleAccessible` (`service.ts:287-314`) menolak NOT_FOUND (DRAFT) / LOCKED_CONTENT (403), sehingga mengetahui UUID tidak membuka sub-modul; API ini siap dipakai SPEC-005/006.
- Semua SQL mentah memakai placeholder `${}` (`::uuid` cast); pembaruan massal lewat `jsonb_to_recordset` dengan JSON ter-parameter. Tidak ada `sql.raw`.
- DTO pohon (`tree.ts`) tidak memuat soal, kunci jawaban, atau materi; hanya judul/status/progres. Respons `no-store`.
- Temuan:

| ID | Sev | Lokasi | Ringkas |
|---|---|---|---|
| F-07 | LOW | `src/server/gatekeeping/tree.ts:130-136` -> `service.ts:45-55,248-259` | `GET /curriculum/tree` menulis ke DB (INSERT baris progres, UPDATE status via `recomputeStatuses`) dan mengambil `FOR UPDATE` bila ada perubahan. Standar 8.4(4): tidak ada mutasi lewat GET. Efeknya idempoten dan turunan (derived), tanpa kendali penyerang, jadi LOW; dokumentasikan sebagai pengecualian atau pindahkan ke hook (register/publish). |
| F-17 | LOW | `src/server/gatekeeping/service.ts:333-334,365,371,396` | `applyDrillResult`/`applySkipResult`/`applyBossResult` melempar `Error` biasa (500 generik) bila target tidak valid/terkunci; pemanggil SPEC-006/008/014 wajib memanggil `assertSubModuleAccessible` lebih dulu. Dokumentasikan prasyarat atau lempar `ApiError` yang sesuai. |
| INFO | - | spec 003 | Judul sub-modul DRAFT tampil sebagai "Segera hadir" ke learner (by design D1). |

## 3. Architecture Alignment
- [x] Pass. Hook `userCreatedHooks` -> `GatekeepingService.initializeProgress` (`hooks-register.ts`) berjalan dalam transaksi register/admin-create. Respons pohon cocok dengan `src/contracts/curriculum.ts`; `lock_reason` memakai kode TIER_LOCKED/PREVIOUS_INCOMPLETE/NOT_PUBLISHED. Gerbang Tier mengikuti D6 (`boss_passed_at` hanya diisi oleh `applyBossResult`).

## 4. Recommendations
1. F-17: dokumentasikan atau jaga prasyarat akses agar bukan 500.
2. F-07: dokumentasikan pengecualian.
3. Tester: untuk W1 cukup tree + admin override + must_change_password; skenario negatif gatekeeping security-standards 6.3(10) a-f dijalankan setelah SPEC-006.

**Keputusan:** Lulus untuk E2E.
