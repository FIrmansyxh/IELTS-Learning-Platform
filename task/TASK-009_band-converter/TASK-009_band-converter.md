# TASK-009 Konverter Band IELTS dan Overall Band
**Spec:** `specifications/009_spec_band_converter.md`
**Priority:** P0
**Wave:** W3
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-002
**Current Status:** ready_to_test

---

## Description
Tabel band Listening/Reading (versi, aktivasi), `convertRawToBand`, `overallBand`, `bossBand`, `roundToHalfBand`, `scaleToForty`, API admin band-tables.

## Acceptance Criteria
- [ ] Seed: 1 tabel aktif per skill (`v1-umum-2026-11`), 17 baris menutup 0..40
- [ ] Vektor uji konversi (mis. Listening 25/26/29/30 -> 6.0/6.5/6.5/7.0) dan pembulatan setengah band lulus
- [ ] `scaleToForty` invalid melempar error
- [ ] `POST /admin/band-tables` membuat tabel nonaktif, tabel aktif lama tidak berubah
- [ ] Seluruh AC SPEC-009 terpenuhi

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
| 2026-11-03 09:30 | frontend | ready for QA/integration | Komponen band bersama + admin /admin/band selesai terhadap kontrak; integrasi dengan backend belum diuji |
| 2026-11-03 12:30 | backend | development started | - |
| 2026-11-03 12:30 | backend | ready for QA/integration | API server selesai + unit/integration lulus; E2E belum diuji |
