# TASK-002 Admin Dasar: Pengguna, Undangan, Pengaturan, Audit, Kesehatan
**Spec:** `specifications/002_spec_admin_users_invites.md`
**Priority:** P0
**Wave:** W1
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-000, TASK-001
**Current Status:** ready_to_test

---

## Description
Admin mengelola pengguna, undangan (kode Crockford), app_settings, melihat audit log dan kesehatan sistem.

## Acceptance Criteria
- [ ] Semua `/api/v1/admin/*` 403 untuk learner, 401 tanpa sesi
- [ ] Undangan: buat (format kode), kedaluwarsa, cabut (204 lalu 409 `INVITE_NOT_ACTIVE`)
- [ ] Buat pengguna dengan temporary password 16 karakter dan `must_change_password=true`; DISABLED memutus sesi (token_version naik)
- [ ] Guard admin terakhir: 409 `CANNOT_MODIFY_SELF`
- [ ] Seluruh AC SPEC-002 terpenuhi

## Notes
- Wave build: W1; ukuran estimasi: M (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 07:10 | frontend | development started | - |
| 2026-11-03 07:25 | frontend | ready for QA/integration | UI admin (ringkasan kesehatan, pengguna, undangan, pengaturan, audit) + test; lihat dev_log.md |
| 2026-11-03 07:55 | backend | ready for QA/integration | Backend: 12 endpoint admin + anonimisasi; 17 tes integrasi lulus; lihat dev_log.md |
