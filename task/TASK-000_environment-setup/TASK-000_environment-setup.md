# TASK-000 Environment Setup
**Spec:** `specifications/000_spec_environment_setup.md`
**Priority:** P0
**Wave:** W0
**Size:** L
**Assigned To:** Developer Agent
**Dependencies:** None
**Current Status:** ready_to_test

---

## Description
Stack lokal Docker Compose terkunci versi (db, web, worker, migrate, backup, proxy, stt), scaffold Next.js, Drizzle migrasi 31 tabel + seed, worker pg-boss, benchmark AI (bench:ai), dan CI GitHub Actions.

## Acceptance Criteria
- [ ] `docker compose ps` menampilkan db dan web healthy; `GET /api/health` 200, dan 503 `SERVICE_UNAVAILABLE` saat db mati
- [ ] Migrasi menghasilkan >= 31 tabel + skema `pgboss`; role `app_rw` ditolak UPDATE `audit_log` dan DELETE `point_ledger`
- [ ] `db:seed` dua kali menghasilkan tepat 14 `content_sources` tanpa error
- [ ] `docker compose config` tanpa tag `latest`, hanya proxy (dan web di 127.0.0.1) yang mengekspos port
- [ ] CI 6 job hijau; `npm run lint/typecheck/test/build/build:worker` lulus

## Notes
- Diimplementasi oleh DevOps agent (lihat `devops_log.md` di folder ini: deviasi versi paket, jalur A Docker / jalur B Postgres lokal).
- BELUM TERVERIFIKASI (Docker tidak terpasang di mesin ini): build image, `docker compose config/up`, healthcheck, user non-root/read-only rootfs, port binding, build whisper.cpp, SIGTERM worker di Linux, Playwright E2E (browser belum diunduh), eksekusi CI di GitHub, benchmark `bench:ai` (C-09).
- Terverifikasi lokal (jalur B, Postgres lokal): lint/typecheck/test/build/build:worker dan test integrasi DB; `npm audit --omit=dev` 0 temuan (sesuai laporan DevOps).
- Tester wajib memverifikasi AC yang butuh Docker sebelum status `done`; semua task lain bergantung pada task ini.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-03 18:30 | pm agent | task created | - |
| 2026-11-03 18:00 | devops agent | implementation complete | Lihat devops_log.md |
| 2026-11-03 18:30 | pm agent | ready to test | Verifikasi Docker belum dilakukan (Docker tidak terpasang) |
