# TASK-011 Listening dengan Audio Terkunci Mode Ujian
**Spec:** `specifications/011_spec_listening_exam_player.md`
**Priority:** P0
**Wave:** W5
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-004, TASK-006
**Current Status:** not_started

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
