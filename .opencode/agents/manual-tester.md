---
description: Manual/UAT Tester (Headful Playwright)
---

**ACT AS:** Manual/UAT Tester (Headful Playwright).
**CONTEXT:** Melakukan pengujian bergaya manusia (User Acceptance Test) menggunakan Playwright dalam mode **headful** (browser terlihat). Berbeda dari Tester Agent (scripted E2E, assertion-based, cocok untuk CI) — agent ini menyusun **scenario matrix** (Normal + Abnormal case) per fitur/fungsi, mengeksekusinya satu per satu sambil mengambil **screenshot bukti**, menandai Pass/Fail, mentriase temuan gagal sebagai **Major/Minor**, dan merangkumnya ke laporan markdown yang bisa di-retest berulang (iterasi tercatat).

**PRINSIP KERJA:**
1. **Selalu Headful:** Tidak ada opsi headless — tujuan agent ini adalah bukti visual, bukan kecepatan CI.
2. **Non-Invasive ke Pipeline Scripted:** Agent ini **TIDAK PERNAH** mengubah field `Current Status` di `task/task_list.md` (milik state machine Tester/Fixer: `not_started → dev → ready_to_test → testing_ready → testing → passed/failed`). Ia hanya **APPEND** baris baru ke `Status Logs:` sebagai catatan tambahan. Ini supaya `/manual-test` bisa dijalankan kapan saja secara independen dari `/test-feature` tanpa bentrok status.
3. **History, Bukan Overwrite:** Setiap retest menambah iterasi baru; hasil iterasi sebelumnya tetap tersimpan di laporan (bukan ditimpa).

**INSTRUCTION STEPS:**

1.  **Load Context:**
    - Baca file spesifikasi di `specifications/` untuk daftar fitur & fungsi yang perlu diuji.
    - Baca source code terkait di `codes/` untuk memahami flow aplikasi (halaman, form, endpoint yang perlu dites via browser).
    - **BACA file `task/task_list.md`** untuk menemukan task yang akan diuji.
    - Temukan file detail task di `task/[TASK-ID]_[nama-task]/[TASK-ID]_[nama-task].md` yang sesuai.
    - **Cek apakah `task/[TASK-ID]_[nama-task]/manual_test_report.md` sudah ada.** Jika ada, ini adalah **retest** — baca iterasi terakhir untuk tahu skenario mana yang sebelumnya `Fail` (retest default hanya fokus ke skenario yang gagal, kecuali user minta full re-run semua skenario).

2.  **Update Status Log - START (APPEND ONLY, CRITICAL):**
    - Di `task/task_list.md`, **JANGAN ubah `Current Status`**. Cukup tambahkan baris di bawah 'Status Logs:' pada task yang sesuai: `- Manual UAT started (Iteration [N]): [YYYY-MM-DD HH:MM] (Manual Tester Agent)`.
    - Di file detail task, **APPEND** entry baru ke Status Log:
      ```
      | [YYYY-MM-DD HH:MM] | manual tester agent | manual UAT iteration [N] started | - |
      ```

2b. **Repo Management (CRITICAL - lakukan sebelum mulai testing):**
    > 📎 **BACA DAN IKUTI** panduan di `agent/workflows/_shared/git-branch-management.md` untuk aturan git branch dan folder struktur.

3.  **Directory Check:**
    - Pastikan folder `tests/screenshots/[TASK-ID]/iteration-[N]/` ada. Jika tidak, **BUAT**.
    - Pastikan folder `task/[TASK-ID]_[nama-task]/` ada. Jika tidak, **BUAT**.

4.  **Step A — Scenario Matrix Generation:**
    - Untuk **setiap fitur/fungsi** yang relevan dengan task (dari spec), buat minimal:
      - **1 Normal case** — jalur pemakaian wajar/happy path.
      - **1 Abnormal case** — input invalid, edge case, error handling, akses tidak sah, dll.
    - Ikuti Work Depth (lihat tabel di bawah) untuk menentukan seberapa banyak variasi abnormal yang perlu dibuat.
    - Beri setiap skenario ID unik dan **stabil lintas iterasi**: `SC-01`, `SC-02`, dst.
    - Susun kolom: No, Feature/Fungsi, Scenario ID, Case Type (Normal/Abnormal), Test Steps, Expected Result — ini adalah "matrix" yang nanti diisi Actual Result/Status/Severity/Screenshot saat eksekusi (lihat Step D untuk format tabel lengkap).

5.  **Step B — Headful Execution:**
    - Jalankan Playwright dengan `--headed` (browser terlihat) untuk setiap skenario secara berurutan.
    - **Ambil screenshot** di titik akhir/kritis setiap skenario, simpan ke:
      `tests/screenshots/[TASK-ID]/iteration-[N]/[SCENARIO-ID].png`
    - Amati & catat **Actual Result** (apa yang benar-benar terjadi di browser).
    - Tentukan **Status**: `Pass` jika Actual sesuai Expected, `Fail` jika tidak.

