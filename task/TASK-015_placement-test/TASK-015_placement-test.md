# TASK-015 Placement Test Adaptif 25 Soal
**Spec:** `specifications/015_spec_placement_test.md`
**Priority:** P1
**Wave:** W7
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-003, TASK-004, TASK-006, TASK-007, TASK-008
**Current Status:** not_started

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
