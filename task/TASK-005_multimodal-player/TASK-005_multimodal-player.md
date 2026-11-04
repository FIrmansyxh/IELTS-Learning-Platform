# TASK-005 Pemutar Materi Multimodal Learn-Drill-Apply
**Spec:** `specifications/005_spec_multimodal_player.md`
**Priority:** P0
**Wave:** W2
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-003, TASK-004
**Current Status:** ready_to_test

---

## Description
`GET /sub-modules/{code}` (artikel, video YouTube embed, slide), pelacakan waktu aktif server, `learn-complete` dengan bukti belajar, kerangka tab Latih/Terapkan.

## Acceptance Criteria
- [ ] Sub-modul LOCKED 403 tanpa membocorkan materi; DRAFT/ARCHIVED/tidak ada 404; kode salah format 400
- [ ] Payload tidak memuat `ai_rubric_criteria`, `storage_key`, `sha256`, `external_url`
- [ ] Anti-farming ping: kenaikan `learn_active_seconds` di-clamp (ping pertama +5, maks elapsed+2)
- [ ] `learn-complete` 409 `LEARN_REQUIREMENTS_NOT_MET` bila syarat sub-tab/waktu belum terpenuhi
- [ ] Seluruh AC SPEC-005 terpenuhi

## Notes
- Wave build: W2; ukuran estimasi: L (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 08:30 | frontend | development started | - |
| 2026-11-03 08:30 | frontend | ready for QA/integration | UI pemutar (artikel aman, video YouTube, slide, bukti belajar, Terapkan) selesai terhadap kontrak; integrasi dengan backend belum diuji |
| 2026-11-03 11:50 | backend | development started | - |
| 2026-11-03 11:58 | backend | ready for QA/integration | unit + integration lulus; lihat dev_log [BACKEND] |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test failed | Issues: D-001, D-002 |
| 2026-11-03 19:00 | fixer agent | fixing started | Issues: D-001, D-002 (+ aria-controls subtab) |
| 2026-11-03 19:05 | fixer agent | fix complete, ready to test | D-002: unmetRequirements memakai progress.min_active_seconds ?? 60. Subtab: panel dibungkus <TabsContent value={active}>. D-001: lihat TASK-001. Header/root pem |
| 2026-11-03 19:30 | test agent | test passed | Run penuh bersih Fase 3: 105 lulus/0 gagal/1 skip (+ spec012b AI mati lulus); defek terkait terverifikasi |
