import { statSync } from 'node:fs';

const file = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/worker.heartbeat';
try {
  const ageMs = Date.now() - statSync(file).mtimeMs;
  process.exit(ageMs < 60_000 ? 0 : 1);
} catch {
  process.exit(1);
}
