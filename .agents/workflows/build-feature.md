---
description: Jalankan Fase 2 (Pengerjaan) — implementasi satu fitur dari spec yang sudah ada.
---

Jalankan **Fase 2 — Pengerjaan** untuk fitur: **$ARGUMENTS**

Langkah:
1. **PM** → buat task & detail file dari spec
2. **Analyst (spec-lock)** → matangkan AC detail untuk fitur ini
3. **Implementasi sesuai depth:**
   - `depth=fast` → **Fullstack** (fullstack tunggal)
   - `depth=standard|deep` → **Backend Engineer** ∥ **Frontend Engineer** (paralel, honor API Contract)
4. **QA** → static review + unit test
5. **GATE — Code review lulus:** Human review pakai QA report.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan Task tool (Claude Code) / agent invocation (OpenCode).
- **BERHENTI di setiap GATE / CHECKPOINT** dan minta persetujuan human secara eksplisit sebelum lanjut.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).
