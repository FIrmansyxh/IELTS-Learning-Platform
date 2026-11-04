#!/bin/sh
# Mulai ulang worker E2E dengan env mock. Pemakaian: tests/e2e/support/restart-worker.sh [VAR=nilai ...]
cd "$(dirname "$0")/../../.."
for p in $(pgrep -f "[s]rc/worker/index"); do kill $p 2>/dev/null; done
sleep 1
. ./tests/e2e/e2e.env.sh
for kv in "$@"; do export "$kv"; done
setsid nohup npm run worker:dev > /tmp/e2e-logs/worker.log 2>&1 < /dev/null &
sleep 6
