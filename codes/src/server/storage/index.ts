import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { config } from '../config';

/** Abstraksi penyimpanan aset (security-standards 4). Hanya driver `fs` yang diimplementasikan; `s3` menyusul (profil minio). */
export interface StorageDriver {
  readonly backend: 'FILESYSTEM' | 'MINIO';
  /** Simpan byte; mengembalikan storage_key relatif (nama UUID, tanpa nama asli pengguna). `dir` opsional (SPEC-018/019). */
  put(data: Buffer, ext: string, dir?: StorageDir): Promise<string>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** Ukuran berkas dalam byte; melempar bila berkas tidak ada (SPEC-011: pelayanan Range tanpa memuat seluruh berkas). */
  size(key: string): Promise<number>;
  /** Aliran byte inklusif `[start, end]`; stream dihentikan (fd ditutup) bila konsumen membatalkan. */
  openRange(key: string, start: number, end: number): ReadableStream<Uint8Array>;
  remove(key: string): Promise<void>;
}

/** Direktori berprefiks yang diizinkan (matriks unggah SPEC-018; impor privat SPEC-019). */
export const STORAGE_DIRS = ['public/slides', 'public/images', 'public/documents', 'public/audio', 'private/imports', 'private/recordings'] as const;
export type StorageDir = (typeof STORAGE_DIRS)[number];

const SHARD_RE = /^[0-9a-f]{2}$/;
const FILE_RE = /^[0-9a-f-]{36}(?:\.[a-z0-9]{1,5}|)$/;
const validKey = (key: string): boolean => {
  const at = key.lastIndexOf('/');
  if (at < 1) return false;
  const dir = key.slice(0, at);
  return (SHARD_RE.test(dir) || (STORAGE_DIRS as readonly string[]).includes(dir)) && FILE_RE.test(key.slice(at + 1));
};

export class FsStorageDriver implements StorageDriver {
  readonly backend = 'FILESYSTEM' as const;
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!validKey(key)) throw new Error('storage_key tidak valid');
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('storage_key keluar dari root');
    return full;
  }

  async put(data: Buffer, ext: string, dir?: StorageDir): Promise<string> {
    const cleanExt = ext.replace(/^\./, '').toLowerCase();
    if (cleanExt !== '' && !/^[a-z0-9]{1,5}$/.test(cleanExt)) throw new Error('ekstensi tidak valid');
    if (dir !== undefined && !STORAGE_DIRS.includes(dir)) throw new Error('direktori penyimpanan tidak valid');
    const id = randomUUID();
    const key = `${dir ?? id.slice(0, 2)}/${id}${cleanExt ? `.${cleanExt}` : ''}`;
    const full = this.resolve(key);
    const priv = dir === 'private/imports' || dir === 'private/recordings';
    await mkdir(path.dirname(full), { recursive: true, mode: priv ? 0o700 : undefined });
    if (priv) {
      // Izin 0700 ditegakkan eksplisit (umask dapat melonggarkan/menyempitkan hasil mkdir rekursif).
      await chmod(path.dirname(full), 0o700);
      await chmod(path.dirname(path.dirname(full)), 0o700).catch(() => undefined);
    }
    try {
      await writeFile(full, data, { flag: 'wx' });
    } catch (e) {
      await rm(full, { force: true }).catch(() => undefined); // tanpa berkas parsial (ENOSPC dsb.)
      throw e;
    }
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async size(key: string): Promise<number> {
    const st = await stat(this.resolve(key));
    if (!st.isFile()) throw new Error('bukan berkas');
    return st.size;
  }

  openRange(key: string, start: number, end: number): ReadableStream<Uint8Array> {
    const node = createReadStream(this.resolve(key), { start, end });
    return Readable.toWeb(node) as unknown as ReadableStream<Uint8Array>;
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

export function getStorage(): StorageDriver {
  if ((process.env.STORAGE_DRIVER ?? 'fs') === 's3') {
    throw new Error('STORAGE_DRIVER=s3 belum diimplementasikan (profil minio); gunakan fs.');
  }
  return new FsStorageDriver(config.assetsDir());
}
