---
description: Bangun prototipe UI/UX cepat (frontend-only, data mock) untuk presentasi/menyepakati desain dengan klien — tanpa backend.
argument-hint: "[layar/fitur yang diprototipe] [depth=fast|standard]"
---

Jalankan **Build Prototype** — prototipe UI/UX cepat untuk: **$ARGUMENTS**

> **Tujuan:** menampilkan tampilan aplikasi secepatnya untuk presentasi ke klien / menyepakati UI-UX — BUKAN produk jadi. **Frontend saja: tanpa backend, tanpa API nyata, tanpa database.** Data di-mock/fixture. Ini artefak demo (throwaway) yang bisa diganti; jangan diperlakukan sebagai implementasi final.

**DI LUAR RUANG LINGKUP (jangan dikerjakan):** business logic, persistensi data, integrasi API nyata, autentikasi nyata, dan test fungsional. Untuk implementasi sungguhan gunakan `/build-feature`.

Langkah:
0. **Provisioning (Toolsmith)** → pastikan skill + MCP untuk prototyping terpasang di tool aktif: skill `ui-ux-pro-max` + `theme-factory`, MCP `shadcn`. Sumber acuan `state/workspace-manifest.json` + `schemas/workspace-registry.json` (mapping `prototype`). Skip cepat jika sudah ter-apply.
1. **Brief Prototipe (INTERAKTIF — JANGAN delegasikan ke subagent)** → klarifikasi cepat dengan human di thread utama: layar/alur apa yang mau ditunjukkan, urutan navigasi antar-layar, dan referensi visual (brand/warna/mood) jika ada. Ringkas — bukan wawancara kebutuhan penuh.
   - *(Opsional, pra-kode)* Untuk menyepakati layout/hierarki lebih dulu tanpa menulis kode, boleh pakai mockup inline (skill/tool `visualize`) atau aset visual (Canva) **bila tool aktif menyediakannya** — ini opsional, bukan dependensi.
2. **Arah Visual (pilih satu):**
   - `state/knowledge_base/design-system/` **sudah ada** → pakai sebagai acuan, lewati langkah ini.
   - Belum ada & butuh **kilat** → gunakan skill **`theme-factory`** untuk menetapkan tema global (palette + font) instan.
   - Belum ada & mau **lebih rapi** → delegasikan ke **UX Designer** (mode `fast`) untuk palette + tipografi + token dasar via `ui-ux-pro-max`.
3. **Frontend Engineer (mode PROTOTYPE)** → bangun UI di `codes/`:
   - Frontend-only, **tanpa panggilan backend** — gunakan data **mock/fixture statis**.
   - **Tooling (komplementer):** `theme-factory` untuk tema global (bila belum ada design-system) · `ui-ux-pro-max` untuk pola, layout & kualitas komponen · MCP `shadcn` untuk menarik komponen jadi bila tersedia. Ikuti `design-system/` bila ada.
   - Bangun semua layar yang disepakati + **navigasi antar-layar yang clickable** agar bisa didemokan.
   - Tampilkan variasi state (empty/loading/success) sebagai tampilan statis bila relevan — tanpa logika nyata.
   - **Lewati unit test dan integrasi API.**
4. **CHECKPOINT — Demo ke klien:** **Jalankan dev server** prototipe dan tampilkan ke human/klien; kumpulkan feedback UI/UX. **Iterasi langkah 3** sampai desain disepakati.
5. **Output:** prototipe frontend yang bisa dijalankan untuk presentasi + catatan kesepakatan UI/UX (masukan untuk `design-system/` atau spec berikutnya).

**Aturan orkestrasi (WAJIB):**
- Kamu adalah **Orchestrator** di thread utama. Delegasikan tiap langkah ke subagent (Task tool Claude Code / agent invocation OpenCode).
- **BERHENTI di CHECKPOINT** untuk feedback klien sebelum iterasi atau menyelesaikan.
- Ini alur **di luar 4 fase** (throwaway/demo) — JANGAN buat spec, API Contract, atau backend. Jika klien setuju dan ingin lanjut ke produk, arahkan ke `/plan-feature` (fitur) atau `/plan-project` (proyek baru).
- Definisi kanonik pipeline: `agent/workflows/orchestrator.md`. Model fase: `agent/workflows/_shared/phases.md`.
