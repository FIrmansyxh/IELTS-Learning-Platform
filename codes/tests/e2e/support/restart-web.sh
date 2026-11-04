#!/bin/sh
# Mulai ulang server web E2E (next dev) dengan env mock. Pemakaian: tests/e2e/support/restart-web.sh [VAR=nilai ...]
cd "$(dirname "$0")/../../.."
for p in $(pgrep -f "[n]ext dev"); do kill $p 2>/dev/null; done
for p in $(pgrep -f "[n]ext-server"); do kill $p 2>/dev/null; done
sleep 2
. ./tests/e2e/e2e.env.sh
for kv in "$@"; do export "$kv"; done
setsid nohup npm run dev > /tmp/e2e-logs/web.log 2>&1 < /dev/null &
i=0; until curl -sf localhost:3000/api/health >/dev/null; do i=$((i+1)); [ $i -gt 60 ] && break; sleep 2; done
