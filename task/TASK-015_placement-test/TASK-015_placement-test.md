# TASK-015 Placement Test Adaptif 25 Soal
**Spec:** `specifications/015_spec_placement_test.md`
**Priority:** P1
**Wave:** W7
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-003, TASK-004, TASK-006, TASK-007, TASK-008
**Current Status:** ready_to_test

---

## Description
Tes adaptif staircase (mulai kesulitan 3, +1/-1), 25 soal, rekomendasi Tier, safeguard < 32% -> Tier 1, pilih Tier <= rekomendasi sekali, Tier di bawah ditandai SKIPPED.

## Acceptance Criteria
- [ ] `GET /placement`: availability dan `blocked_reason` (`PROGRESS_EXISTS`, `ALREADY_COMPLETED`, `NO_PLACEMENT_PUBLISHED`)
- [ ] Soal pertama kesulitan 3; benar -> berikutnya 4, tanpa feedback; fallback ofset +1,-1,+2,-2
- [ ] Rekomendasi = floor rata-rata kesulitan 10 soal terakhir; safeguard < 32% -> Tier 1
- [ ] Seluruh AC SPEC-015 terpenuhi

## Notes
- Wave build: W7; ukuran estimasi: L (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 14:20 | frontend | development started | - |
| 2026-11-03 14:50 | frontend | ready for QA/integration | UI selesai terhadap kontrak; integrasi backend belum diuji; lihat dev_log.md [FRONTEND] |
| 2026-11-03 15:00 | backend | development started | - |
| 2026-11-03 15:00 | backend | ready for QA/integration | Backend: GET /placement, placement adaptif staircase, rekomendasi, POST /placement/apply; tsc/eslint/vitest/test:integration hijau; E2E dan set hasil impor belum diverifikasi; lihat dev_log.md [BACKEND] |
| 2026-11-03 15:40 | backend | QA W7 fixes F-15-01/03/04/05/08 | rekomendasi dibatasi bukti (ADR-003 #30); lihat dev_log [BACKEND] perbaikan QA |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test passed | E2E lulus |
