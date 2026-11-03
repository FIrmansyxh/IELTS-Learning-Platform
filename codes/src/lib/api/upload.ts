import type { z } from 'zod';
import { ErrorBodySchema } from '@/contracts/common';
import { ApiError, buildUrl } from './client';

export type UploadOptions = {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

/**
 * Unggah multipart dengan progres (XMLHttpRequest; `fetch` belum memberi progres unggah).
 * Galat memakai envelope yang sama dengan `apiFetch`. Header `Content-Type` dibiarkan kosong
 * agar peramban menambahkan boundary; cookie sesi sama-origin dikirim otomatis.
 */
export function uploadMultipart<S extends z.ZodType>(
  path: string,
  form: FormData,
  schema: S,
  opts: UploadOptions = {},
): Promise<z.infer<S>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl(path));
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.responseType = 'text';

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && opts.onProgress) {
        opts.onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      }
    };
    xhr.onerror = () => reject(new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network error' }));
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* bukan JSON */
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const parsed = ErrorBodySchema.safeParse(json);
        const retryRaw = Number(xhr.getResponseHeader('Retry-After'));
        const retryAfterSec = Number.isFinite(retryRaw) && retryRaw > 0 ? Math.ceil(retryRaw) : null;
        if (parsed.success) {
          const { code, message, request_id, details } = parsed.data.error;
          reject(new ApiError({ status: xhr.status, code, message, requestId: request_id, details, retryAfterSec }));
        } else {
          reject(
            new ApiError({
              status: xhr.status,
              code: xhr.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN',
              message: `HTTP ${xhr.status}`,
              retryAfterSec,
            }),
          );
        }
        return;
      }
      const ok = schema.safeParse(json);
      if (!ok.success) {
        reject(
          new ApiError({ status: xhr.status, code: 'RESPONSE_INVALID', message: `Respons POST ${path} tidak sesuai kontrak` }),
        );
        return;
      }
      resolve(ok.data);
    };

    if (opts.signal) {
      if (opts.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}
