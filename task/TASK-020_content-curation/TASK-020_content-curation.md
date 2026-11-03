# TASK-020 Admin Kurasi Konten
**Spec:** `specifications/020_spec_content_curation.md`
**Priority:** P1
**Wave:** W8
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-002, TASK-004, TASK-018, TASK-019
**Current Status:** not_started

---

## Description
Transisi status DRAFT/REVIEW/PUBLISHED/ARCHIVED, penghalang publish (`PUBLISH_BLOCKED`), konfirmasi review konten AI, edit metadata/soal, revisi, kualitas soal.

## Acceptance Criteria
- [ ] Publish set tanpa penghalang 200 (`reviewed_by/at` terisi); AI_GENERATED_REVIEWED butuh `confirm_reviewed`
- [ ] Penghalang `ASSET_UNVERIFIED`, `DRILL_NOT_PUBLISHED` -> 409 `PUBLISH_BLOCKED`
- [ ] Transisi tidak valid 409 `INVALID_STATUS_TRANSITION`; arsip menyembunyikan dari peta tanpa menghapus progres
- [ ] Seluruh AC SPEC-020 terpenuhi

## Notes
- Wave build: W8; ukuran estimasi: L (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
