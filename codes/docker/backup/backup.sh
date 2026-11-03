#!/bin/sh
# Backup harian: pg_dump -Fc ke daily/YYYY-MM-DD.dump, salin mingguan (Minggu), retensi 14 harian + 8 mingguan,
# salinan aset incremental ke /backups/assets, lalu tulis /backups/.last_ok.
# Pemakaian: backup.sh once   -> satu kali jalan
#            backup.sh loop   -> jalan sekali saat start, lalu tiap 02:00 (BACKUP_TZ, default WIB-7)
set -eu

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
ASSETS_SRC="${ASSETS_SRC:-/data/assets}"
export TZ="${BACKUP_TZ:-WIB-7}"

run_once() {
  day="$(date +%Y-%m-%d)"
  mkdir -p "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/assets"

  tmp="$BACKUP_ROOT/daily/.$day.dump.partial"
  pg_dump -Fc -f "$tmp"
  mv "$tmp" "$BACKUP_ROOT/daily/$day.dump"

  # Minggu (date +%u = 7): salin ke weekly.
  if [ "$(date +%u)" = "7" ]; then
    cp "$BACKUP_ROOT/daily/$day.dump" "$BACKUP_ROOT/weekly/$day.dump"
  fi

  # Retensi: daily maksimal 14 berkas, weekly maksimal 8.
  ls -1t "$BACKUP_ROOT"/daily/*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f --
  ls -1t "$BACKUP_ROOT"/weekly/*.dump 2>/dev/null | tail -n +9 | xargs -r rm -f --

  # Aset: salinan incremental (hanya berkas baru/berubah). Berkas yang dihapus di sumber tidak dihapus di backup.
  if [ -d "$ASSETS_SRC" ]; then
    cp -a -u "$ASSETS_SRC"/. "$BACKUP_ROOT/assets"/ 2>/dev/null || true
  fi

  touch "$BACKUP_ROOT/.last_ok"
  echo "[backup] OK $day"
}

seconds_until_0200() {
  # Hilangkan nol di depan (hindari tafsir oktal pada "08"/"09" di ash).
  now_h="$(date +%H | sed 's/^0*\(.\)/\1/')"
  now_m="$(date +%M | sed 's/^0*\(.\)/\1/')"
  now_s="$(date +%S | sed 's/^0*\(.\)/\1/')"
  now=$(( now_h * 3600 + now_m * 60 + now_s ))
  target=$(( 2 * 3600 ))
  if [ "$now" -lt "$target" ]; then echo $(( target - now )); else echo $(( 86400 - now + target )); fi
}

case "${1:-once}" in
  once) run_once ;;
  loop)
    run_once || echo "[backup] GAGAL pada jalan awal" >&2
    while :; do
      sleep "$(seconds_until_0200)"
      run_once || echo "[backup] GAGAL" >&2
    done
    ;;
  *) echo "Pemakaian: $0 once|loop" >&2; exit 2 ;;
esac
