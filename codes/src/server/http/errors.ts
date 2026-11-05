/** Registri kode error (specifications/_api-contract.md bagian 2). Pesan Indonesia dan generik. */
export interface ErrorDetail {
  path: string;
  code: string;
  message: string;
}

const REGISTRY: Record<string, { status: number; message: string }> = {
  VALIDATION_ERROR: { status: 400, message: 'Data yang dikirim tidak valid.' },
  UNAUTHENTICATED: { status: 401, message: 'Sesi tidak valid atau telah berakhir.' },
  PASSWORD_CHANGE_REQUIRED: { status: 403, message: 'Anda harus mengganti password terlebih dahulu.' },
  FORBIDDEN: { status: 403, message: 'Anda tidak punya akses.' },
  CSRF_ORIGIN_MISMATCH: { status: 403, message: 'Permintaan ditolak.' },
  NOT_FOUND: { status: 404, message: 'Data tidak ditemukan.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Ukuran data terlalu besar.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Format permintaan tidak didukung.' },
  RANGE_NOT_SATISFIABLE: { status: 416, message: 'Rentang byte yang diminta tidak valid.' },
  RATE_LIMITED: { status: 429, message: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' },
  INTERNAL_ERROR: { status: 500, message: 'Terjadi kesalahan pada server.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'Layanan belum siap.' },
  // SPEC-001
  INVALID_CREDENTIALS: { status: 401, message: 'Email atau password salah.' },
  SIGNUP_CLOSED: { status: 403, message: 'Pendaftaran sedang ditutup.' },
  INVITE_INVALID: { status: 403, message: 'Kode undangan tidak valid atau sudah kedaluwarsa.' },
  EMAIL_TAKEN: { status: 409, message: 'Email sudah terdaftar.' },
  CURRENT_PASSWORD_INCORRECT: { status: 403, message: 'Password saat ini salah.' },
  // SPEC-002
  CANNOT_MODIFY_SELF: { status: 409, message: 'Anda tidak dapat mengubah akun Anda sendiri.' },
  LAST_ADMIN: { status: 409, message: 'Minimal satu admin aktif harus tersisa.' },
  INVITE_NOT_ACTIVE: { status: 409, message: 'Undangan tidak aktif.' },
  // SPEC-003
  LOCKED_CONTENT: { status: 403, message: 'Materi ini masih terkunci.' },
  ALREADY_UNLOCKED: { status: 409, message: 'Level ini sudah terbuka.' },
  NOT_AVAILABLE: { status: 409, message: 'Konten ini belum tersedia.' },
  // SPEC-005
  LEARN_REQUIREMENTS_NOT_MET: { status: 409, message: 'Syarat belajar belum terpenuhi.' },
  NO_MINI_TASK: { status: 409, message: 'Sub-modul ini tidak memiliki Mini-Task.' },
  MINI_TASK_NOT_SELF_CHECK: { status: 409, message: 'Mini-Task ini dinilai lewat penilaian AI.' },
  LEARN_NOT_COMPLETED: { status: 409, message: 'Selesaikan materi terlebih dahulu.' },
  // SPEC-006
  ATTEMPT_EXPIRED: { status: 409, message: 'Waktu pengerjaan telah habis.' },
  ATTEMPT_NOT_ACTIVE: { status: 409, message: 'Percobaan ini sudah tidak aktif.' },
  ATTEMPT_NOT_FINISHED: { status: 409, message: 'Percobaan ini belum selesai.' },
  QUESTION_ALREADY_ANSWERED: { status: 409, message: 'Soal ini sudah dijawab.' },
  QUESTION_REQUIRES_SUBMISSION: { status: 409, message: 'Soal ini dijawab lewat pengiriman tugas.' },
  ASSESSMENT_TYPE_NOT_ENABLED: { status: 409, message: 'Jenis penilaian ini belum tersedia.' },
  SECTION_NOT_STARTABLE: { status: 409, message: 'Bagian ini hanya dapat dimulai lewat ujian induknya.' },
  // SPEC-008
  SKIP_NOT_AVAILABLE: { status: 409, message: 'Uji Kompetensi tidak tersedia karena level ini sudah dimulai atau diselesaikan.' },
  COOLDOWN_ACTIVE: { status: 429, message: 'Jeda antar percobaan masih berlaku.' },
  DAILY_ATTEMPT_LIMIT: { status: 429, message: 'Batas percobaan harian untuk ujian ini sudah tercapai.' },
  // SPEC-009
  VERSION_LABEL_TAKEN: { status: 409, message: 'Label versi sudah dipakai pada keterampilan ini.' },
  ALREADY_ACTIVE: { status: 409, message: 'Tabel ini sudah aktif.' },
  BAND_TABLE_IN_USE: { status: 409, message: 'Tabel aktif atau sudah dipakai tidak dapat dihapus.' },
  // SPEC-012 & SPEC-013 AI
  UNSUPPORTED_AUDIO_TYPE: { status: 415, message: 'Format rekaman tidak didukung.' },
  RECORDING_CONSENT_REQUIRED: { status: 409, message: 'Setujui pemberitahuan rekaman suara terlebih dahulu.' },
  RECORDING_IN_USE: { status: 409, message: 'Rekaman sedang diproses.' },
  RECORDING_UNAVAILABLE: { status: 409, message: 'Rekaman tidak tersedia.' },
  AI_DAILY_LIMIT_REACHED: { status: 429, message: 'Batas harian pengiriman AI telah tercapai.' },
  AI_QUEUE_FULL: { status: 503, message: 'Antrean AI sedang penuh, coba lagi nanti.' },
  SUBMISSION_NOT_RETRYABLE: { status: 409, message: 'Tugas ini tidak dapat diulang.' },
  SUBMISSION_ALREADY_EXISTS: { status: 409, message: 'Tugas ini sudah dikirimkan.' },
  AI_SUBMISSION_IN_PROGRESS: { status: 409, message: 'Pengiriman sedang diproses.' },
  QUESTION_TYPE_MISMATCH: { status: 409, message: 'Jenis soal tidak sesuai dengan tugas.' },
  MINI_TASK_TYPE_MISMATCH: { status: 409, message: 'Jenis Mini-Task tidak sesuai.' },
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ErrorDetail[];
  readonly headers?: Record<string, string>;

  constructor(
    code: string,
    opts: { message?: string; details?: ErrorDetail[]; status?: number; headers?: Record<string, string> } = {},
  ) {
    const reg = REGISTRY[code];
    super(opts.message ?? reg?.message ?? 'Terjadi kesalahan pada server.');
    this.name = 'ApiError';
    this.code = code;
    this.status = opts.status ?? reg?.status ?? 500;
    this.details = opts.details;
    this.headers = opts.headers;
  }
}

export function validationError(path: string, code: string, message = REGISTRY.VALIDATION_ERROR.message): ApiError {
  return new ApiError('VALIDATION_ERROR', { details: [{ path, code, message }] });
}
export const notFound = () => new ApiError('NOT_FOUND');
