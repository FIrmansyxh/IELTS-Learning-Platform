# TASK-016 Gamifikasi: Mahkota, Poin, Speed Streak, Streak Harian
**Spec:** `specifications/016_spec_gamification.md`
**Priority:** P1
**Wave:** W8
**Size:** M
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-003, TASK-005, TASK-006, TASK-014
**Current Status:** not_started

---

## Description
Mahkota Silver/Gold (>= 75 / >= 90), poin ledger anti-farming (hanya naik bila lebih baik), speed streak, streak harian Asia/Jakarta.

## Acceptance Criteria
- [ ] Poin DRILL/SPEED_STREAK/CROWN dihitung sesuai contoh; attempt ulang hanya menambah selisih
- [ ] Mahkota: 74.99 tidak lulus; 89.99 SILVER; 90.00 GOLD; GOLD tidak turun
- [ ] Submit ganda/serentak tidak menggandakan ledger (indeks unik)
- [ ] Seluruh AC SPEC-016 terpenuhi

## Notes
- Wave build: W8; ukuran estimasi: M (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
