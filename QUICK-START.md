# 🚀 Quick Start — VasVibe Workflow

Panduan singkat memulai proyek dengan workflow agen VasVibe setelah scaffold selesai.

> **Sudah install?** Kamu menjalankan `npx create-vasvibe my-app`. Folder `my-app/` sudah berisi agen & workflow yang dipilih. Untuk Codex, mulai sesi baru di folder project; panggil workflow dengan `$vasvibe-plan-project`, `$vasvibe-build-feature`, atau skill lain dari daftar `$`.

---

## 1. Mental Model (1 menit)

Proyek dikerjakan dalam **4 fase**, masing-masing diakhiri **gerbang (gate)** — kamu (human) menyetujui sebelum lanjut:

```
🟦 Perencanaan → 🟩 Pengerjaan → 🟨 Testing → 🟧 Hardening
   (blueprint)     (coding)        (E2E)        (security+reliability)
       ↑ gate          ↑ gate         ↑ gate         ↑ gate
```

3 hal yang perlu kamu tahu:
- **Work Depth** — atur kedalaman kerja: `fast` (prototype), `standard` (default), `deep` (kritikal). Diset di `project_overview.md`.
- **Gate** — agen BERHENTI minta approval di tiap akhir fase. Tidak ada yang jalan diam-diam.
- **No Silent Changes** — setiap perubahan yang kamu minta otomatis ditulis ke dokumen acuan + agen terkait di-notify.

---

## 2. Alur Pertama Kali (langkah demi langkah)

### Langkah 0 — Tentukan Work Depth
Buka `project_overview.md`, bagian `## 7. Project Settings`:
```
WORK_DEPTH: standard   # fast | standard | deep
```
Mau cepat dulu? Pakai `fast`. Mau matang? `deep`. Bisa diubah kapan saja, atau di-override per pipeline dengan `depth=`.

### Langkah 1 — 🟦 Perencanaan
```
/plan-project "aplikasi booking kapal wisata Labuan Bajo, Next.js, ada payment"
```
**Dimulai dengan Discovery** — agen akan **mewawancaraimu** dulu (tanya-jawab tentang tujuan, pengguna, scope, constraint) supaya rencananya matang. Jawab pertanyaannya; hasilnya `requirements.md`.
Setelah kamu sign-off, barulah Initiator menyusun `project_overview.md`, lalu arsitektur, data model, design system, security standards, dan **spesifikasi + API Contract**.
👉 **Review & setujui di tiap gate.** API Contract harus final sebelum lanjut.

### Langkah 2 — 🟩 Pengerjaan
```
/build-feature "Login dengan email & password"
```
- `depth=standard|deep` → **Backend** & **Frontend** engineer kerja paralel
- `depth=fast` → satu **Fullstack**
Lalu **QA** review kode.
👉 **Review kode di gate.**

### Langkah 3 — 🟨 Testing
```
/test-feature "Login dengan email & password"
```
**Tester** jalankan E2E; kalau gagal **Fixer** perbaiki sampai hijau.
👉 **Approve saat semua test hijau.**

> 💡 Gabung langkah 2+3 sekaligus: `/deliver-feature "Login..."`

> 🖼️ **Opsional — mau laporan ala manual QA dengan bukti screenshot?** Jalankan `/manual-test "Login..."` berdampingan (independen dari `/test-feature`, tidak mengubah gate). **Manual Tester** akan bikin scenario matrix (Normal+Abnormal), eksekusi headful Playwright, screenshot tiap skenario, dan triase temuan gagal sebagai Major/Minor.

### Langkah 4 — 🟧 Hardening + Rilis (per-release)
Setelah beberapa fitur selesai:
```
/release "2.0.0"
```
Menjalankan hardening (security audit + reliability/load test), update CHANGELOG, dan bikin git tag.
👉 **Sign-off siap produksi.**

---

## 3. Daftar Command

