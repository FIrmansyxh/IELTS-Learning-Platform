# TASK-001 Akun dan Sesi (Auth)
**Spec:** `specifications/001_spec_auth_session.md`
**Priority:** P0
**Wave:** W1
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-000
**Current Status:** ready_to_test

---

## Description
Daftar (mode open/invite/closed), masuk, keluar, ganti password, dan profil dasar Learner dengan Auth.js, hashing password, rate limit, token_version.

## Acceptance Criteria
- [ ] Register mode open/invite/closed berperilaku sesuai (201, 403 `INVITE_INVALID`, 403 `SIGNUP_CLOSED`, 409 `EMAIL_TAKEN`)
- [ ] Validasi password (panjang minimum, daftar password umum) mengembalikan `VALIDATION_ERROR` dengan `details[].code`
- [ ] Login/logout/ganti password/profil sesuai kontrak `_api-contract.md`
- [ ] Seluruh AC SPEC-001 terpenuhi

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
| 2026-11-03 07:25 | frontend | ready for QA/integration | UI auth (masuk, daftar, ganti password, profil, AppShell, AuthGate) + klien API + test; lihat dev_log.md |
| 2026-11-03 07:55 | backend | ready for QA/integration | Backend: sesi/auth/withApi/bootstrap selesai; 36 tes integrasi + 40 tes unit/security lulus; lihat dev_log.md |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test failed | Issues: D-001 |
| 2026-11-03 19:00 | fixer agent | fixing started | Issues: D-001 |
| 2026-11-03 19:05 | fixer agent | fix complete, ready to test | Tambah lg:w-auto pada <main> (blok mengisi sisa lebar setelah margin sidebar); mobile tidak berubah (w-full tetap tanpa margin kiri). |
| 2026-11-03 19:30 | test agent | test passed | Run penuh bersih Fase 3: 105 lulus/0 gagal/1 skip (+ spec012b AI mati lulus); defek terkait terverifikasi |
