/** Token bucket in-memory per proses (_api-contract.md bagian 3). */
export interface BucketSpec {
  limit: number;
  windowMs: number;
}

export const BUCKETS = {
  login_ip: { limit: 5, windowMs: 60_000 },
  login_email: { limit: 10, windowMs: 15 * 60_000 },
  register_ip: { limit: 5, windowMs: 3_600_000 },
  account_action: { limit: 5, windowMs: 3_600_000 },
  general_ip: { limit: 60, windowMs: 60_000 },
  general_user: { limit: 300, windowMs: 60_000 },
  answer_submit: { limit: 60, windowMs: 60_000 },
  attempt_start: { limit: 30, windowMs: 3_600_000 },
  heartbeat: { limit: 30, windowMs: 60_000 },
  job_poll: { limit: 1, windowMs: 1_000 },
  upload_recording: { limit: 10, windowMs: 3_600_000 },
  import_admin: { limit: 10, windowMs: 3_600_000 },
} as const satisfies Record<string, BucketSpec>;
export type BucketName = keyof typeof BUCKETS;

interface State {
  tokens: number;
  updated: number;
}
const store = new Map<string, State>();
const MAX_KEYS = 50_000;

/** Ambil satu token. Mengembalikan null bila diizinkan, atau detik tunggu (>= 1) bila ditolak. */
export function consume(bucket: BucketName, key: string, now = Date.now()): number | null {
  const spec: BucketSpec = BUCKETS[bucket];
  const k = `${bucket}:${key}`;
  const rate = spec.limit / spec.windowMs; // token per ms
  let s = store.get(k);
  if (!s) {
    if (store.size >= MAX_KEYS) prune(now);
    s = { tokens: spec.limit, updated: now };
    store.set(k, s);
  } else {
    s.tokens = Math.min(spec.limit, s.tokens + (now - s.updated) * rate);
    s.updated = now;
  }
  if (s.tokens >= 1) {
    s.tokens -= 1;
    return null;
  }
  return Math.max(1, Math.ceil((1 - s.tokens) / rate / 1000));
}

function prune(now: number) {
  for (const [k, s] of store) {
    const name = k.slice(0, k.indexOf(':')) as BucketName;
    const spec = BUCKETS[name];
    if (!spec || now - s.updated > spec.windowMs) store.delete(k);
  }
  if (store.size >= MAX_KEYS) store.clear();
}

/** Hanya untuk pengujian. */
export function resetRateLimits(): void {
  store.clear();
}
