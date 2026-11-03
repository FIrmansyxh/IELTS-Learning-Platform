# TASK-018 Admin Sumber Konten dan Aset Berlisensi
**Spec:** `specifications/018_spec_asset_license_management.md`
**Priority:** P0
**Wave:** W4
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** TASK-001, TASK-002, TASK-004
**Current Status:** not_started

---

## Description
Unggah aset (gambar WebP/PNG re-encode tanpa EXIF, audio dengan ffprobe, dokumen tanpa makro), dedup hash, status hak (`rights_status`), verifikasi lisensi, penghalang `ASSET_UNVERIFIED`.

## Acceptance Criteria
- [ ] Unggah gambar valid 201 `UNVERIFIED`; EXIF/GPS dihapus; SVG/EXE 415; DOCX makro 415 `MACRO_NOT_ALLOWED`
- [ ] Batas ukuran 413 (gambar 5 MB, audio 50 MB) dengan penulisan byte terbatas
- [ ] Audio: `duration_sec` dari ffprobe; korup 400 `audio_unreadable`
- [ ] Duplikat 409 `DUPLICATE_ASSET` / `ASSET_CODE_TAKEN`
- [ ] Seluruh AC SPEC-018 terpenuhi

## Notes
- Wave build: W4; ukuran estimasi: L (backlog)
- Kontrak API: `specifications/_api-contract.md`; Backend/Frontend paralel terhadap kontrak yang sama.
- Dependensi harus berstatus `done` sebelum task ini dimulai.
- Verifikasi video YouTube (C-08) memakai fitur ini.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 14:00 | frontend | development started | - |
| 2026-11-03 14:30 | frontend | ready for QA/integration | UI admin sumber/aset + banner lisensi selesai; tsc/eslint/vitest lulus; integrasi backend belum diuji |
