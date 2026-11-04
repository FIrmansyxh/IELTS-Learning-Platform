# TASK-011 Listening dengan Audio Terkunci Mode Ujian
**Spec:** `specifications/011_spec_listening_exam_player.md`
**Priority:** P0
**Wave:** W5
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-004, TASK-006
**Current Status:** backend_ready

---

## Description
Endpoint audio ber-Range terotorisasi per attempt, pemutar terkunci (tanpa seek/jeda) pada mode ujian.

## Acceptance Criteria
- [ ] Range 206 / tanpa Range 200 / di luar rentang 416 `RANGE_NOT_SATISFIABLE`
- [ ] Attempt milik user lain 404; GRADED 409 `ATTEMPT_NOT_ACTIVE`; tanpa audio 404; berkas hilang 404 + log tanpa path
- [ ] Kontrol pemutar terkunci pada EXAM, bebas pada PRACTICE
- [ ] Seluruh AC SPEC-011 terpenuhi

## Notes
- Wave build: W5; ukuran estimasi: M (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 13:15 | backend | development started | - |
| 2026-11-03 13:15 | backend | ready for QA/integration | sisi server selesai; lihat dev_log.md [BACKEND] |
| 2026-11-03 13:00 | frontend | development started | - |
| 2026-11-03 13:20 | frontend | ready for QA/integration | ListeningPlayer terkunci + pra-cek audio + Section Tabs selesai terhadap kontrak; audio nyata/E2E belum diuji; lihat dev_log [FRONTEND] |
| 2026-11-03 14:30 | backend | QA W5 fixes done | F-11-02, F-11-03 |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test passed | E2E lulus |
