import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true'));

const intRange = (def: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(def);

const secret32 = z
  .string()
  .refine((v) => Buffer.byteLength(v, 'utf8') >= 32, 'minimal 32 byte');

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_TIMEZONE: z.string().min(1).default('Asia/Jakarta'),

  /** Berkas SQLite (SPEC-025 Fase 3). Bawaan: ./data/ielts.db */
  DATABASE_PATH: z.string().min(1).optional(),
  AUTH_SECRET: secret32,
  AUTH_URL: z.string().url(),
  AUTH_TRUST_HOST: bool(false),
  ALLOWED_HOSTS: z.string().min(1),
  IP_HMAC_SECRET: secret32,

  ASSETS_DIR: z.string().min(1),
  STORAGE_DRIVER: z.enum(['fs', 's3']).default('fs'),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),

  UPLOAD_MAX_MB_RECORDING: intRange(10, 1, 1024),
  UPLOAD_MAX_MB_AUDIO_ASSET: intRange(50, 1, 1024),
  UPLOAD_MAX_MB_IMAGE: intRange(5, 1, 1024),
  UPLOAD_MAX_MB_DOCUMENT: intRange(25, 1, 1024),
  UPLOAD_MAX_MB_IMPORT: intRange(5, 1, 1024),

  /** Jenis ujian yang dilayani (ADR-004): menentukan sub-modul bertag yang tampil bagi learner. */
  EXAM_MODULE: z.enum(['GENERAL_TRAINING', 'ACADEMIC']).default('GENERAL_TRAINING'),
  AI_ENABLED: bool(false),
  LLM_DRIVER: z.enum(['llamacpp', 'ollama', 'mock']).default('llamacpp'),
  LLAMACPP_BASE_URL: z.string().url().optional(),
  LLAMACPP_MODEL_WRITING: z.string().optional(),
  SPEAKING_AI_ENABLED: bool(true),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL_WRITING: z.string().optional(),
  OLLAMA_MODEL_SPEAKING: z.string().optional(),
  OLLAMA_KEEP_ALIVE: z.string().default('5m'),
  STT_DRIVER: z.enum(['whisper', 'mock']).default('whisper'),
  STT_BASE_URL: z.string().url().optional(),
  AI_JOB_TIMEOUT_SEC: intRange(180, 10, 3600),
  AI_NUM_PREDICT: intRange(1500, 100, 8192),
});

const S3_KEYS = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'] as const;

const schema = baseSchema.superRefine((env, ctx) => {
  if (env.STORAGE_DRIVER === 's3' && S3_KEYS.some((k) => !env[k])) {
    ctx.addIssue({
      code: 'custom',
      path: ['STORAGE_DRIVER'],
      message: 'S3_* wajib bila STORAGE_DRIVER=s3',
    });
  }
});

export type Env = z.infer<typeof schema>;
export type EnvResult = { ok: true; env: Env } | { ok: false; keys: string[]; messages: string[] };

/** Validasi env. Hanya nama key yang dilaporkan, nilai tidak pernah dicetak. */
export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  const result = schema.safeParse(source);
  if (result.success) {
    return { ok: true, env: result.data };
  }
  const keys = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? 'env')))];
  const messages = [
    ...new Set(
      result.error.issues.map((i) =>
        i.message.startsWith('S3_*') ? i.message : `Konfigurasi env tidak valid: ${String(i.path[0] ?? 'env')}`,
      ),
    ),
  ];
  return { ok: false, keys, messages };
}

let cached: Env | undefined;

/** Dipanggil saat start web/worker; keluar dengan kode 1 bila tidak valid. */
export function getEnv(): Env {
  if (cached) return cached;
  const r = parseEnv(process.env);
  if (!r.ok) {
    for (const m of r.messages) console.error(m);
    process.exit(1);
  }
  cached = r.env;
  return cached;
}
