# TASK-017 Radar 6 Sumbu dan Prediksi Band
**Spec:** `specifications/017_spec_radar_band_predictor.md`
**Priority:** P0
**Wave:** W8
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-006, TASK-007, TASK-009, TASK-012, TASK-013, TASK-014
**Current Status:** ready_to_test

---

## Description
`GET /me/skills/radar` (6 sumbu, sampel objektif, proxy Grammar/Vocab), prediksi band, riwayat ujian.

## Acceptance Criteria
- [x] User tanpa jawaban: 6 sumbu null, `sample_size=0`
- [x] Vektor uji R1 (Listening 40/50 -> 80.00, band 7.5) dan Reading sampel kecil -> `estimated_band=null`
- [x] Soal AI (`is_correct IS NULL`) dan attempt IN_PROGRESS tidak masuk sampel; Writing rata-rata evaluasi
- [x] Seluruh AC SPEC-017 terpenuhi

## Notes
- Wave build: W8; ukuran estimasi: L (backlog)
- Kontrak API: `codes/src/contracts/skills.ts`
- Implementasi Backend: `codes/src/server/skills/service.ts`, hook pada `codes/src/server/hooks-register.ts`
- Implementasi UI: `RadarCard` di Dashboard (`codes/src/components/radar/radar-card.tsx`), `ExamHistoryView` di `/riwayat/ujian` (`codes/src/components/history/exam-history-view.tsx`)
- Tests: `tests/unit/radar.test.ts`, `tests/unit/radar-routes.test.ts`, `tests/unit/radar-ui.test.tsx` (15 tests passing, total suite 55 files / 713 tests green)

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-04 13:15 | developer agent | ready_to_test | Implementasi & verifikasi selesai (15 tests passed, tsc & eslint 0 error) |
