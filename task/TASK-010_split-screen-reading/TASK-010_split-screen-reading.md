# TASK-010 Split-Screen Reading dengan Highlighter
**Spec:** `specifications/010_spec_split_screen_reading.md`
**Priority:** P0
**Wave:** W5
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-004, TASK-006
**Current Status:** not_started

---

## Description
Tata letak dua panel (passage/soal) dengan pembagi dapat digeser (keyboard), highlighter kuning/hijau tersimpan di localStorage, `parsePassages`.

## Acceptance Criteria
- [ ] `parsePassages` sesuai vektor uji; > 3 passage melempar `too_many_passages`
- [ ] Viewport 1280x800: tepat dua panel scroll independen; pembagi ARIA slider (50->65 via ArrowRight, batas)
- [ ] Rasio tersimpan (`split:v1`) dan sorotan pulih setelah refresh; seleksi lintas paragraf tidak memunculkan toolbar
- [ ] Seluruh AC SPEC-010 terpenuhi

## Notes
- Wave build: W5; ukuran estimasi: M (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
