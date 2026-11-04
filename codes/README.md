# ielts-learning-platform (codes/)

Fondasi SPEC-000: Next.js 15 (App Router) + TypeScript + Tailwind 4 + shadcn/ui, Drizzle, Auth.js, pg-boss, Vitest, Playwright. Versi terkunci: lihat `VERSIONS.md`.

## Jalur A: Docker Compose (target)
```bash
cp .env.example .env            # isi POSTGRES_PASSWORD, APP_RW_PASSWORD, APP_MIGRATOR_PASSWORD, AUTH_SECRET, IP_HMAC_SECRET, BACKUP_DIR
docker compose -f docker-compose.yml up -d db
docker compose -f docker-compose.yml run --rm migrate
docker compose -f docker-compose.yml run --rm migrate npm run db:seed
docker compose -f docker-compose.yml up -d web worker
curl -s http://127.0.0.1:3000/api/health
```
Dev dengan Postgres terbuka di loopback: tambahkan `-f docker-compose.dev.yml`. Profil: `--profile ai` (stt), `minio`, `proxy`, `ollama-container`.

## Jalur B: tanpa Docker (Postgres 16 lokal)
1. Buat cluster khusus (jangan pakai instalasi lain): `initdb -D <dir> -U postgres_admin --pwfile=<pw.txt> -A scram-sha-256`, lalu `pg_ctl -D <dir> -o "-p 55432 -c listen_addresses=127.0.0.1" start`.
2. `createdb ielts`, lalu jalankan `docker/db/init/01-roles.sh` dengan `POSTGRES_DB`, `POSTGRES_USER`, `APP_RW_PASSWORD`, `APP_MIGRATOR_PASSWORD`, `PGHOST`, `PGPORT`, `PGPASSWORD` terisi (butuh `sh` + `psql`, mis. Git Bash).
3. Isi `.env` (DATABASE_URL dan DATABASE_MIGRATOR_URL mengarah ke 127.0.0.1:55432), lalu:
```bash
npm ci
npm run db:migrate && npm run db:seed
npm run dev                      # http://127.0.0.1:3000
npm run build:worker && node dist/index.js   # worker (set WORKER_HEARTBEAT_FILE di Windows)
```

### Jalur B otomatis di Windows: `scripts/dev-db.ps1`
Cluster Postgres 16 persisten di `codes/.local-pg` (di-gitignore), port 55432, hanya `127.0.0.1`, memakai instalasi `C:\Program Files\PostgreSQLin` (ganti lewat `-PgBin` atau env `PG_BIN`).
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-db.ps1 start   # init (sekali) + start; menulis codes/.env berisi rahasia acak
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-db.ps1 stop
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-db.ps1 status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-db.ps1 reset   # HAPUS cluster + .env buatan skrip, lalu init ulang
npm run db:migrate && npm run db:seed
npm run admin:bootstrap          # butuh ADMIN_EMAIL + ADMIN_INITIAL_PASSWORD (>= 16 karakter) di .env
```
Database `ielts` (dev) dan `ielts_test` (`TEST_DATABASE_URL`; dipakai `npm run test:integration` tanpa Docker/Testcontainers). Hanya untuk dev/test lokal: `app_migrator` diberi keanggotaan `app_rw` agar tes hak akses `SET ROLE app_rw` berjalan.
Jangan menjalankan `next build` dengan `NODE_ENV=development` di environment (mis. setelah `source .env`); biarkan Next yang memuat `.env`.

### CLI konten dan akun (SPEC-001/002/004)
```bash
npm run content:validate -- --dir content/golden-sample           # exit 0 valid, 1 ada galat
npm run content:import   -- --dir content/golden-sample [--dry-run] [--publish] [--allow-published-overwrite]   # exit 0/1/2 (publikasi terhalang)/3
npm run user:reset-password -- user@example.test                  # password sementara dicetak sekali
```
Tanpa `ffprobe`, durasi audio hanya terbaca untuk WAV (peringatan `ffprobe_unavailable`).

## Perintah utama
`npm run lint | typecheck | test | test:integration | test:e2e | build | build:worker | bench:ai`

`npm run bench:ai -- --models qwen2.5:3b-instruct,qwen2.5:7b-instruct` (Ollama harus berjalan di 127.0.0.1:11434).
