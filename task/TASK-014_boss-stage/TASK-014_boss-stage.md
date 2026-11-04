# TASK-014 Boss Stage (Gerbang Tier Berskor Band)
**Spec:** `specifications/014_spec_boss_stage.md`
**Priority:** P0
**Wave:** W7
**Size:** XL
**Assigned To:** Developer Agent
**Dependencies:** TASK-003, TASK-004, TASK-006, TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-013
**Current Status:** ready_to_test

---

## Description
Ujian multi-section berurutan (Listening/Reading/Writing/Speaking) dengan timer per section, gerbang persen (Tier 1) atau band (Tier 2-4), pembuka Tier berikutnya. Dapat dirilis dengan Listening+Reading saja bila 012/013 tertunda.

## Acceptance Criteria
- [ ] Ketersediaan: semua modul Tier selesai/SKIPPED, else 409 `BOSS_NOT_AVAILABLE` `MODULES_INCOMPLETE`
- [ ] Urutan section ditegakkan (`SECTION_ORDER_VIOLATION`, `SECTION_NOT_ACTIVE`, `SECTION_EXPIRED` setelah deadline + 5 dtk)
- [ ] `start` idempoten; gerbang Tier 1 >= 80% (L+R), Tier 2-4 bossBand >= 5.0/6.0/7.0
- [ ] Review tanpa kunci/pembahasan
- [ ] Seluruh AC SPEC-014 terpenuhi

## Notes
- Wave build: W7; ukuran estimasi: XL (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.
- Boss dapat dirilis dengan set Listening+Reading saja bila 012/013 bergeser (SPEC-014 Edge Case); dependensi 012/013 bersifat lunak untuk section Writing/Speaking.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 14:20 | frontend | development started | - |
| 2026-11-03 14:50 | frontend | ready for QA/integration | UI selesai terhadap kontrak; integrasi backend belum diuji; lihat dev_log.md [FRONTEND] |
| 2026-11-03 15:00 | backend | development started | - |
| 2026-11-03 15:00 | backend | ready for QA/integration | Backend: sections start/submit, penilaian band L+R, gerbang Tier (applyBossResult), D8, audit BOSS_PASSED/FAILED; tsc/eslint/vitest/test:integration hijau; E2E dan Boss hasil impor belum diverifikasi; lihat dev_log.md [BACKEND] |
| 2026-11-03 15:20 | frontend | QA fixes F-14-07/08/13 | F-14-09 menunggu field backend; lihat dev_log [FRONTEND] perbaikan QA |
| 2026-11-03 15:40 | backend | QA W7 fixes F-14-01/02/03/05/08/09 | migrasi 0009; field baru boss.sections[]: latest_submission_id, graded_submission_id, ai_status; lihat dev_log [BACKEND] perbaikan QA |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test passed | E2E lulus |
