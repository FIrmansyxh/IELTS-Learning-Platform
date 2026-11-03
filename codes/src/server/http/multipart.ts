import { ApiError, validationError } from './errors';

/** Selisih toleransi di atas batas ukuran berkas (boundary + field teks): AC SPEC-018 "byte tertulis <= batas + 64 KB". */
export const MULTIPART_SLACK_BYTES = 64 * 1024;

export interface MultipartPart {
  name: string;
  file: File;
}
export interface MultipartResult {
  /** Field teks; nama ganda menjadi array (ditolak validasi hilir). */
  fields: Record<string, string | string[]>;
  files: MultipartPart[];
}

export interface MultipartOptions {
  /** Batas byte total terbesar yang pernah diizinkan (tanpa slack). */
  maxBytes: number;
  /**
   * Batas byte berkas menurut field `kind` (bila field `kind` muncul sebelum berkas). Dipakai untuk menghentikan pembacaan
   * lebih awal; pemeriksaan akhir per-kind tetap dilakukan pemanggil.
   */
  limitForKind?: (kind: string) => number | undefined;
}

/**
 * Baca multipart/form-data dengan batas ukuran yang ditegakkan SAAT membaca aliran (bukan setelah seluruh body diterima).
 * Tidak ada berkas sementara di disk; byte hanya hidup di memori hingga divalidasi pemanggil.
 */
export async function readMultipart(req: Request, o: MultipartOptions): Promise<MultipartResult> {
  const ct = req.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(ct) || !/boundary=/i.test(ct)) throw new ApiError('UNSUPPORTED_MEDIA_TYPE');
  let limit = o.maxBytes + MULTIPART_SLACK_BYTES;
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > limit) throw new ApiError('PAYLOAD_TOO_LARGE');
  if (!req.body) throw validationError('file', 'file_required');

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let head = '';
  let kindResolved = !o.limitForKind;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (!kindResolved && head.length < 65_536) {
      head += Buffer.from(value).toString('latin1');
      const m = /name="kind"\r\n\r\n([A-Z_]{1,30})\r\n/.exec(head);
      if (m) {
        kindResolved = true;
        const lim = o.limitForKind?.(m[1]!);
        if (lim !== undefined) limit = Math.min(limit, lim + MULTIPART_SLACK_BYTES);
      }
    }
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new ApiError('PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }

  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': ct } }).formData();
  } catch {
    throw new ApiError('VALIDATION_ERROR', { details: [{ path: '', code: 'multipart_invalid', message: 'Body multipart tidak valid.' }] });
  }
  const fields: Record<string, string | string[]> = {};
  const files: MultipartPart[] = [];
  for (const [name, value] of form.entries()) {
    if (typeof value !== 'string') {
      files.push({ name, file: value });
      continue;
    }
    const prev = fields[name];
    fields[name] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
  }
  return { fields, files };
}
