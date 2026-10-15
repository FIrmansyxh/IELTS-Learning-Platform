---
description: Perbaikan bug terarah: fix → review → regression.
argument-hint: "[bug description] [depth=...]"
---

Tangani bug: **$ARGUMENTS**

**Langkah Pipeline:**
1. **Fixer** → analisis root cause & fix. Sampaikan deskripsi bug ini: "$ARGUMENTS". Instruksikan Fixer untuk membaca `task/task_list.md` guna menemukan Task ID relevan; jika tidak ditemukan atau `task_list.md` belum ada, lanjutkan langsung ke diagnosa source code di `codes/`.
2. **QA** → quick static review pada file yang diubah oleh Fixer.
3. **Tester** → regression test untuk memastikan fix tidak break fitur lain.
4. **CHECKPOINT:** Tampilkan ringkasan: bug yang diperbaiki, root cause, file yang diubah. Minta validasi human secara eksplisit.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan Task tool (Claude Code) / agent invocation (OpenCode).
- **BERHENTI di CHECKPOINT** dan minta persetujuan human secara eksplisit sebelum menutup pipeline.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).
