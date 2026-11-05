# TASK-014 Boss Stage (Gerbang Tier Berskor Band)
**Spec:** `specifications/014_spec_boss_stage.md`
**Priority:** P0
**Wave:** W7
**Size:** XL
**Assigned To:** Developer Agent
**Dependencies:** TASK-003, TASK-004, TASK-006, TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-013
**Current Status:** done

---

## Description
Ujian multi-section berurutan (Listening/Reading/Writing/Speaking) dengan timer per section, gerbang persen (Tier 1) atau band (Tier 2-4), pembuka Tier berikutnya. Dapat dirilis dengan Listening+Reading saja bila 012/013 tertunda.

## Acceptance Criteria
- [x] Ketersediaan: semua modul Tier selesai/SKIPPED, else 409 `BOSS_NOT_AVAILABLE` `MODULES_INCOMPLETE`
- [x] Urutan section ditegakkan (`SECTION_ORDER_VIOLATION`, `SECTION_NOT_ACTIVE`, `SECTION_EXPIRED` setelah deadline + 5 dtk)
- [x] `start` idempoten; gerbang Tier 1 >= 80% (L+R), Tier 2-4 bossBand >= 5.0/6.0/7.0
- [x] Review tanpa kunci/pembahasan
- [x] Seluruh AC SPEC-014 terpenuhi

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
| 2026-11-04 11:38 | developer agent | done | TASK-014 tuntas (backend boss handler, section endpoints, gatekeeping, multi-section UI, 18 unit tests, typecheck & lint 0 error) |
