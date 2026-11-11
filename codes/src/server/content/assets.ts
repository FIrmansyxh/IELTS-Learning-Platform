import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq, isNotNull } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { contentAssets, contentSources } from '@/db/schema';
import type { AssetManifest, AssetRegistrationType, ContentIssue } from '@/contracts/content';
import type { Tx } from '../db';
import { getStorage, type StorageDriver } from '../storage';

const MB = 1_048_576;
const limitMb = (name: string, def: number) => Number(process.env[name] ?? def) || def;

const IMAGE_MIMES: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const AUDIO_MIMES: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/vnd.wave': 'wav',
  'audio/x-wav': 'wav',
};
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXT_TO_MIMES: Record<string, string[]> = {
  '.webp': ['image/webp'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.pdf': ['application/pdf'],
  '.docx': [DOCX_MIME],
  '.mp3': ['audio/mpeg'],
  '.ogg': ['audio/ogg'],
  '.wav': ['audio/wav', 'audio/vnd.wave', 'audio/x-wav'],
};

export interface ValidatedAsset {
  data: Buffer; // byte yang akan disimpan (gambar sudah di-re-encode tanpa EXIF)
  mime: string;
  ext: string;
  size: number;
  sha256: string;
  durationSec: number | null;
}

const err = (path: string, code: string, message: string): ContentIssue => ({ path, code, message, severity: 'error' });

/** Durasi lewat ffprobe; null bila ffprobe tidak ada. */
function ffprobeDuration(file: string): Promise<number | null | 'missing'> {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { windowsHide: true });
    } catch {
      resolve('missing');
      return;
    }
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', () => resolve('missing'));
    child.on('close', (code) => {
      const n = Number.parseFloat(out.trim());
      resolve(code === 0 && Number.isFinite(n) ? Math.round(n) : null);
    });
  });
}

/** Cadangan tanpa ffprobe: durasi WAV dari header RIFF. */
function wavDuration(buf: Buffer): number | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  let byteRate = 0;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') byteRate = buf.readUInt32LE(off + 16);
    if (id === 'data') return byteRate > 0 ? Math.round(size / byteRate) : null;
    off += 8 + size + (size % 2);
  }
  return null;
}

/**
 * Validasi satu berkas aset (security-standards 4.2): path, ekstensi, magic bytes, ukuran,
 * makro DOCX, re-encode gambar. `baseDir` = direktori paket; berkas dibaca di bawah `baseDir/assets/`.
 */
export async function validateAssetFile(
  baseDir: string,
  a: Pick<AssetRegistrationType, 'file' | 'kind'>,
  issuePath: string,
): Promise<{ ok: true; asset: ValidatedAsset; warnings: ContentIssue[] } | { ok: false; errors: ContentIssue[] }> {
  const fail = (code: string, message: string) => ({ ok: false as const, errors: [err(issuePath, code, message)] });
  if (a.file.includes('\\') || a.file.startsWith('/') || /^[A-Za-z]:/.test(a.file) || a.file.split('/').includes('..')) {
    return fail('path_traversal', 'Path berkas tidak boleh memuat .., \\, atau path absolut.');
  }
  const ext = path.extname(a.file).toLowerCase();
  if (ext === '.svg') return fail('svg_not_allowed', 'SVG ditolak.');
  const root = path.resolve(baseDir, 'assets');
  const full = path.resolve(root, a.file);
  if (!full.startsWith(root + path.sep)) return fail('path_traversal', 'Path berkas keluar dari direktori assets/.');
  let st;
  try {
    st = await stat(full);
  } catch {
    return fail('file_not_found', `Berkas '${a.file}' tidak ditemukan.`);
  }
  if (!st.isFile()) return fail('file_not_found', `'${a.file}' bukan berkas.`);

  const maxMb =
    a.kind === 'AUDIO_LISTENING'
      ? limitMb('UPLOAD_MAX_MB_AUDIO_ASSET', 50)
      : a.kind === 'DOCUMENT'
        ? limitMb('UPLOAD_MAX_MB_DOCUMENT', 25)
        : limitMb('UPLOAD_MAX_MB_IMAGE', 5);
  if (st.size > maxMb * MB) return fail('file_too_large', `Berkas melebihi ${maxMb} MB.`);

  const buf = await readFile(full);
  const ft = await fileTypeFromBuffer(buf);
  const detected = ft?.mime;
  const warnings: ContentIssue[] = [];

  const allowed =
    a.kind === 'SLIDE_IMAGE' || a.kind === 'IMAGE'
      ? Object.keys(IMAGE_MIMES)
      : a.kind === 'AUDIO_LISTENING'
        ? Object.keys(AUDIO_MIMES)
        : ['application/pdf', DOCX_MIME];
  if (!detected || !allowed.includes(detected)) {
    return fail(detected ? 'mime_mismatch' : 'unsupported_file_type', `Jenis berkas ${detected ?? 'tidak dikenal'} tidak diizinkan untuk ${a.kind}.`);
  }
  const extMimes = EXT_TO_MIMES[ext];
  if (!extMimes || !extMimes.includes(detected)) {
    return fail('mime_mismatch', `Ekstensi ${ext || '(kosong)'} tidak sesuai isi berkas (${detected}).`);
  }

  const done = await processDetected(buf, detected, a.kind, issuePath, { filePath: full, strictAudio: false });
  if (!done.ok) return done;
  return { ok: true, asset: done.asset, warnings: [...warnings, ...done.warnings] };
}

