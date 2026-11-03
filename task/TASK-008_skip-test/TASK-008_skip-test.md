# TASK-008 Skip Test Modul dan Tier
**Spec:** `specifications/008_spec_skip_test.md`
**Priority:** P0
**Wave:** W3
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-003, TASK-004, TASK-006
**Current Status:** ready_to_test

---

## Description
Mode EXAM untuk set Skip Modul/Tier: intro, ketersediaan, timer deadline, tanpa feedback, lulus >= 85% menandai SKIPPED, cooldown gagal 60 menit.

## Acceptance Criteria
- [ ] Skip hanya untuk modul/tier belum dimulai; 409 `SKIP_NOT_AVAILABLE` bila ada sub-modul berjalan
- [ ] Attempt EXAM: `deadline_at` tepat, tanpa `feedback` dan `is_correct`
- [ ] Lulus tepat 85.00% menandai SKIPPED (`unlock_source=SKIP_TEST`); 84.99% gagal tanpa perubahan
- [ ] Gagal: `retry.next_allowed_at` = submit + 60 menit
- [ ] Seluruh AC SPEC-008 terpenuhi

## Notes
- Wave build: W3; ukuran estimasi: M (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 09:30 | frontend | development started | - |
| 2026-11-03 09:30 | frontend | ready for QA/integration | UI intro/ujian berjalan/hasil Skip, tombol peta dengan konfirmasi selesai terhadap kontrak; integrasi dengan backend belum diuji |
| 2026-11-03 12:30 | backend | development started | - |
| 2026-11-03 12:30 | backend | ready for QA/integration | API server selesai + unit/integration lulus; E2E belum diuji |
