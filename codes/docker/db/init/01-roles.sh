#!/bin/sh
# Dijalankan sekali oleh entrypoint postgres saat volume data kosong.
# Membuat role aplikasi: app_migrator (DDL, pemilik objek) dan app_rw (DML runtime).
# Password dibaca dari env dan dikirim sebagai variabel psql (aman terhadap karakter khusus).
set -eu

: "${APP_RW_PASSWORD:?APP_RW_PASSWORD wajib}"
: "${APP_MIGRATOR_PASSWORD:?APP_MIGRATOR_PASSWORD wajib}"
: "${POSTGRES_DB:?POSTGRES_DB wajib}"
: "${POSTGRES_USER:?POSTGRES_USER wajib}"

psql -v ON_ERROR_STOP=1 \
  -v rw_pw="$APP_RW_PASSWORD" -v mig_pw="$APP_MIGRATOR_PASSWORD" -v dbname="$POSTGRES_DB" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE app_migrator LOGIN PASSWORD :'mig_pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE app_rw       LOGIN PASSWORD :'rw_pw'  NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Migrator memiliki database dan skema public (membuat tabel + skema pgboss).
ALTER DATABASE :"dbname" OWNER TO app_migrator;
ALTER SCHEMA public OWNER TO app_migrator;

REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO app_rw;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_rw;

-- Tabel/sekuens baru yang dibuat migrator otomatis dapat diakses DML oleh app_rw.
-- Tabel append-only (audit_log, point_ledger) dicabut UPDATE/DELETE-nya oleh migrasi.
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
SQL
