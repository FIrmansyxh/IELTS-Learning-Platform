---
name: vasvibe-plan-feature
description: Run the VasVibe plan feature workflow with its approval gates.
---

Jalankan **Perencanaan Fitur** (sub-set Fase 1, ruang lingkup satu fitur) untuk: **$ARGUMENTS**

> Berbeda dengan `/plan-project` yang menghasilkan SELURUH blueprint proyek, `/plan-feature` mengasumsikan blueprint proyek sudah ada dan hanya menghasilkan **spesifikasi satu fitur** yang siap dikerjakan. Output akhirnya identik dengan yang diproduksi Analyst: file spec lengkap di `specifications/` sesuai `schemas/specification.template.md`.

**PRECONDITION CHECK (langkah 0):**
- Pastikan `project_overview.md` ada dan "Tech Stack" + "UI Guidelines" terisi.
- Pastikan `specifications/000_spec_environment_setup.md` sudah ada.
- **Jika salah satu belum ada:** proyek belum direncanakan. **BERHENTI** dan arahkan human menjalankan `/plan-project` dulu. Jangan menambal blueprint proyek di sini.

Langkah:
1. **Feature Discovery (INTERAKTIF — JANGAN delegasikan ke subagent)** → kamu sendiri di thread utama mewawancarai human, khusus untuk fitur ini: tujuan & nilai, aktor/role, ruang lingkup, **apa yang di luar ruang lingkup (Non-Goals)**, aturan bisnis, dan kriteria sukses. Ringkas, fokus fitur — bukan wawancara proyek penuh. Ikuti gaya tanya-jawab `agent/workflows/discovery.md` namun terbatas pada fitur.
2. **GATE:** Human sign-off ruang lingkup & Non-Goals fitur.
3. **Delta acuan (KONDISIONAL — hanya jika fitur menuntutnya):**
   - Jika fitur butuh entitas/kolom data BARU → delegasikan ke **Data Architect** untuk menambah delta di `state/knowledge_base/data-model/` (bukan redesign).
   - Jika fitur butuh komponen/pola UI BARU → delegasikan ke **UX Designer** untuk menambah delta di `state/knowledge_base/design-system/`.
   - Jika `depth=deep` dan fitur menyentuh data sensitif → koordinasi **Security (Mode S)** untuk aturan yang relevan.
   - Jika tidak ada kebutuhan baru, lewati langkah ini.
4. **Analyst** → tulis spesifikasi fitur lengkap di `specifications/NNN_...md` (nomor urut berikutnya), mengikuti `schemas/specification.template.md` dan **Low-Entropy Gate** di `agent/workflows/analyst.md`. Terapkan atomicity (1 file = 1 user story; pecah bila perlu). **API Contract wajib final & deterministik.**
5. **GATE — Spec disetujui:** Human set `Human Approval Status: approved`. API Contract final sebelum fitur boleh masuk `/build-feature`.

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent yang disebut menggunakan the configured Codex custom subagent named vasvibe_<persona>.
- **BERHENTI di setiap GATE** dan minta persetujuan human secara eksplisit sebelum lanjut.
- Definisi kanonik pipeline: baca `agent/workflows/orchestrator.md`. Model fase & kepemilikan dokumen: `agent/workflows/_shared/phases.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).

For delegation, invoke the configured Codex custom subagent named vasvibe_<persona> (for example, PM → vasvibe_pm). Keep interactive discovery and every human approval gate in the main conversation.
