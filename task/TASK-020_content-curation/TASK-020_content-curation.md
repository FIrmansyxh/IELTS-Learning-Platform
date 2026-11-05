# TASK-020 Admin Kurasi Konten
**Spec:** `specifications/020_spec_content_curation.md`
**Priority:** P1
**Wave:** W8
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-002, TASK-004, TASK-018, TASK-019
**Current Status:** ready_to_test

---

## Description
Transisi status DRAFT/IN_REVIEW/APPROVED/PUBLISHED/ARCHIVED, penghalang publish (`PUBLISH_BLOCKED`), konfirmasi review konten AI (`REVIEW_CONFIRMATION_REQUIRED`), edit metadata/soal, proteksi attempt aktif (`SET_HAS_ACTIVE_ATTEMPTS`), hashing kanonikal SHA-256 & revisi, evaluasi kualitas soal (`TOO_HARD`, `TOO_EASY`, `NORMAL`, `INSUFFICIENT_DATA`).

## Acceptance Criteria
- [x] Publish set tanpa penghalang 200 (`reviewed_by/at` terisi); AI_GENERATED_REVIEWED butuh `confirm_reviewed`
- [x] Penghalang `ASSET_UNVERIFIED`, `DRILL_NOT_PUBLISHED` -> 409 `PUBLISH_BLOCKED`
- [x] Transisi tidak valid 409 `INVALID_STATUS_TRANSITION`; arsip menyembunyikan dari peta tanpa menghapus progres
- [x] Proteksi attempt aktif: set dengan attempt `IN_PROGRESS` tidak dapat diarsipkan/didrafkan atau disunting (409 `SET_HAS_ACTIVE_ATTEMPTS`)
- [x] Kualitas soal: `TOO_HARD` (<20%), `TOO_EASY` (>98%), `NORMAL` (20-98%) dengan minimum 20 attempt
- [x] Riwayat revisi dengan snapshot JSON dan deteksi perubahan versi konten
- [x] Seluruh AC SPEC-020 terpenuhi

## Notes
- Wave build: W8; ukuran estimasi: L
- Kontrak API: `codes/src/contracts/curation.ts`
- Service: `codes/src/server/content/curation-service.ts`
- Routes: `/api/v1/admin/curriculum`, `/api/v1/admin/assessment-sets`, `/api/v1/admin/sub-modules/[id]`, `/api/v1/admin/modules/[id]`, `/api/v1/admin/[entity]/[id]/status`, `/api/v1/admin/content-revisions`, dll.
- Frontend: `CurriculumPanel`, `QuestionsPanel`, `RevisionsPanel`, dan halaman admin navigasi terkait.
- Tests: `tests/unit/curation.test.ts`, `tests/unit/curation-routes.test.ts`, `tests/unit/curation-ui.test.tsx` (24 unit tests, 100% passing).

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-04 13:20 | developer agent | development | backend core & contracts implemented |
| 2026-11-04 13:52 | developer agent | ready_to_test | Fullstack curation implemented, UI components & pages built, test suite 100% passing (58 test files, 748 tests green) |