Di Codex, command pipeline tersedia sebagai skills eksplisit: `$vasvibe-plan-project`, `$vasvibe-build-feature`, `$vasvibe-test-feature`, dan skill lain yang tampil saat mengetik `$`. Persona bisa dipanggil di percakapan saat ini melalui `$vasvibe-agent-backend`; untuk delegasi pipeline Codex menyediakan custom subagent seperti `vasvibe_backend`.

| Command | Fase | Fungsi |
|---------|------|--------|
| `/plan-project "[ide]"` | 🟦 Perencanaan | Buat semua blueprint/acuan |
| `/setup-workspace [init\|switch\|sync]` | lintas fase | Install skill + MCP untuk tool AI (re-callable saat pindah tool) |
| `/build-feature "[fitur]" [depth=]` | 🟩 Pengerjaan | Implementasi satu fitur |
| `/test-feature "[fitur]"` | 🟨 Testing | E2E test fungsional |
| `/manual-test "[fitur]"` | 🟨 Testing (opsional) | UAT headful: scenario matrix, screenshot, Major/Minor triage |
| `/harden-release "[versi]"` | 🟧 Hardening | Security + reliability audit |
| `/deliver-feature "[fitur]"` | 🟩→🟨 | Build + test sekaligus |
| `/release "[versi]"` | — | Hardening → changelog → tag |
| `/start-fix "[bug]"` | — | Perbaikan bug terarah |
| `/security-audit "[scope]"` | — | Audit keamanan ad-hoc |
| `/daily-standup` | — | Ringkasan progres per fase |

> Bisa juga panggil agen langsung tanpa command, mis. *"pakai agent ux-designer untuk rancang design system"*.

---

## 4. Work Depth — Kapan Pakai Apa

| Level | Untuk | Yang dikerjakan |
|-------|-------|-----------------|
| **fast** | Prototype, MVP, eksplorasi | Inti fitur saja, 1 Fullstack, skip test/hardening opsional |
| **standard** | Produksi normal *(default)* | Backend+Frontend terpisah, full spec, unit test, review |
| **deep** | Fintech, auth, data sensitif | + security standards, full coverage, hardening penuh |

---

## 5. Di Mana Semuanya?

```
project_overview.md              → Setting proyek + WORK_DEPTH
specifications/                  → Requirements, API Contract, user stories
state/                           → Workspace state & knowledge base
  ├── workspace-manifest.json        → Skill + MCP yang diinginkan (Toolsmith)
  ├── context.json                   → Session continuity (status project saat ini)
  ├── agent_handoff.json             → Handoff terakhir antar-agen
  └── knowledge_base/                → Acuan: architecture, data-model, design-system, security, ADR
codes/                           → Source code (Backend/Frontend/Fullstack)
tests/                           → E2E test (Tester) + tests/screenshots/ (Manual Tester)
task/                            → Task list + log per task (termasuk manual_test_report.md)
agent/workflows/                 → Definisi agen (source of truth)
agent/workflows/_shared/         → Phases, work-depth, change-management, git-workflow, state-management
```

**📌 Penting:** `state/workspace-manifest.json` harus approved di Fase 1 setelah tech stack diketahui.
Jangan ganti tool atau sesuaikan skill/MCP tanpa update manifest terlebih dahulu (run `/setup-workspace sync`).

👉 **Dokumentasi lengkap folder `state/`:** Lihat README.md section **📊 Folder `state/`** untuk detail tentang workflow, aturan, dan contoh interaksi antar-agen.

---

## 6. Tips

- **Selalu mulai dari `/plan-project`.** Coding tanpa blueprint = utang.
- **Hormati gate.** Approval-mu di tiap fase yang menjaga kualitas.
- **Minta perubahan kapan saja** — agen wajib mencatatnya ke acuan (No Silent Changes), jadi spec & dokumen tidak akan basi.
- **Mulai `fast`, naik ke `standard`/`deep`** saat fitur makin serius.

Selamat membangun. 🛠️
