<#
.SYNOPSIS
  Postgres 16 lokal persisten untuk dev/test tanpa Docker (jalur B di README.md).
.DESCRIPTION
  Cluster berada di codes/.local-pg (di-gitignore), port 55432, hanya listen 127.0.0.1.
  Perintah: init | start | stop | status | reset
  - init   : initdb + buat DB `ielts` dan `ielts_test` + role app_rw/app_migrator + tulis codes/.env bila belum ada.
  - start  : init bila perlu, lalu pg_ctl start.
  - stop   : pg_ctl stop.
  - reset  : hapus seluruh cluster (DATA HILANG) lalu init ulang.
  Password acak dibuat sekali dan disimpan di .local-pg/secrets.json (di-gitignore) dan codes/.env.
#>
param(
  [Parameter(Position = 0)][ValidateSet('init', 'start', 'stop', 'status', 'reset')][string]$Action = 'status',
  [string]$PgBin = $(if ($env:PG_BIN) { $env:PG_BIN } else { 'C:\Program Files\PostgreSQL\16\bin' }),
  [int]$Port = 55432
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$base = Join-Path $root '.local-pg'
$data = Join-Path $base 'data'
$secretsFile = Join-Path $base 'secrets.json'
$log = Join-Path $base 'postgres.log'
$envFile = Join-Path $root '.env'

function Bin($n) { Join-Path $PgBin ($n + '.exe') }
function NewSecret([int]$bytes = 24) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}
function NewB64([int]$bytes = 32) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  [Convert]::ToBase64String($b)
}
function IsRunning { & (Bin 'pg_ctl') -D $data status *> $null; return ($LASTEXITCODE -eq 0) }

