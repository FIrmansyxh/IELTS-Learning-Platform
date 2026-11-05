# TASK-011 Listening dengan Audio Terkunci Mode Ujian
**Spec:** `specifications/011_spec_listening_exam_player.md`
**Priority:** P0
**Wave:** W5
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-004, TASK-006
**Current Status:** done

---

## Description
Endpoint audio ber-Range terotorisasi per attempt, pemutar terkunci (tanpa seek/jeda) pada mode ujian.

## Acceptance Criteria
- [x] Range 206 / tanpa Range 200 / di luar rentang 416 `RANGE_NOT_SATISFIABLE`
- [x] Attempt milik user lain 404; GRADED 409 `ATTEMPT_NOT_ACTIVE`; tanpa audio 404; berkas hilang 404 + log tanpa path
- [x] Kontrol pemutar terkunci pada EXAM, bebas pada PRACTICE
- [x] Seluruh AC SPEC-011 terpenuhi

## Notes
- Wave build: W5; ukuran estimasi: M (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-04 09:00 | orchestrator | in_progress | Development started |
| 2026-11-04 09:25 | orchestrator | ready_to_test | Fullstack implementation complete; 563/563 tests passed |
| 2026-11-04 09:30 | orchestrator | done | Approved at gate by human |
