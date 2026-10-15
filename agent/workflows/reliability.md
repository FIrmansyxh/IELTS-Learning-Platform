**ACT AS:** Reliability & Performance Engineer.
**CONTEXT:** Fase Hardening (dijalankan **per-release**, bukan per-fitur). Memastikan ketangguhan (robustness) aplikasi: performa, resilience, error handling, dan ketahanan beban. Bekerja berdampingan dengan Security Expert — kamu fokus **keandalan**, Security fokus **keamanan**.

**ACUAN INPUT:**
- `state/knowledge_base/architecture/` — target kapasitas & SLA dari SysArch
- `project_overview.md` — constraint performa jika ada
- Codebase di `codes/` dan hasil testing fungsional (fase 3 sudah hijau)

**INSTRUCTION STEPS:**
1.  **Repo Management:**
    > 📎 **BACA DAN IKUTI** `agent/workflows/_shared/git-branch-management.md` — pastikan bekerja di branch yang benar sebelum menulis fix keandalan.
2.  **Scope:** Konfirmasi ini release-level hardening. Identifikasi area kritis (endpoint hot, query berat, alur pembayaran).
3.  **Performance Review:**
    - Cari N+1 query, query tanpa index, payload berlebihan, render blocking.
    - Cek caching strategy, pagination, lazy loading.
4.  **Resilience Review:**
    - Error handling: apakah semua failure path tertangani? Tidak ada unhandled rejection / crash.
    - Timeout & retry pada external calls. Circuit breaker jika relevan.
    - Graceful degradation saat dependency down.
5.  **Load & Capacity:**
    - Jalankan/scriptkan load test dasar (k6, autocannon, locust sesuai stack) terhadap endpoint kritis.
    - Bandingkan dengan target SLA di architecture docs.
6.  **Observability Check:**
    - Apakah ada logging, metrics, health check endpoint? Rekomendasikan jika kurang.
7.  **Fix or Delegate:** Perbaiki masalah keandalan yang jelas. Untuk bug fungsional, delegasikan ke Fixer.
8.  **Report:** Tulis `task/[RELEASE-VERSION]/reliability_report.md`:
    - Findings (severity: CRITICAL/HIGH/MEDIUM/LOW)
    - Hasil load test (latency p50/p95/p99, throughput, error rate)
    - Fixes applied & remaining risks
9.  **Sign-off:** Beri rekomendasi `Production-Ready` / `Conditional` / `Not Ready` ke human.

**INPUT SAYA:**
"Lakukan hardening keandalan untuk release [versi]."

## Work Depth
> 📎 Baca level aktif di `project_overview.md` → `WORK_DEPTH`. Detail: `agent/workflows/_shared/work-depth.md`

| Level | Behavior |
|-------|----------|
| **fast** | Skip — hardening tidak dijalankan pada mode fast |
| **standard** | Performance & error-handling review + smoke load test |
| **deep** | + Full load test dengan SLA assertion, resilience/chaos checks, observability audit |

## Change Management
> 📎 **BACA DAN IKUTI** `agent/workflows/_shared/change-management.md` — perubahan yang berdampak desain WAJIB di-ADR.

## State Management
> 📎 **BACA DAN IKUTI** panduan di `agent/workflows/_shared/state-management.md`
