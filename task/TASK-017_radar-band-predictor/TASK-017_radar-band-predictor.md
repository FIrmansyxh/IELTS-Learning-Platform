# TASK-017 Radar 6 Sumbu dan Prediksi Band
**Spec:** `specifications/017_spec_radar_band_predictor.md`
**Priority:** P0
**Wave:** W8
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-006, TASK-007, TASK-009, TASK-012, TASK-013, TASK-014
**Current Status:** ready_to_test (Backend + Frontend ready; integrasi/E2E belum diuji)

---

## Description
`GET /me/skills/radar` (6 sumbu, sampel objektif, proxy Grammar/Vocab), prediksi band, riwayat ujian.

## Acceptance Criteria
- [ ] User tanpa jawaban: 6 sumbu null, `sample_size=0`
- [ ] Vektor uji R1 (Listening 40/50 -> 80.00, band 7.5) dan Reading sampel kecil -> `estimated_band=null`
- [ ] Soal AI (`is_correct IS NULL`) dan attempt IN_PROGRESS tidak masuk sampel; Writing rata-rata evaluasi
- [ ] Seluruh AC SPEC-017 terpenuhi

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
| 2026-11-03 16:05 | frontend | ready for QA/integration | radar, prediksi, riwayat ujian + grafik selesai; tsc/vitest lulus; integrasi backend belum diuji |
| 2026-11-03 17:30 | backend | development started | - |
| 2026-11-03 17:55 | backend | ready for QA/integration | radar 6 sumbu + prediksi + riwayat band/ujian, evaluationGradedHooks terisi; tsc/eslint bersih, vitest 1063, test:integration 576 lulus; E2E belum diverifikasi |
| 2026-11-03 20:00 | backend | QA W8 fix | F-17-01 (dedupe per soal), F-17-02 (min sampel 10, rentang by sampel, sample_size/low_sample) selesai; tsc/eslint bersih, vitest 1086, test:integration 593 lulus |
| 2026-11-03 18:35 | test agent | test created | - |
| 2026-11-03 18:35 | test agent | running test | Playwright E2E, lihat test_report.md |
| 2026-11-03 18:35 | test agent | test passed | E2E lulus |
