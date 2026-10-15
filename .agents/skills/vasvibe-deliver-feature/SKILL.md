---
name: vasvibe-deliver-feature
description: Run the VasVibe deliver feature workflow with its approval gates.
---

Kerjakan satu fitur penuh dari build sampai test: **$ARGUMENTS**

1. Jalankan pipeline **/build-feature** (Fase 2) — berhenti di gate-nya.
2. Setelah gate lulus, jalankan **/test-feature** (Fase 3) — berhenti di gate-nya.
Jangan gabungkan gate; tiap fase tetap minta approval human terpisah.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan the configured Codex custom subagent named vasvibe_<persona>.
- **BERHENTI di setiap GATE / CHECKPOINT** dan minta persetujuan human secara eksplisit sebelum lanjut.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).

For delegation, invoke the configured Codex custom subagent named vasvibe_<persona> (for example, PM → vasvibe_pm). Keep interactive discovery and every human approval gate in the main conversation.
