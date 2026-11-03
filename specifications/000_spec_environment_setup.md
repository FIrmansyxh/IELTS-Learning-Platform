# SPEC-000: Environment Setup (Docker Compose, Scaffold, Tooling, CI, Benchmark AI)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** None
- **Prioritas:** P0 (blocker semua spec lain)
- **Pemilik utama:** DevOps Engineer (compose, Dockerfile, CI) + Backend Engineer (scaffold app, skrip DB) + Frontend Engineer (tema/token)

## User Story
Sebagai Developer (pemilik proyek yang juga Admin), saya ingin satu perintah (`docker compose up`) menyalakan seluruh stack lokal (Postgres 16, web Next.js, worker pg-boss, opsional STT/MinIO/proxy) dengan versi terkunci dan skrip benchmark AI, sehingga semua fitur berikutnya dapat dibangun, diuji, dan dijalankan secara reproduktif di satu mesin tanpa biaya.

## Non-Goals / Out of Scope
- Tidak membuat fitur bisnis apa pun (auth, kurikulum, dst.). Hanya fondasi: scaffold, DB, migrasi baseline, worker kosong, CI, benchmark.
- Tidak menjalankan Ollama sebagai container secara default (ADR-003 #8: Ollama native di host). Profil `ollama-container` hanya opsi.
- Tidak mengunci model LLM/STT final (ADR-002). Model dikonfigurasi lewat env; pemilihan final memakai hasil `bench:ai`.
- Tidak ada deployment cloud, Kubernetes, Redis, Prometheus/Grafana.
- Tidak ada lingkungan staging terpisah selain stack Compose kedua (`-p ielts-stg`) di mesin yang sama.
- Tidak mengonfigurasi Tailscale/Cloudflare Tunnel (hanya profil `proxy` Caddy).
- Tidak ada PWA/offline.

## Keputusan Terkunci (dari ADR-001/002/003, tidak boleh diubah di fase implementasi)
| Topik | Nilai |
|---|---|
| Runtime | Node.js 22 (image `node:22.20.0-alpine3.22`) |
| Framework | Next.js 15 App Router (15.5.x), React 19, TypeScript 5.9 strict |
| UI | Tailwind CSS 4 + shadcn/ui, token dari `design-system.md` bagian 9 |
| DB | PostgreSQL 16 (`postgres:16.10-alpine`), Drizzle ORM + drizzle-kit |
| Auth | Auth.js (next-auth v5) Credentials, strategi JWT, `@node-rs/argon2` (argon2id) |
| Antrean | pg-boss (skema `pgboss` di DB yang sama), concurrency queue AI = 1 |
| AI | Ollama native di host (URL via env), whisper.cpp server (service `stt`, profil `ai`) |
| Storage | `StorageDriver` `fs` (default) dan `s3` (MinIO, profil `minio`) |
| Test | Vitest (unit + integration), Playwright (E2E), Testcontainers atau service container CI |
| CI | GitHub Actions |
| Bahasa app | UI `id`, materi `en`; kamus string tunggal `src/i18n/id.ts` |

## Technical Flow
1. Developer meng-clone repo dan menyalin `codes/.env.example` menjadi `codes/.env`, lalu mengisi nilai rahasia (lihat tabel env).
2. Developer menjalankan `docker compose -f codes/docker-compose.yml up -d db`; Postgres menjalankan `docker/db/init/01-roles.sh` yang membuat role `app_rw` dan `app_migrator`.
3. Developer menjalankan `docker compose -f codes/docker-compose.yml run --rm migrate`; langkah ini menjalankan migrasi Drizzle (`0000_init`, `0001_circular_fk`, `0002_custom_views_triggers`) memakai `app_migrator`, lalu menjalankan `PgBoss.start()` sekali untuk membuat skema `pgboss`, lalu memberi `GRANT` pada `app_rw`.
4. Developer menjalankan `docker compose -f codes/docker-compose.yml run --rm migrate npm run db:seed`; seeder menulis `content_sources`, `app_settings` default (SPEC-002 bagian 8 `_api-contract.md`), dan modul seed yang terdaftar (kosong pada SPEC-000; SPEC-003/004/009/012/013 menambahkan modul).
5. Developer menjalankan `docker compose -f codes/docker-compose.yml up -d web worker`; Compose menunggu `db` healthy dan `migrate` selesai sukses.
6. Docker menjalankan healthcheck `web` ke `GET /api/health`; respons 200 menandakan siap.
7. Developer (opsional) menjalankan profil `ai` dengan `--profile ai up -d stt` dan menyalakan Ollama native di host pada `127.0.0.1:11434`.
8. Developer menjalankan `npm run bench:ai` di `codes/` untuk mengukur kandidat model (lihat bagian Skrip Benchmark).
9. Pada setiap push/PR, GitHub Actions menjalankan workflow `.github/workflows/ci.yml` (lihat bagian CI).

## Struktur Direktori (WAJIB, root aplikasi = `codes/`)
```
codes/
  package.json  package-lock.json  tsconfig.json  next.config.ts  drizzle.config.ts
  vitest.config.ts  vitest.integration.config.ts  playwright.config.ts  eslint.config.mjs
  .env.example  .dockerignore  .gitignore  VERSIONS.md
  Dockerfile  docker-compose.yml  docker-compose.dev.yml  docker-compose.staging.yml
  docker/db/init/01-roles.sh   docker/caddy/Caddyfile   docker/stt/Dockerfile   docker/backup/backup.sh
  drizzle/                        # SQL migrasi (di-commit)
  scripts/ migrate.ts seed.ts admin-bootstrap.ts reset-password.ts content-import.ts bench-ai.mjs bench/
  src/app/                        # Next.js App Router (route handler di src/app/api/**)
  src/server/                     # service, repository, auth guard, ai, storage, gatekeeping
  src/worker/                     # entry worker pg-boss (index.ts, healthcheck.ts)
  src/db/schema.ts                # salinan dari state/knowledge_base/data-model/schema.reference.ts
  src/contracts/                  # skema Zod DTO (satu file per spec, lihat _api-contract.md)
  src/components/ui/              # shadcn/ui
  src/i18n/id.ts
  tests/unit  tests/integration  tests/e2e  tests/security  tests/fixtures
content/golden-sample/            # ditambahkan SPEC-004 (di root repo, bukan codes/)
```

## Versi Terkunci
Aturan: semua dependensi dipasang dengan `npm install --save-exact`; `package-lock.json` di-commit; image Compose memakai tag eksplisit (tanpa `latest`). Jika sebuah versi di bawah tidak ada di registry saat scaffold, DevOps memakai patch tertinggi pada minor yang sama yang lolos `npm audit --audit-level=high`, lalu mencatat versi aktual dan digest image di `codes/VERSIONS.md` (file wajib, tabel: komponen, versi, tanggal verifikasi). Next.js WAJIB pada patch yang mencakup perbaikan advisory RSC (minimum 15.5.9).

| Komponen | Versi |
|---|---|
| node | 22.20.0 |
| typescript | 5.9.3 |
| next | 15.5.9 |
| react, react-dom | 19.2.3 |
| next-auth | 5.0.0-beta.29 |
| @node-rs/argon2 | 2.0.2 |
| drizzle-orm | 0.44.7 |
| drizzle-kit | 0.31.6 |
| pg, @types/pg | 8.16.3, 8.15.6 |
| pg-boss | 11.1.0 |
| zod | 4.1.12 |
| tailwindcss, @tailwindcss/postcss | 4.1.17 |
| shadcn (CLI) | 3.4.0 |
| lucide-react | 0.546.0 |
| @tanstack/react-query | 5.90.5 |
| zustand | 5.0.8 |
| react-hook-form, @hookform/resolvers | 7.65.0, 5.2.2 |
| react-markdown, remark-gfm, remark-directive | 10.1.0, 4.0.1, 4.0.0 |
| recharts | 3.3.0 |
| @dnd-kit/core, @dnd-kit/sortable | 6.3.1, 10.0.0 |
| embla-carousel-react | 8.6.0 |
| sharp | 0.34.4 |
| file-type | 21.0.0 |
| csv-parse | 6.1.0 |
| pino | 9.14.0 |
| tsx, esbuild | 4.20.6, 0.25.11 |
| vitest, @vitest/coverage-v8 | 3.2.4 |
| @testing-library/react, @testing-library/jest-dom | 16.3.0, 6.9.1 |
| @playwright/test | 1.56.1 |
| testcontainers, @testcontainers/postgresql | 11.7.1 |
| eslint, eslint-config-next | 9.37.0, 15.5.9 |
| eslint-plugin-security | 3.0.1 |
| prettier | 3.6.2 |
| Image `db` | `postgres:16.10-alpine` |
| Image `proxy` | `caddy:2.10.2-alpine` |
| Image `minio` | `minio/minio:RELEASE.2025-04-22T22-12-26Z` |
| Image `ollama` (profil `ollama-container`) | `ollama/ollama:0.12.11` |
| whisper.cpp (dibangun dari sumber di `docker/stt/Dockerfile`) | git tag `v1.7.6`, binary `whisper-server` |
| Action GitHub | `actions/checkout@v4.2.2`, `actions/setup-node@v4.4.0`, `actions/upload-artifact@v4.6.2`, `gitleaks/gitleaks-action@v2.3.9`, `aquasecurity/trivy-action@0.33.1` |

## Daftar Servis Compose (`codes/docker-compose.yml`)
| Servis | Image/Build | Port host | Volume | Profil | Batas | Healthcheck |
|---|---|---|---|---|---|---|
| `db` | `postgres:16.10-alpine` | tidak ada (dev: `127.0.0.1:5432` via `docker-compose.dev.yml`) | `pgdata:/var/lib/postgresql/data`, bind `./docker/db/init:/docker-entrypoint-initdb.d:ro` | default | `mem_limit: 1536m`, `shared_buffers=256MB`, `max_connections=50` | `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` tiap 5 dtk, 10 retry |
| `migrate` | build `Dockerfile` target `migrate` | tidak ada | tidak ada | default | `restart: "no"` | exit code 0 |
| `web` | build target `web` (Next `output: standalone`, berisi `ffprobe` untuk unggah aset admin) | `127.0.0.1:3000:3000` | `assets:/data/assets` (rw) | default | `mem_limit: 1g` | `wget -qO- http://127.0.0.1:3000/api/health` tiap 15 dtk |
| `worker` | build target `worker` (esbuild bundle, berisi ffmpeg) | tidak ada | `assets:/data/assets` (rw) | default | `mem_limit: 768m` | `node dist/healthcheck.js` (heartbeat file `/tmp/worker.heartbeat` lebih baru dari 60 dtk) |
| `stt` | build `docker/stt/Dockerfile` (whisper.cpp v1.7.6) | tidak ada | `whisper_models:/models` | `ai` | `mem_limit: 1536m` | `wget -qO- http://127.0.0.1:8080/` |
| `ollama` | `ollama/ollama:0.12.11` | tidak ada | `ollama_models:/root/.ollama` | `ollama-container` | tanpa batas keras | `ollama list` |
| `minio` | `minio/minio:RELEASE.2025-04-22T22-12-26Z` | tidak ada | `minio_data:/data` | `minio` | `mem_limit: 512m` | `mc ready local` |
| `proxy` | `caddy:2.10.2-alpine` | `80:80`, `443:443` | `caddy_data`, `caddy_config`, bind `./docker/caddy/Caddyfile:ro` | `proxy` | `mem_limit: 128m` | `wget -qO- http://127.0.0.1:2019/config/` |
| `backup` | `postgres:16.10-alpine` + `docker/backup/backup.sh` (cron 02:00) | tidak ada | `${BACKUP_DIR}:/backups`, `assets:/data/assets:ro` | default | `mem_limit: 128m` | file `/backups/.last_ok` lebih baru dari 26 jam |

Aturan semua servis aplikasi (`web`, `worker`, `migrate`, `stt`, `backup`): `user` non-root (UID 1000 untuk Node), `cap_drop: [ALL]`, `security_opt: ["no-new-privileges:true"]`, `restart: unless-stopped` (kecuali `migrate`), `pids_limit: 256`, `logging: json-file` dengan `max-size: 10m` dan `max-file: 3`. `web` dan `worker` memakai `read_only: true` dengan `tmpfs: /tmp` dan `tmpfs: /app/.next/cache`. Dilarang `privileged`, `network_mode: host`, mount `/var/run/docker.sock`.

**Dependensi start:** `migrate` menunggu `db` `service_healthy`; `web` dan `worker` menunggu `migrate` `service_completed_successfully`. `worker` tidak bergantung pada `stt`/`ollama`.

## Networking
- `app-net`: bridge dengan `internal: true`. Anggota: `db`, `migrate`, `web`, `worker`, `stt`, `ollama`, `minio`, `backup`. Tidak ada rute keluar ke internet.
- `edge-net`: bridge biasa. Anggota: `web` (agar port dapat dipublikasikan), `worker` (agar dapat menjangkau `host.docker.internal:11434` untuk Ollama native), `proxy`.
- `db` hanya di `app-net`. `docker-compose.dev.yml` menambahkan `db` ke `edge-net` dan `ports: ["127.0.0.1:5432:5432"]`.
- Alamat internal: `DATABASE_URL` memakai host `db`; `STT_BASE_URL=http://stt:8080`; Ollama native `OLLAMA_BASE_URL=http://host.docker.internal:11434` (worker memakai `extra_hosts: ["host.docker.internal:host-gateway"]`); `S3_ENDPOINT=http://minio:9000`.
- Hanya `proxy` (produksi) atau `web` pada `127.0.0.1:3000` (dev) yang mempublikasikan port. Ollama native WAJIB bind `127.0.0.1` dan firewall Windows memblokir 11434 dari luar loopback.
- Unduhan model (Ollama `ollama pull`, whisper `ggml-*.bin`) dilakukan manual lewat skrip `scripts/pull-models.sh|.ps1` di host, bukan oleh container runtime.

## Persistence (strategi volume)
| Volume | Isi | Backup |
|---|---|---|
| `pgdata` | data Postgres (termasuk skema `pgboss`) | `pg_dump` harian oleh `backup` |
| `assets` | `/data/assets/public/**` (slide, dokumen, audio listening) dan `/data/assets/private/**` (rekaman Speaking, file impor), izin direktori `private` = `0700` | salinan incremental `rsync` ke `/backups/assets` |
| `whisper_models`, `ollama_models` | bobot model | tidak dicadangkan |
| `minio_data` | hanya bila `STORAGE_DRIVER=s3` | di luar cakupan |
| `caddy_data`, `caddy_config` | sertifikat TLS | tidak dicadangkan |
| bind `${BACKUP_DIR}` | `daily/` (14), `weekly/` (8) berisi `*.dump`, `assets/` | lokasi di luar repo, di-`.gitignore` bila di dalam repo |

`backup.sh`: harian 02:00 `pg_dump -Fc` ke `daily/YYYY-MM-DD.dump`, Minggu menyalin ke `weekly/`, menghapus `daily` lebih dari 14 file dan `weekly` lebih dari 8 file, menulis `/backups/.last_ok`.

## Variabel Lingkungan (`codes/.env.example`, tanpa nilai nyata)
Aturan: `.env` di `.gitignore`; `.env.example` hanya berisi nama + contoh non-rahasia; tidak ada `NEXT_PUBLIC_*` untuk rahasia. Tabel "Sumber kebenaran" menjelaskan nilai yang juga ada di `app_settings`.

| Key | Dipakai oleh | Contoh nilai | Wajib | Catatan |
|---|---|---|---|---|
| `NODE_ENV` | web, worker | `production` | ya | `development`/`test` untuk lokal/CI |
| `LOG_LEVEL` | web, worker | `info` | tidak (default `info`) | pino |
| `APP_TIMEZONE` | web, worker | `Asia/Jakarta` | tidak (default `Asia/Jakarta`) | batas hari untuk streak harian dan kuota harian |
| `POSTGRES_DB` | db | `ielts` | ya | |
| `POSTGRES_USER` | db | `postgres_admin` | ya | superuser hanya untuk init |
| `POSTGRES_PASSWORD` | db | (acak >= 24 karakter) | ya | bukan `postgres` |
| `APP_RW_PASSWORD` | db init, web, worker | (acak >= 24) | ya | role `app_rw` |
| `APP_MIGRATOR_PASSWORD` | db init, migrate | (acak >= 24) | ya | role `app_migrator` |
| `DATABASE_URL` | web, worker | `postgres://app_rw:<pw>@db:5432/ielts` | ya | runtime |
| `DATABASE_MIGRATOR_URL` | migrate, scripts | `postgres://app_migrator:<pw>@db:5432/ielts` | ya | DDL |
| `TEST_DATABASE_URL` | integration test | `postgres://postgres:postgres@127.0.0.1:5433/ielts_test` | tidak | bila kosong, Testcontainers dipakai |
| `AUTH_SECRET` | web | (acak >= 32 byte, base64) | ya | rotasi = semua sesi keluar |
| `AUTH_URL` | web | `http://localhost:3000` | ya | host publik bila lewat proxy |
| `AUTH_TRUST_HOST` | web | `true` | tidak | hanya di belakang Caddy |
| `ALLOWED_HOSTS` | web, proxy | `localhost:3000` | ya | daftar host dipisah koma; Host lain ditolak 400 |
| `IP_HMAC_SECRET` | web, worker | (acak >= 32 byte) | ya | HMAC `audit_log.ip_hash` |
| `ADMIN_EMAIL` | `admin:bootstrap` | `owner@example.test` | ya saat bootstrap | |
| `ADMIN_INITIAL_PASSWORD` | `admin:bootstrap` | (acak >= 16) | ya saat bootstrap | dibaca sekali, wajib ganti saat login pertama |
| `SIGNUP_MODE` | `db:seed` | `invite` | tidak (default `invite`) | HANYA nilai awal `app_settings.signup.mode` |
| `ASSETS_DIR` | web, worker | `/data/assets` | ya | |
| `STORAGE_DRIVER` | web, worker | `fs` | tidak (default `fs`) | `fs` atau `s3` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | web, worker | `http://minio:9000`, `ielts-assets`, `us-east-1` | hanya bila `s3` | |
| `UPLOAD_MAX_MB_RECORDING` | web | `10` | tidak (default 10) | batas keras (security 4.2) |
| `UPLOAD_MAX_MB_AUDIO_ASSET` | web | `50` | tidak (default 50) | |
| `UPLOAD_MAX_MB_IMAGE` | web | `5` | tidak (default 5) | |
| `UPLOAD_MAX_MB_DOCUMENT` | web | `25` | tidak (default 25) | |
| `UPLOAD_MAX_MB_IMPORT` | web | `5` | tidak (default 5) | |
| `AI_ENABLED` | web, worker | `true` | tidak (default `false`) | kill-switch; `false` = self-assessment |
| `LLM_DRIVER` | worker | `ollama` | tidak (default `ollama`) | `mock` untuk CI/dev tanpa GPU |
| `OLLAMA_BASE_URL` | worker | `http://host.docker.internal:11434` | bila `ollama` | |
| `OLLAMA_MODEL_WRITING` | worker | `qwen2.5:3b-instruct` | bila AI | dikunci setelah `bench:ai` (ADR-002) |
| `OLLAMA_MODEL_SPEAKING` | worker | `qwen2.5:3b-instruct` | bila AI | |
| `OLLAMA_KEEP_ALIVE` | worker | `5m` | tidak | |
| `STT_DRIVER` | worker | `whisper` | tidak (default `whisper`) | `mock` untuk CI/dev |
| `STT_BASE_URL` | worker | `http://stt:8080` | bila `whisper` | |
| `STT_MODEL` | stt | `base` | bila AI | `base` atau `small` (file `ggml-<model>.bin`) |
| `AI_JOB_TIMEOUT_SEC` | worker | `180` | tidak (default 180) | |
| `AI_NUM_PREDICT` | worker | `1500` | tidak (default 1500) | batas token keluaran |
| `AI_DAILY_LIMIT_PER_USER` | `db:seed` | `10` | tidak | HANYA nilai awal `app_settings.ai.daily_limit_per_user` |
| `AUDIO_RETENTION_DAYS` | `db:seed` | `90` | tidak | HANYA nilai awal `app_settings.retention.audio_days` |
| `BACKUP_DIR` | backup | `D:/ielts-backups` | ya | di luar repo |

**Sumber kebenaran runtime:** untuk `signup.mode`, `ai.daily_limit_per_user`, `retention.audio_days` nilai di `app_settings` (dapat diubah admin) yang berlaku; env hanya menyemai baris awal pada `db:seed` pertama (tidak menimpa baris yang sudah ada).

## Skrip npm (WAJIB ada di `codes/package.json`)
| Skrip | Perintah | Perilaku |
|---|---|---|
| `dev` | `next dev --turbopack -H 127.0.0.1 -p 3000` | |
| `build` | `next build` | `output: standalone` |
| `start` | `node .next/standalone/server.js` | |
| `build:worker` | `esbuild src/worker/index.ts src/worker/healthcheck.ts --bundle --platform=node --target=node22 --outdir=dist --packages=external` | |
| `worker:dev` | `tsx watch src/worker/index.ts` | |
| `worker:start` | `node dist/index.js` | |
| `lint` | `eslint . --max-warnings=0` | aturan keamanan aktif |
| `typecheck` | `tsc --noEmit` | |
| `test` | `vitest run` | unit |
| `test:integration` | `vitest run -c vitest.integration.config.ts` | |
| `test:e2e` | `playwright test` | |
| `db:generate` | `drizzle-kit generate` | |
| `db:migrate` | `tsx scripts/migrate.ts` | |
| `db:seed` | `tsx scripts/seed.ts` | idempoten |
| `admin:bootstrap` | `tsx scripts/admin-bootstrap.ts` | SPEC-001 |
| `user:reset-password` | `tsx scripts/reset-password.ts --email <email>` | SPEC-002 |
| `content:validate` | `tsx scripts/content-import.ts validate --dir <path>` | SPEC-004 |
| `content:import` | `tsx scripts/content-import.ts import --dir <path> [--publish] [--dry-run]` | SPEC-004 |
| `bench:ai` | `node scripts/bench-ai.mjs` | bagian Skrip Benchmark |
| `format` | `prettier --write .` | |

## Migrasi Baseline & Konfigurasi Drizzle
- `src/db/schema.ts` = salinan `state/knowledge_base/data-model/schema.reference.ts` TANPA perubahan nama. Delta skema ditambahkan oleh spec masing-masing sebagai migrasi baru (daftar di `_api-contract.md` bagian 9).
- `drizzle.config.ts`: `dialect: 'postgresql'`, `schema: './src/db/schema.ts'`, `out: './drizzle'`, `schemaFilter: ['public']`, `dbCredentials.url = DATABASE_MIGRATOR_URL`.
- `0000_init` = hasil `drizzle-kit generate` (semua 31 tabel, tanpa FK melingkar). `0001_circular_fk` = SQL: FK `user_last_learned_state.active_attempt_id -> attempts.id ON DELETE SET NULL` dan `async_jobs.import_batch_id -> import_batches.id ON DELETE SET NULL`. `0002_custom_views_triggers` (diberi komentar `-- custom`): view `v_publish_blockers`, `REVOKE UPDATE, DELETE ON audit_log, point_ledger FROM app_rw`, `GRANT SELECT, INSERT, UPDATE, DELETE` pada tabel lain ke `app_rw`.
- View `v_publish_blockers` kolom: `entity_type text`, `entity_id uuid`, `reason_code text` (`ASSET_UNVERIFIED` | `SOURCE_MISSING`), `detail text`. Baris dihasilkan untuk (a) setiap `asset_id` yang dirujuk `learning_materials.videos_json|slides_json|attachments_json` atau `assessment_sets.listening_asset_id` dengan `content_assets.rights_status='UNVERIFIED'`; (b) `learning_materials`/`assessment_sets` dengan `origin='OPEN_LICENSED_ADAPTED'` dan `source_id IS NULL`.
- `scripts/migrate.ts` berurutan: (1) backup `pg_dump` bila tabel `users` berisi baris, (2) migrator Drizzle, (3) `new PgBoss({connectionString: DATABASE_MIGRATOR_URL}).start()` lalu `stop()`, (4) `GRANT USAGE ON SCHEMA pgboss TO app_rw; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO app_rw; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO app_rw; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgboss TO app_rw;`. Runtime memakai `new PgBoss({connectionString: DATABASE_URL, migrate: false, createSchema: false})`.
- `scripts/seed.ts` memakai registri modul `seedModules: Array<{name:string; run:(tx)=>Promise<void>}>`; urutan eksekusi = urutan array; semua modul memakai `ON CONFLICT DO NOTHING`. Modul awal SPEC-000: `content_sources` (14 baris dari `data-model.md` 3.11) dan `app_settings` (kunci `_api-contract.md` bagian 8, nilai default tabel itu, kecuali tiga kunci yang disemai dari env).

## Worker (`src/worker/index.ts`)
1. Membuat `PgBoss` runtime, `await boss.start()`.
2. Mendaftarkan queue: `stt-transcribe`, `ai-grade-writing`, `ai-grade-speaking` (ketiganya `teamSize: 1`, `teamConcurrency: 1`, `retryLimit: 2`, `retryDelay: 30`, `retryBackoff: true`, `expireInSeconds: AI_JOB_TIMEOUT_SEC + 60`), `import-validate`, `import-publish` (concurrency 1), `retention-purge`.
3. Handler queue disediakan sebagai registri `jobHandlers: Record<QueueName, Handler>`; SPEC-000 mendaftarkan handler kosong yang mencatat `warn` "handler belum diimplementasikan" lalu menandai job selesai; spec lain mengganti handler.
4. Menjadwalkan `retention-purge` dengan cron `0 3 * * *` zona `APP_TIMEZONE`. Handler menjalankan registri `purgeTasks: Array<{name; run}>`; spec lain menambah tugas.
5. Setiap 15 detik menulis file `/tmp/worker.heartbeat` dan memperbarui baris `app_settings` kunci `system.worker_heartbeat_at` (nilai ISO-8601 UTC).
6. Menangani `SIGTERM`: `boss.stop({graceful: true, timeout: 30000})`.

## Skrip Benchmark AI (`scripts/bench-ai.mjs`)
Tujuan: memilih model terkecil yang memenuhi: JSON schema valid >= 95 persen dan latensi dalam target (ADR-002 butir 3).

**CLI:** `node scripts/bench-ai.mjs --models <csv> [--runs 7] [--ollama-url http://127.0.0.1:11434] [--stt-url http://127.0.0.1:8080] [--stt-models base,small] [--audio <path.wav|.webm>] [--out scripts/bench/results] [--target-p50-sec 60]`

| Flag | Tipe | Default | Aturan |
|---|---|---|---|
| `--models` | csv string | wajib | nama model Ollama, mis. `qwen2.5:3b-instruct,qwen2.5:7b-instruct` |
| `--runs` | int 1-30 | 7 | jumlah eksekusi per esai per model |
| `--ollama-url` | URL | `http://127.0.0.1:11434` | |
| `--stt-url` | URL | `http://127.0.0.1:8080` | |
| `--stt-models` | csv | kosong | bila kosong atau `--audio` tidak ada, bagian STT dilewati dengan peringatan |
| `--audio` | path | kosong | rekaman uji 2 menit (disediakan pemilik; tidak di-commit) |
| `--out` | path | `scripts/bench/results` | di-`.gitignore` |
| `--target-p50-sec` | int | 60 | batas p50 latensi LLM |

**Fixture:** `scripts/bench/essays/band5.txt`, `band6.txt`, `band7.txt` (esai Task 2 orisinal buatan AI/pemilik, 230-290 kata, tidak disalin dari sumber berhak cipta). Skrip memakai skema keluaran yang sama dengan SPEC-012 (`WritingEvaluationOutputSchema` dari `src/contracts/ai.ts`; bila belum ada, skema inline identik dengan SPEC-012 bagian "Skema Keluaran LLM").

**Perilaku:** untuk setiap model dan setiap esai, jalankan `--runs` kali panggilan `POST /api/chat` dengan `format` = JSON schema, `temperature: 0.2`, `stream: false`, `options.num_predict: 1500`; ukur latensi ms; validasi keluaran dengan Zod; hitung `json_valid_rate`, p50, p95, dan `band_mae` (rata-rata |overall_band - band_target_esai|, target 5.0/6.0/7.0). Bagian STT: kirim audio ke `POST {stt-url}/inference`, ukur latensi dan jumlah kata transkrip.

**Output:** file `<out>/bench-<YYYYMMDD-HHmmss>.json` dengan bentuk
```json
{"generated_at":"2026-11-03T10:00:00.000Z","host":{"cpus":8,"ram_gb":16},"models":[{"model":"qwen2.5:3b-instruct","runs":21,"json_valid_rate":0.9524,"latency_ms":{"p50":38200,"p95":61000},"band_mae":0.83,"passes":true}],"stt":[{"model":"base","latency_ms":9100,"words":212}],"recommended_model":"qwen2.5:3b-instruct"}
```
plus tabel ringkas di konsol dan baris terakhir `RECOMMENDED_MODEL=<nama|NONE>`. `passes` = `json_valid_rate >= 0.95` dan `latency_ms.p50 <= target-p50-sec*1000`. `recommended_model` = model lolos dengan ukuran parameter terkecil (urutan sesuai urutan `--models`, pengguna mencantumkan dari terkecil). Exit code: 0 bila ada model lolos; 2 bila tidak ada; 1 untuk error teknis (Ollama tidak terjangkau).

## CI GitHub Actions (`.github/workflows/ci.yml`)
Trigger: `push` dan `pull_request` pada `main` dan `development`, filter `paths: ['codes/**', '.github/workflows/ci.yml', 'content/**']`. `defaults.run.working-directory: codes`. `env: NODE_ENV: test, LLM_DRIVER: mock, STT_DRIVER: mock, AI_ENABLED: "true"`. Node 22.20.0, `npm ci`, cache npm.

| Job | Langkah | Gagal bila |
|---|---|---|
| `lint-typecheck` | `npm run lint`, `npm run typecheck` | exit != 0 |
| `unit` | `npm run test -- --coverage` | exit != 0 atau coverage `src/server/**` lines < 70% |
| `integration` | service container `postgres:16.10-alpine` (port 5433), `TEST_DATABASE_URL`, `npm run db:migrate`, `npm run test:integration` | exit != 0 |
| `build` | `npm run build`, `npm run build:worker`, `docker build --target web`, `docker build --target worker` | exit != 0 |
| `e2e` | needs `build`; `docker compose up -d db`, migrasi + seed + fixture (`tests/fixtures`), `npx playwright install --with-deps chromium`, `npm run test:e2e`, unggah artefak `playwright-report/` | exit != 0 |
| `security` | `npm audit --audit-level=high --omit=dev`, `gitleaks/gitleaks-action@v2.3.9`, `aquasecurity/trivy-action@0.33.1` (image `web`, `severity: CRITICAL`, `exit-code: 1`) | temuan high/critical |

PR tidak boleh digabung bila ada job merah. `e2e` memakai browser Chromium viewport 1280x800 dan 375x812.

## Konfigurasi Pengujian
- **Vitest unit:** environment `node` untuk `src/server/**`, `jsdom` untuk `src/components/**`; file `*.test.ts(x)` di sebelah sumber atau `tests/unit`.
- **Vitest integration:** `tests/integration/**/*.itest.ts`, `pool: 'forks'`, `maxWorkers: 1`; setup membuat DB `ielts_test` bersih, menjalankan migrasi + seed, menggunakan `TEST_DATABASE_URL` bila ada, jika tidak memulai `@testcontainers/postgresql` (`postgres:16.10-alpine`).
- **Playwright:** `baseURL: http://127.0.0.1:3000`, project `desktop` (1280x800) dan `mobile` (375x812), `retries: 1` di CI, `trace: 'on-first-retry'`, `globalSetup` memuat `tests/fixtures/content/` ke DB uji (konten sintetis untuk uji; BUKAN konten produksi).

## API Contract
### GET /api/health
- **Auth:** public
- **Success status:** 200
- **Zod:** `HealthResponseSchema` di `src/contracts/health.ts`

**Request:** tanpa parameter.
**Response (Success):**
```json
{ "data": { "status": "ok", "time": "2026-11-03T10:15:30.000Z" } }
```
| Field | Tipe | Nullable | Arti |
|---|---|---|---|
| `data.status` | `"ok"` | tidak | DB menjawab `SELECT 1` dalam 2 dtk |
| `data.time` | string ISO-8601 UTC | tidak | waktu server |

**Response (Error)**
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 503 | SERVICE_UNAVAILABLE | `SELECT 1` gagal atau melebihi 2 dtk. Body `{"error":{"code":"SERVICE_UNAVAILABLE","message":"Layanan belum siap.","request_id":"<uuid>"}}` |

Detail (versi, antrean, Ollama, STT) TIDAK ada di endpoint publik ini; versi admin ada di SPEC-002 (`GET /api/v1/admin/health`).

## Database Changes
Tidak ada tabel baru. Menerapkan baseline: seluruh 31 tabel dari `schema.reference.ts`, FK melingkar, view `v_publish_blockers`, `REVOKE`/`GRANT` role, dan skema `pgboss` (dibuat pg-boss). Seed: `content_sources` (14 baris) dan `app_settings`.

## UI/UX
Tidak ada layar fitur. Wajib: (a) token CSS dari `design-system.md` bagian 9 di `src/app/globals.css` (light dan dark, `:root` + `.dark`), (b) font via `next/font/google` self-hosted (Inter, Plus Jakarta Sans, JetBrains Mono), (c) `<html lang="id">`, (d) komponen shadcn dasar terpasang di `src/components/ui`: `button`, `input`, `label`, `card`, `dialog`, `sheet`, `tabs`, `badge`, `progress`, `toast` (sonner), `table`, `skeleton`, `tooltip`, `select`, `checkbox`, `radio-group`, `switch`, `dropdown-menu`, `popover`, `separator`, `form`, (e) halaman `/` placeholder berisi teks "Platform Belajar IELTS" sampai SPEC-007.

## Acceptance Criteria
- [ ] **Given** repo bersih dan `.env` terisi **When** developer menjalankan langkah 2-5 Technical Flow **Then** `docker compose ps` menampilkan `db` dan `web` berstatus `healthy`, `worker` `running`, `migrate` `exited (0)`.
- [ ] **Given** stack berjalan **When** `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health` **Then** keluaran `200` dan body mengandung `"status":"ok"`.
- [ ] **Given** `db` dihentikan **When** `GET /api/health` dipanggil **Then** status 503 dengan `error.code` = `SERVICE_UNAVAILABLE`.
- [ ] **Given** migrasi selesai **When** query `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` **Then** hasil >= 31, dan skema `pgboss` ada.
- [ ] **Given** role `app_rw` **When** menjalankan `UPDATE audit_log SET action='x'` dan `DELETE FROM point_ledger` **Then** keduanya ditolak dengan `permission denied`.
- [ ] **Given** `db:seed` dijalankan dua kali **When** menghitung baris `content_sources` **Then** tepat 14 baris dan tidak ada error.
- [ ] **Given** `docker compose config` **When** diperiksa **Then** tidak ada image bertag `latest`, tidak ada servis selain `proxy` (dan `web` pada `127.0.0.1`) yang mempublikasikan port ke `0.0.0.0`, dan `db`/`stt`/`ollama`/`minio` tidak punya `ports` pada file utama.
- [ ] **Given** container `web` berjalan **When** `docker exec web id -u` **Then** keluaran `1000` (bukan 0), dan menulis ke `/app` gagal (rootfs read-only).
- [ ] **Given** `worker` berjalan **When** dikirim `SIGTERM` **Then** proses keluar dengan kode 0 dalam <= 30 detik.
- [ ] **Given** Ollama tidak dijalankan **When** stack dinyalakan tanpa profil `ai` **Then** `web` dan `worker` tetap sehat (tidak crash).
- [ ] **Given** `bench:ai` dijalankan dengan `--models fake` dan Ollama mati **When** selesai **Then** exit code 1 dan pesan "Ollama tidak terjangkau di <url>".
- [ ] **Given** `bench:ai` dengan server Ollama tiruan yang mengembalikan JSON valid 21 dari 21 kali dalam p50 10 dtk **When** selesai **Then** exit code 0, file hasil ada, dan baris terakhir `RECOMMENDED_MODEL=<model>`.
- [ ] **Given** PR dengan satu uji gagal **When** CI berjalan **Then** job terkait merah dan status check gagal.
- [ ] **Given** `package.json` **When** diperiksa **Then** semua dependensi bernomor eksak (tanpa `^`/`~`) dan `VERSIONS.md` ada.
- [ ] **Given** repo **When** `gitleaks detect` dijalankan **Then** 0 temuan, dan `.env` tidak terlacak git.

## Edge Cases & Validation
- [ ] Variabel wajib kosong atau ada yang salah format saat start: `web` dan `worker` memvalidasi env dengan Zod (`src/server/env.ts`) dan keluar kode 1 dengan pesan `Konfigurasi env tidak valid: <KEY>` untuk setiap key bermasalah. `AUTH_SECRET` < 32 byte atau `POSTGRES_PASSWORD` = `postgres` ditolak.
- [ ] `STORAGE_DRIVER=s3` tanpa `S3_*` lengkap: keluar kode 1 dengan pesan `S3_* wajib bila STORAGE_DRIVER=s3`.
- [ ] `AI_ENABLED=true` dengan `LLM_DRIVER=ollama` namun `OLLAMA_BASE_URL` tidak terjangkau: aplikasi tetap start; `AiHealth` melaporkan `down`; submission baru memakai fallback self-assessment (SPEC-012).
- [ ] Host header di luar `ALLOWED_HOSTS`: `400` dengan body `{"error":{"code":"VALIDATION_ERROR","message":"Host tidak diizinkan.","request_id":"<uuid>"}}`.
- [ ] `migrate` dijalankan ulang tanpa perubahan skema: exit 0 tanpa efek (idempoten).
- [ ] `migrate` gagal di tengah: exit != 0, `web`/`worker` tidak start (kondisi `service_completed_successfully`).
- [ ] Windows: skrip `.sh` dijalankan di dalam container; pengguna host Windows memakai `docker compose` dan skrip `.ps1` pendamping `scripts/pull-models.ps1`.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03). Ditinjau ulang oleh human setelah Fase 3.

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft; Human Approval Status diisi `approved` berdasarkan delegasi ADR-003 |