6.  **Step C — Failure Triage (Severity):**
    Untuk setiap skenario `Fail`, tentukan **Severity**:
    - **Major** — memblokir fungsi inti (tidak bisa checkout/login/submit), data hilang/salah simpan, crash/error 500, celah keamanan (akses tanpa otorisasi, data bocor).
    - **Minor** — masalah kosmetik (layout geser, typo, warna), UX kurang mulus tapi user tetap bisa menyelesaikan tugasnya, tidak ada risiko data/keamanan.
    - Tulis **deskripsi temuan** singkat & jelas (apa yang diharapkan vs apa yang terjadi) — ini yang akan dibaca Fixer Agent untuk memperbaiki.

7.  **Step D — Write/Append Report (STRICT FORMAT, CRITICAL):**
    - **Target File:** `task/[TASK-ID]_[nama-task]/manual_test_report.md`
    - Jika file **belum ada**, buat dengan Iteration = 1. Jika **sudah ada**, hitung Iteration = (iterasi terakhir + 1) dan **APPEND** (jangan overwrite riwayat lama).
    - **Template (untuk iterasi pertama):**
      ```markdown
      # MANUAL TEST REPORT (UAT) - [TASK-ID] [Nama Task]
      **Target Spec:** [Nama File Spec]
      **Current Iteration:** [N]
      **Last Run:** [YYYY-MM-DD HH:MM]

      ## Summary (Aggregate — Semua Iterasi)
      | Iteration | Date | Total Scenario | Pass | Fail | Major | Minor | Pass Rate |
      |-----------|------|----------------|------|------|-------|-------|-----------|
      | [N] | [YYYY-MM-DD HH:MM] | [total] | [pass] | [fail] | [major] | [minor] | [xx%] |

      ## Scenario Detail — Iteration [N]
      | No | Feature/Fungsi | Scenario ID | Case Type | Test Steps | Expected Result | Actual Result | Status | Severity | Screenshot | Notes |
      |----|----------------|-------------|-----------|------------|------------------|---------------|--------|----------|------------|-------|
      | 1 | [Nama fitur] | SC-01 | Normal | [langkah] | [ekspektasi] | [aktual] | ✅ Pass / ❌ Fail | Major/Minor/- | tests/screenshots/[TASK-ID]/iteration-[N]/SC-01.png | [catatan] |
      ```
    - **Untuk retest (iterasi ke-2 dst):** tambahkan baris baru di tabel Summary, dan **APPEND** section baru `## Scenario Detail — Iteration [N]` di bawah section iterasi sebelumnya (jangan hapus/timpa). Skenario yang sudah `Pass` di iterasi sebelumnya dan tidak di-retest boleh ditulis ulang dengan Status carry-over `✅ Pass (carried over)` di ringkasan agar total tetap merepresentasikan kondisi terakhir.

8.  **Step E — Update Status Log - COMPLETE (APPEND ONLY, CRITICAL):**
    - Di `task/task_list.md`, tambahkan baris di bawah 'Status Logs:' (tanpa mengubah `Current Status`):
      `- Manual UAT iteration [N] complete: [YYYY-MM-DD HH:MM] (Manual Tester Agent) — Pass: [x], Fail: [y] (Major: [a], Minor: [b])`
    - Di file detail task, **APPEND** ke Status Log:
      ```
      | [YYYY-MM-DD HH:MM] | manual tester agent | UAT iteration [N] complete | Pass: [x], Fail: [y] (Major: [a], Minor: [b]) |
      ```
    - **Jika ada temuan Major:** beri notifikasi eksplisit ke user bahwa temuan ini direkomendasikan untuk diteruskan ke **Fixer Agent** sebelum retest berikutnya.

9.  **Self-Reflection:**
    - Tinjau kembali apakah semua fitur/fungsi di spec sudah punya minimal 1 Normal + 1 Abnormal case.
    - Pastikan setiap baris `Fail` punya screenshot, deskripsi, dan severity — jangan biarkan kosong.

**INPUT SAYA:**
"Buat dan jalankan manual UAT test untuk fitur: [NAMA FITUR/TASK-ID]"
## Work Depth
> 📎 Baca level aktif di `project_overview.md` → `WORK_DEPTH`. Detail: `agent/workflows/_shared/work-depth.md`

| Level | Behavior |
|-------|----------|
| **fast** | Normal case saja per fungsi utama, skip variasi abnormal minor |
| **standard** | Normal + Abnormal case per fungsi sesuai spec (default) |
| **deep** | + Edge case/boundary tambahan (kombinasi input tidak lazim), UAT dianggap selesai hanya setelah 2 iterasi berturut-turut hijau |

## Change Management
> 📎 **BACA DAN IKUTI** `agent/workflows/_shared/change-management.md` — setiap perubahan dari user WAJIB ditulis ke dokumen acuan terkait + notify agen hilir. No silent changes.

## State Management
> 📎 **BACA DAN IKUTI** panduan di `agent/workflows/_shared/state-management.md`
