# TASK-019 Admin Bulk Importer JSON/CSV
**Spec:** `specifications/019_spec_bulk_importer.md`
**Priority:** P0
**Wave:** W4
**Size:** XL
**Assigned To:** Developer Agent
**Dependencies:** TASK-000, TASK-002, TASK-004, TASK-018
**Current Status:** ready_to_test

---

## Description
UI/API impor: unggah JSON/CSV (soal), validasi async di worker, pratinjau per item, publish dengan acknowledge peringatan, rollback batch.

## Acceptance Criteria
- [ ] Unggah 201 UPLOADED lalu PREVIEW_READY; 413/415/400 sesuai (5 MB, bukan UTF-8, xlsx)
- [ ] Pertahanan prototype pollution (`__proto__`) -> 400 `forbidden_key`
- [ ] Item galat tampil di `items?status=`; peringatan butuh `acknowledge_warnings` (409 `WARNINGS_NOT_ACKNOWLEDGED`)
- [ ] Publish dengan aset UNVERIFIED dibatalkan transaksional; rollback batch memulihkan
- [ ] Seluruh AC SPEC-019 terpenuhi

## Notes
- Wave build: W4; ukuran estimasi: XL (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.
- Populasi konten massal Tier 1-4 (C-01..C-04) berjalan paralel mulai W4 setelah task ini selesai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 14:00 | frontend | development started | - |
| 2026-11-03 14:30 | frontend | ready for QA/integration | UI importer 4 langkah + riwayat + rollback selesai; tsc/eslint/vitest lulus; integrasi backend belum diuji |
| 2026-11-03 12:40 | backend | development started | - |
| 2026-11-03 12:40 | backend | ready for QA/integration | API + tes integrasi lulus (280); E2E belum diuji |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test passed | E2E lulus |
