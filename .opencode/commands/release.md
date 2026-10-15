---
description: Rangkaian akhir ke produksi: hardening → changelog → version tag.
---

Jalankan rangkaian rilis untuk versi: **$ARGUMENTS**

1. **PM** → summarize semua task `done` sejak release terakhir
2. Jalankan **/harden-release "$ARGUMENTS"** (Fase 4) — berhenti di gate-nya
3. **Document** → update `CHANGELOG.md`
4. **DevOps** → bump version, buat git tag `v$ARGUMENTS`
5. **CHECKPOINT:** Human review CHANGELOG & approve release tag.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan Task tool (Claude Code) / agent invocation (OpenCode).
- **BERHENTI di setiap GATE / CHECKPOINT** dan minta persetujuan human secara eksplisit sebelum lanjut.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).
