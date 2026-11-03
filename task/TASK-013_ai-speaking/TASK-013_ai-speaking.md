# TASK-013 Penilaian AI Speaking (Rekam, STT)
**Spec:** `specifications/013_spec_ai_speaking.md`
**Priority:** P1
**Wave:** W6
**Size:** XL
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-005, TASK-006, TASK-012
**Current Status:** not_started

---

## Description
Persetujuan rekaman, unggah audio webm Opus tervalidasi, STT whisper.cpp, penilaian Ollama, kap durasi Part 2, retensi rekaman.

## Acceptance Criteria
- [ ] Tanpa consent 409 `RECORDING_CONSENT_REQUIRED`; webm valid 202 tersimpan di `private/recordings/`
- [ ] Tipe palsu 415; 11 MB 413 dengan pembacaan dihentikan (<= 10 MB + 64 KB)
- [ ] Audio 151 dtk `AUDIO_TOO_LONG`; transkrip 3 kata `STT_EMPTY`; STT mock mengisi transkrip
- [ ] Pronunciation selalu 'diperkirakan'; retensi rekaman berjalan
- [ ] Seluruh AC SPEC-013 terpenuhi

## Notes
- Wave build: W6; ukuran estimasi: XL (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.
- Menunggu keputusan model dari C-09 (`bench:ai`); gunakan driver mock untuk pengembangan/uji; seed rubrik butuh C-05.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