interface ProcessOptions {
  /** Berkas di disk (dipakai ffprobe langsung). Bila kosong, byte ditulis ke berkas sementara. */
  filePath?: string;
  /** true (unggah web): audio wajib terbaca; tanpa ffprobe hanya WAV yang dapat diterima. */
  strictAudio: boolean;
}
type Processed = { ok: true; asset: ValidatedAsset; warnings: ContentIssue[] } | { ok: false; errors: ContentIssue[] };

const hasZipEnd = (buf: Buffer) => buf.subarray(Math.max(0, buf.length - 66_000)).includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]));

/** Pemrosesan setelah MIME terdeteksi dan diizinkan: makro/struktur DOCX, re-encode gambar, durasi audio. */
async function processDetected(buf: Buffer, detected: string, kind: string, issuePath: string, o: ProcessOptions): Promise<Processed> {
  const fail = (code: string, message: string) => ({ ok: false as const, errors: [err(issuePath, code, message)] });
  const warnings: ContentIssue[] = [];
  if (kind === 'DOCUMENT' && detected === DOCX_MIME) {
    if (buf.includes(Buffer.from('vbaProject.bin'))) return fail('macro_not_allowed', 'DOCX bermakro ditolak.');
    if ((o.strictAudio && !hasZipEnd(buf)) || !buf.includes(Buffer.from('word/document.xml')) || !buf.includes(Buffer.from('[Content_Types].xml'))) {
      return fail('docx_invalid', 'Struktur DOCX tidak valid.');
    }
  }

  let data = buf;
  let durationSec: number | null = null;
  if (kind === 'SLIDE_IMAGE' || kind === 'IMAGE') {
    const fmt = IMAGE_MIMES[detected] === 'jpg' ? 'jpeg' : (IMAGE_MIMES[detected] as 'webp' | 'png');
    try {
      // rotate() menerapkan orientasi EXIF; sharp membuang metadata (EXIF) bila withMetadata tidak dipakai.
      data = await sharp(buf, { limitInputPixels: 50_000_000 }).rotate().toFormat(fmt).toBuffer();
    } catch {
      return fail('image_unreadable', 'Gambar tidak dapat dibaca.');
    }
  } else if (kind === 'AUDIO_LISTENING') {
    let tmpDir: string | null = null;
    let probePath = o.filePath;
    try {
      if (!probePath) {
        tmpDir = await mkdtemp(path.join(tmpdir(), 'probe-'));
        probePath = path.join(tmpDir, `in.${AUDIO_MIMES[detected] ?? 'bin'}`);
        await writeFile(probePath, buf);
      }
      const d = await ffprobeDuration(probePath);
      const isWav = detected.includes('wav') || detected === 'audio/vnd.wave';
      if (d === 'missing') {
        durationSec = isWav ? wavDuration(buf) : null;
        if (durationSec === null) {
          if (o.strictAudio) return fail('audio_unreadable', 'Durasi audio tidak dapat dibaca (ffprobe tidak tersedia atau berkas korup).');
          warnings.push({ path: issuePath, code: 'ffprobe_unavailable', message: 'ffprobe tidak tersedia; duration_sec dikosongkan.', severity: 'warning' });
        }
      } else if (d === null) {
        if (o.strictAudio || isWav) return fail('audio_unreadable', 'Berkas audio tidak dapat dibaca.');
        durationSec = null;
      } else durationSec = d;
    } finally {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  const outExt = IMAGE_MIMES[detected] ?? AUDIO_MIMES[detected] ?? (detected === 'application/pdf' ? 'pdf' : 'docx');
  return {
    ok: true,
    warnings,
    asset: {
      data,
      mime: detected,
      ext: outExt,
      size: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      durationSec,
    },
  };
}

/**
 * Validasi aset dari byte yang diunggah lewat web (SPEC-018): ekstensi/Content-Type klien diabaikan, MIME dari magic bytes.
 * Kode galat: unsupported_file_type (termasuk SVG/EXE), macro_not_allowed, docx_invalid, image_unreadable, audio_unreadable.
 */
export async function validateAssetBytes(buf: Buffer, kind: string, issuePath = 'file'): Promise<Processed> {
  const fail = (code: string, message: string) => ({ ok: false as const, errors: [err(issuePath, code, message)] });
  const ft = await fileTypeFromBuffer(buf);
  const detected = ft?.mime;
  if (detected && detected.includes('macroEnabled')) return fail('macro_not_allowed', 'Dokumen bermakro ditolak.');
  if (detected === 'application/zip' && kind === 'DOCUMENT') return fail('docx_invalid', 'Struktur DOCX tidak valid.');
  const allowed =
    kind === 'SLIDE_IMAGE' || kind === 'IMAGE'
      ? Object.keys(IMAGE_MIMES)
      : kind === 'AUDIO_LISTENING'
        ? Object.keys(AUDIO_MIMES)
        : ['application/pdf', DOCX_MIME];
  if (!detected || !allowed.includes(detected)) return fail('unsupported_file_type', 'Jenis berkas tidak didukung.');
  return processDetected(buf, detected, kind, issuePath, { strictAudio: true });
}

export interface RegisterOutcome {
  created: number;
  unchanged: number;
  /** storage_key yang baru disalin; hapus bila transaksi pemanggil gagal. */
  copiedKeys: string[];
  errors: ContentIssue[];
}

/**
 * AssetRegistryService.registerFromManifest: validasi berkas, salin ke storage (nama UUID), isi baris content_assets.
 * Idempoten: asset_code sama dengan sha256 sama = NOOP; sha berbeda = `asset_code_conflict`; sha sama dengan kode lain = `duplicate_file`.
 */
export async function registerFromManifest(
  tx: Tx,
  manifest: AssetManifest,
  baseDir: string,
  actorUserId: string | null,
  storage: StorageDriver = getStorage(),
): Promise<RegisterOutcome> {
  const out: RegisterOutcome = { created: 0, unchanged: 0, copiedKeys: [], errors: [] };
  const sources = new Map((await tx.select({ id: contentSources.id, code: contentSources.code }).from(contentSources)).map((s) => [s.code, s.id]));
  for (const [i, a] of manifest.assets.entries()) {
    const p = `assets[${i}]`;
    const v = await validateAssetFile(baseDir, a, `${p}.file`);
    if (!v.ok) {
      out.errors.push(...v.errors);
      continue;
    }
    const sourceId = sources.get(a.source_code);
    if (!sourceId) {
      out.errors.push(err(`${p}.source_code`, 'source_not_found', `Sumber '${a.source_code}' tidak dikenal.`));
      continue;
    }
    const [byCode] = await tx.select().from(contentAssets).where(eq(contentAssets.assetCode, a.asset_code));
    if (byCode) {
      if (byCode.sha256 === v.asset.sha256) out.unchanged++;
      else out.errors.push(err(`${p}.asset_code`, 'asset_code_conflict', `asset_code '${a.asset_code}' sudah dipakai berkas lain.`));
      continue;
    }
    const [bySha] = await tx
      .select({ code: contentAssets.assetCode })
      .from(contentAssets)
      .where(and(eq(contentAssets.sha256, v.asset.sha256), isNotNull(contentAssets.sha256)));
    if (bySha) {
      out.errors.push(err(`${p}.file`, 'duplicate_file', `Berkas identik sudah terdaftar sebagai '${bySha.code ?? '(tanpa kode)'}'.`));
      continue;
    }
    const key = await storage.put(v.asset.data, v.asset.ext);
    out.copiedKeys.push(key);
    await tx.insert(contentAssets).values({
      assetCode: a.asset_code,
      kind: a.kind,
      title: a.title,
      sourceId,
      rightsStatus: a.rights_status as 'OWN_ORIGINAL' | 'VERIFIED_OPEN' | 'UNVERIFIED',
      storageBackend: storage.backend,
      storageKey: key,
      mimeType: v.asset.mime,
      sizeBytes: v.asset.size,
      sha256: v.asset.sha256,
      durationSec: v.asset.durationSec,
      attributionText: a.attribution_text ?? null,
      createdBy: actorUserId,
    });
    out.created++;
  }
  return out;
}

/** Batas ukuran unggah per `kind` (SPEC-018 Matriks Unggah), dalam byte. */
export function uploadLimitBytes(kind: string): number {
  const mb =
    kind === 'AUDIO_LISTENING'
      ? limitMb('UPLOAD_MAX_MB_AUDIO_ASSET', 50)
      : kind === 'DOCUMENT'
        ? limitMb('UPLOAD_MAX_MB_DOCUMENT', 25)
        : limitMb('UPLOAD_MAX_MB_IMAGE', 5);
  return mb * MB;
}
