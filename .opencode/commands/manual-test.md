---
description: Manual/headful UAT testing dengan Playwright — scenario matrix, screenshot evidence, dan defect triage (Major/Minor). Opsional, berdampingan dengan /test-feature.
---

Jalankan **Manual/Headful UAT Testing** untuk fitur: **$ARGUMENTS**

Langkah:
1. **Manual Tester** → generate scenario matrix (Normal + Abnormal case) per fitur/fungsi, lalu eksekusi headful Playwright dengan screenshot tiap skenario, update Pass/Fail + Severity (Major/Minor) di `task/[TASK-ID]_[nama-task]/manual_test_report.md`.
2. Jika ada temuan **Major** → rekomendasikan **Fixer** untuk memperbaiki, lalu jalankan ulang `/manual-test` untuk retest (iterasi bertambah otomatis, histori iterasi sebelumnya tetap tersimpan).
3. **GATE — UAT hijau:** semua skenario Pass, atau temuan Minor yang tersisa sudah didokumentasikan dan diterima human.

**Catatan integrasi (PENTING):**
- Command ini **independen/opsional** dari `/test-feature` (scripted E2E oleh Tester Agent) — bisa dijalankan berdampingan kapan saja, **tidak mengubah** gate Fase 3 atau alur `/deliver-feature` yang sudah ada.
- Manual Tester **tidak pernah mengubah** `Current Status` di `task/task_list.md` — hanya menambah baris di `Status Logs:`. Ini menjaga state machine Tester/Fixer tetap konsisten walau `/manual-test` dipanggil terpisah.
- Definisi lengkap agent: `agent/workflows/manual-tester.md`.
- Screenshot tersimpan di `tests/screenshots/[TASK-ID]/iteration-[N]/`, laporan (scenario matrix + summary) di `task/[TASK-ID]_[nama-task]/manual_test_report.md`.
- Hormati `WORK_DEPTH` dari `project_overview.md` (override dengan `depth=` di argumen jika ada).
- Jika muncul perubahan scope di tengah pipeline, ikuti `agent/workflows/_shared/change-management.md` (No Silent Changes).
