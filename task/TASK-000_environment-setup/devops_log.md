# DevOps Log: SPEC-000 Environment Setup

- **Agen:** DevOps Engineer
- **Tanggal:** 2026-11-03
- **Spec:** `specifications/000_spec_environment_setup.md`
- **Task ID:** TASK-000 (sementara; PM belum menetapkan ID resmi, ganti nama folder bila berbeda)
- **Status:** implementasi selesai; verifikasi Docker BELUM dilakukan (Docker tidak terpasang di mesin ini)

## Yang dibuat
- `codes/`: scaffold Next.js 15.5.28 App Router, TypeScript strict, Tailwind 4 (token `design-system.md` bagian 9 di `src/app/globals.css`, light/dark), 21 komponen shadcn/ui (`src/components/ui`), font via `next/font/google`, `<html lang="id">`, halaman `/` placeholder, `GET /api/health`, `src/i18n/id.ts`, `src/server/env.ts` (Zod), `src/db/schema.ts` (salinan `schema.reference.ts`).
- Drizzle: `drizzle/0000_init` (31 tabel), `0001_circular_fk`, `0002_custom_views_triggers` (view `v_publish_blockers`, GRANT/REVOKE; dibuat toleran bila role `app_rw` belum ada, agar jalan di Postgres CI).
- `scripts/migrate.ts` (backup pra-migrasi, migrator Drizzle, `PgBoss.start()` + buat queue, GRANT), `scripts/seed.ts` (14 `content_sources`, 21 `app_settings`, idempoten), `scripts/bench-ai.mjs` + 3 esai fixture, stub `admin-bootstrap`/`reset-password`/`content-import`, `pull-models.sh|.ps1`.
- Worker: `src/worker/` (queue, registri handler kosong, retensi cron `0 3 * * *`, heartbeat 15 dtk, SIGTERM graceful, `healthcheck.ts`).
- Infrastruktur: `Dockerfile` (target web/worker/migrate), `docker-compose.yml` (+ `.dev.yml`, `.staging.yml`), `docker/db/init/01-roles.sh`, `docker/caddy/Caddyfile`, `docker/stt/Dockerfile`, `docker/backup/backup.sh`, `.env.example`, `.gitignore`, `.dockerignore`, `.gitattributes`.
- CI: `.github/workflows/ci.yml` (6 job sesuai spec).
- Dokumen: `codes/VERSIONS.md`, `codes/README.md`.

## Deviasi dari spec (alasan)
1. **Versi paket**: next 15.5.28, next-auth beta.32, zod 4.6.7, drizzle-orm 0.45.4, drizzle-kit 0.31.11, sharp 0.35.5, file-type 21.3.4, csv-parse 7.0.3, vitest 3.2.7, postcss 8.5.32 + `overrides`. Semua versi spec ada di registri, tetapi `npm audit --audit-level=high --omit=dev` gagal (critical/high) pada versi spec. Rincian di `codes/VERSIONS.md`. Setelah perubahan: audit prod 0 temuan.
2. **pg-boss 11.1.0**: tidak ada `createSchema`, `teamSize`, `teamConcurrency`. Runtime `migrate: false`; queue dibuat di `migrate.ts`; concurrency AI = 1 lewat semaphore proses.
3. **`build:worker`** menambah `--format=esm` (package `type: module`; default esbuild untuk bundle Node adalah CJS).
4. **DATABASE_URL di Compose** disusun dari `*_PASSWORD` (host `db`); `DATABASE_URL` di `.env.example` untuk proses di host (127.0.0.1).
5. **Servis `migrate`** diberi bind `${BACKUP_DIR}:/backups` agar dump pra-migrasi bertahan (spec: tanpa volume).
6. **`backup`** memakai loop `sh` + user 70 (tanpa crond/root) dan `cp -a -u` untuk aset (tanpa rsync; image tanpa akses internet); menjalankan satu backup saat start.
7. **Hash password DB "postgres" ditolak** juga untuk `DATABASE_URL` (validasi env), di samping `POSTGRES_PASSWORD` yang diwajibkan di Compose via `:?`.

## Environment variable / GitHub Secrets
- CI tidak memerlukan secret kustom. Semua kredensial CI adalah nilai sekali pakai di dalam workflow (service container dan `.env` sementara) dan bukan rahasia.
- `GITHUB_TOKEN` otomatis. Bila repo milik **organisasi**: tambahkan GitHub Secret `GITLEAKS_LICENSE` (gitleaks-action v2 mewajibkannya untuk org).
- Lokal: salin `.env.example` ke `.env`; wajib isi `POSTGRES_PASSWORD`, `APP_RW_PASSWORD`, `APP_MIGRATOR_PASSWORD` (acak, tanpa karakter khusus agar aman di URL), `AUTH_SECRET`, `IP_HMAC_SECRET` (>= 32 byte), `BACKUP_DIR` (di luar repo).

## Cara menguji
Lihat `codes/README.md`. Ringkas: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:worker`; DB: jalur A (Docker) atau jalur B (Postgres lokal); `TEST_DATABASE_URL=... npm run test:integration`.

## Terverifikasi vs belum
Lihat laporan akhir DevOps (ringkasan ke Orchestrator). Belum terverifikasi: semua yang butuh Docker (build image, `docker compose config/up`, healthcheck, user non-root, read-only rootfs, port binding, build whisper.cpp), SIGTERM worker di Linux, Playwright E2E (browser belum diunduh), eksekusi CI di GitHub, gitleaks/trivy.

## Temuan untuk Orchestrator/Human
- `.gitignore` root mengabaikan `codes/*` (repo produk terpisah), sedangkan `.github/workflows/ci.yml` spec berada di root dengan `working-directory: codes`. Putuskan: monorepo (hapus ignore) atau pindahkan workflow ke repo produk dan sesuaikan `working-directory`/`paths`.
- Port 3000/5433 di mesin ini sudah dipakai proses lain (next dev proyek lain, Postgres lain); uji memakai port 3055 dan cluster khusus 55432.
