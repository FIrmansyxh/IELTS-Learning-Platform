# TASK-020 Admin Kurasi Konten
**Spec:** `specifications/020_spec_content_curation.md`
**Priority:** P1
**Wave:** W8
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-002, TASK-004, TASK-018, TASK-019
**Current Status:** ready_to_test (Backend + Frontend ready; integrasi/E2E belum diuji)

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
| 2026-11-03 15:40 | frontend | development started | - |
| 2026-11-03 16:05 | frontend | ready for QA/integration | kurasi kurikulum/soal/revisi selesai; tsc/vitest lulus; integrasi backend belum diuji |
| 2026-11-03 18:00 | backend | development started | - |
| 2026-11-03 18:25 | backend | ready for QA/integration | 11 endpoint kurasi (status K1/K2, sunting, revisi, kualitas, pagar K3 menutup F-15-07 jalur admin); tsc/eslint bersih, vitest 1063, test:integration 576 lulus; E2E belum diverifikasi |
| 2026-11-03 20:00 | backend | QA W8 fix | F-20-01, F-20-02, F-20-03 (server), F-20-04 selesai; tsc/eslint bersih, vitest 1086, test:integration 593 lulus |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test failed | Issues: D-004 (axe /admin/konten/kurikulum) |
| 2026-11-03 19:00 | fixer agent | fixing started | Issues: D-004 |
| 2026-11-03 19:05 | fixer agent | fix complete, ready to test | --color-text-muted menjadi #556376 (lihat TASK-003). |
| 2026-11-03 19:30 | test agent | test passed | Run penuh bersih Fase 3: 105 lulus/0 gagal/1 skip (+ spec012b AI mati lulus); defek terkait terverifikasi |