function Init-Cluster {
  if (-not (Test-Path (Bin 'initdb'))) { throw "initdb tidak ditemukan di $PgBin (set PG_BIN)" }
  New-Item -ItemType Directory -Force $base | Out-Null
  if (-not (Test-Path $secretsFile)) {
    @{ admin = (NewSecret); rw = (NewSecret); migrator = (NewSecret); auth = (NewB64); iphmac = (NewB64) } | ConvertTo-Json | Set-Content -Encoding ascii $secretsFile
  }
  $s = Get-Content $secretsFile -Raw | ConvertFrom-Json
  if (-not (Test-Path (Join-Path $data 'PG_VERSION'))) {
    $pw = Join-Path $base 'pw.tmp'
    Set-Content -NoNewline -Encoding ascii $pw $s.admin
    & (Bin 'initdb') -D $data -U postgres_admin --pwfile=$pw -A scram-sha-256 -E UTF8 --locale=C | Out-Null
    Remove-Item $pw -Force
    if ($LASTEXITCODE -ne 0) { throw 'initdb gagal' }
    Start-Cluster-Raw
    $env:PGPASSWORD = $s.admin
    $psql = Bin 'psql'
    $common = @('-h', '127.0.0.1', '-p', $Port, '-U', 'postgres_admin', '-v', 'ON_ERROR_STOP=1')
    foreach ($db in @('ielts', 'ielts_test')) {
      & $psql @common -d postgres -c "CREATE DATABASE $db" | Out-Null
    }
    # Peran aplikasi: sama dengan docker/db/init/01-roles.sh (per database).
    & $psql @common -d postgres -c "CREATE ROLE app_migrator LOGIN PASSWORD '$($s.migrator)' NOSUPERUSER NOCREATEDB NOCREATEROLE" | Out-Null
    & $psql @common -d postgres -c "CREATE ROLE app_rw LOGIN PASSWORD '$($s.rw)' NOSUPERUSER NOCREATEDB NOCREATEROLE" | Out-Null
    # Hanya dev/test lokal: migrator boleh `SET ROLE app_rw` agar tes hak akses (baseline.itest) dapat berjalan.
    & $psql @common -d postgres -c "GRANT app_rw TO app_migrator" | Out-Null
    foreach ($db in @('ielts', 'ielts_test')) {
      $sql = @"
ALTER DATABASE $db OWNER TO app_migrator;
REVOKE ALL ON DATABASE $db FROM PUBLIC;
GRANT CONNECT ON DATABASE $db TO app_rw;
"@
      & $psql @common -d postgres -c $sql | Out-Null
      $sql2 = @"
ALTER SCHEMA public OWNER TO app_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
"@
      & $psql @common -d $db -c $sql2 | Out-Null
    }
    Remove-Item Env:\PGPASSWORD
    Write-Host '[dev-db] cluster dibuat.'
  }
  if (-not (Test-Path $envFile)) {
    $envText = @"
# generated-by: scripts/dev-db.ps1 (aman dihapus oleh `reset`)
NODE_ENV=development
LOG_LEVEL=info
APP_TIMEZONE=Asia/Jakarta
DATABASE_URL=postgres://app_rw:$($s.rw)@127.0.0.1:$Port/ielts
DATABASE_MIGRATOR_URL=postgres://app_migrator:$($s.migrator)@127.0.0.1:$Port/ielts
TEST_DATABASE_URL=postgres://app_migrator:$($s.migrator)@127.0.0.1:$Port/ielts_test
AUTH_SECRET=$($s.auth)
AUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=false
ALLOWED_HOSTS=localhost:3000,127.0.0.1:3000
IP_HMAC_SECRET=$($s.iphmac)
ADMIN_EMAIL=owner@example.test
ADMIN_INITIAL_PASSWORD=ganti-saya-dev-0123456789
SIGNUP_MODE=invite
ASSETS_DIR="$(Join-Path $root '.local-pg\assets' | ForEach-Object { $_ -replace '\\','/' })"
STORAGE_DRIVER=fs
AI_ENABLED=false
WORKER_HEARTBEAT_FILE="$(Join-Path $base 'worker.heartbeat' | ForEach-Object { $_ -replace '\\','/' })"
"@
    Set-Content -Encoding ascii $envFile $envText
    Write-Host "[dev-db] $envFile dibuat (rahasia acak, di-gitignore)."
  }
}
function Start-Cluster-Raw {
  if (IsRunning) { return }
  # Start-Process tanpa -Wait: postgres mewarisi handle pipa sehingga pemanggil bisa menggantung.
  Start-Process -FilePath (Bin 'pg_ctl') -WindowStyle Hidden -ArgumentList @('-D', "`"$data`"", '-l', "`"$log`"", '-o', "`"-p $Port -c listen_addresses=127.0.0.1`"", 'start') | Out-Null
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (IsRunning) {
      & (Bin 'pg_isready') -h 127.0.0.1 -p $Port *> $null
      if ($LASTEXITCODE -eq 0) { return }
    }
  }
  throw "postgres tidak siap dalam 30 dtk; lihat $log"
}

switch ($Action) {
  'init' { Init-Cluster; Write-Host '[dev-db] siap. Jalankan: start' }
  'start' { Init-Cluster; Start-Cluster-Raw; Write-Host "[dev-db] berjalan di 127.0.0.1:$Port" }
  'stop' { if (Test-Path (Join-Path $data 'PG_VERSION')) { & (Bin 'pg_ctl') -D $data -m fast -w stop | Out-Null }; Write-Host '[dev-db] berhenti.' }
  'status' { if (Test-Path (Join-Path $data 'PG_VERSION')) { if (IsRunning) { Write-Host "[dev-db] berjalan di 127.0.0.1:$Port" } else { Write-Host '[dev-db] berhenti.' } } else { Write-Host '[dev-db] belum diinisialisasi (jalankan: init).' } }
  'reset' {
    if (Test-Path (Join-Path $data 'PG_VERSION')) { if (IsRunning) { & (Bin 'pg_ctl') -D $data -m fast -w stop | Out-Null } }
    if (Test-Path $base) { Remove-Item -Recurse -Force $base }
    if ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern 'generated-by: scripts/dev-db.ps1' -Quiet)) { Remove-Item -Force $envFile }
    Init-Cluster; Start-Cluster-Raw; Write-Host '[dev-db] direset dan berjalan.'
  }
}
