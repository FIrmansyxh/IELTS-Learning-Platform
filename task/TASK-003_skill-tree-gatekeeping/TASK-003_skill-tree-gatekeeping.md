# TASK-003 Skill Tree dan Gatekeeping Berurutan
**Spec:** `specifications/003_spec_skill_tree_gatekeeping.md`
**Priority:** P0
**Wave:** W1
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-000, TASK-001
**Current Status:** ready_to_test

---

## Description
Mesin status kurikulum (LOCKED/UNLOCKED/IN_PROGRESS/COMPLETED/SKIPPED), `GET /curriculum/tree`, `applyDrillResult`, `assertSubModuleAccessible`, unlock berantai.

## Acceptance Criteria
- [ ] Pengguna baru: Tier 1 dan sub-modul pertama UNLOCKED; `applyDrillResult(75.00)` -> COMPLETED dan membuka berikutnya; 74.99 tidak
- [ ] Best score tidak turun; panggilan ganda idempoten
- [ ] Rantai melewati sub-modul non-PUBLISHED; `LOCKED_CONTENT` 403 `PREVIOUS_INCOMPLETE`
- [ ] Seluruh AC SPEC-003 terpenuhi

## Notes
- Wave build: W1; ukuran estimasi: L (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 07:10 | frontend | development started | - |
| 2026-11-03 07:25 | frontend | ready for QA/integration | Peta belajar SkillTree + Sheet "Buka level" di /admin/pengguna + test; lihat dev_log.md |
| 2026-11-03 07:55 | backend | ready for QA/integration | Backend: GatekeepingService + tree + override; 24 tes integrasi + 12 unit lulus; lihat dev_log.md |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test failed | Issues: D-001, D-004 |
| 2026-11-03 19:00 | fixer agent | fixing started | Issues: D-001, D-004 |
| 2026-11-03 19:05 | fixer agent | fix complete, ready to test | D-001: lg:w-auto. D-004: --color-text-muted terang menjadi #556376 (5.58:1 di surface-muted, 6.12:1 di putih, 4.96:1 di border-tone #E2E8F0); gelap #94A3B8 tida |
| 2026-11-03 19:30 | test agent | test passed | Run penuh bersih Fase 3: 105 lulus/0 gagal/1 skip (+ spec012b AI mati lulus); defek terkait terverifikasi |
