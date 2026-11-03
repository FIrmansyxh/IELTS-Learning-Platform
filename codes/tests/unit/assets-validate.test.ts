import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateAssetFile } from '@/server/content/assets';
import { FsStorageDriver } from '@/server/storage';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'pkg-'));
  await mkdir(path.join(dir, 'assets'), { recursive: true });
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
const put = async (name: string, data: Buffer) => {
  await mkdir(path.dirname(path.join(dir, 'assets', name)), { recursive: true });
  await writeFile(path.join(dir, 'assets', name), data);
};
const check = (file: string, kind: 'SLIDE_IMAGE' | 'IMAGE' | 'DOCUMENT' | 'AUDIO_LISTENING') => validateAssetFile(dir, { file, kind }, 'assets[0].file');
const errCode = (r: Awaited<ReturnType<typeof check>>) => (r.ok ? 'OK' : r.errors[0]!.code);

const CT = '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

/** ZIP minimal (tanpa kompresi) cukup untuk deteksi magic bytes DOCX. */
function zip(entries: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, body] of Object.entries(entries)) {
    const n = Buffer.from(name);
    const b = Buffer.from(body);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(b.length, 18);
    h.writeUInt32LE(b.length, 22);
    h.writeUInt16LE(n.length, 26);
    parts.push(h, n, b);
  }
  return Buffer.concat(parts);
}

function wav(seconds: number): Buffer {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

describe('validateAssetFile', () => {
  it('PNG valid: di-re-encode dan hash dihitung dari byte tersimpan', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer();
    await put('ok.png', png);
    const r = await check('ok.png', 'SLIDE_IMAGE');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.asset.mime).toBe('image/png');
      expect(r.asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.asset.size).toBe(r.asset.data.length);
    }
  });

  it('EXIF dibuang dari JPEG', async () => {
    const jpg = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#aa3300' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'rahasia-pemilik' } })
      .toBuffer();
    expect((await sharp(jpg).metadata()).exif).toBeDefined();
    await put('exif.jpg', jpg);
    const r = await check('exif.jpg', 'IMAGE');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((await sharp(r.asset.data).metadata()).exif).toBeUndefined();
      expect(r.asset.data.includes(Buffer.from('rahasia-pemilik'))).toBe(false);
    }
  });

  it('mime_mismatch: isi bukan gambar/ekstensi tidak cocok; svg_not_allowed; path_traversal; file_not_found', async () => {
    await put('fake.png', Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;', 'binary'));
    expect(errCode(await check('fake.png', 'SLIDE_IMAGE'))).toBe('mime_mismatch');
    await put('pdf-as.png', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'));
    expect(errCode(await check('pdf-as.png', 'SLIDE_IMAGE'))).toBe('mime_mismatch');
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer();
    await put('png-as.jpg', png);
    expect(errCode(await check('png-as.jpg', 'IMAGE'))).toBe('mime_mismatch');
    await put('x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    expect(errCode(await check('x.svg', 'IMAGE'))).toBe('svg_not_allowed');
    expect(errCode(await check('../../etc/passwd', 'IMAGE'))).toBe('path_traversal');
    expect(errCode(await check('a\\b.png', 'IMAGE'))).toBe('path_traversal');
    expect(errCode(await check('/etc/passwd', 'IMAGE'))).toBe('path_traversal');
    expect(errCode(await check('tidak-ada.png', 'IMAGE'))).toBe('file_not_found');
  });

  it('ukuran: gambar > batas ditolak', async () => {
    const big = await sharp({ create: { width: 2400, height: 2400, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 60 } } }).png().toBuffer();
    expect(big.length).toBeGreaterThan(5 * 1_048_576);
    await put('big.png', big);
    expect(errCode(await check('big.png', 'SLIDE_IMAGE'))).toBe('file_too_large');
  });

  it('DOCX: valid lolos; bermakro ditolak (macro_not_allowed)', async () => {
    await put('ok.docx', zip({ '[Content_Types].xml': CT, 'word/document.xml': '<w:document/>' }));
    expect(errCode(await check('ok.docx', 'DOCUMENT'))).toBe('OK');
    await put('macro.docx', zip({ '[Content_Types].xml': CT, 'word/document.xml': '<w:document/>', 'word/vbaProject.bin': 'MZ' }));
    expect(errCode(await check('macro.docx', 'DOCUMENT'))).toBe('macro_not_allowed');
  });

  it('PDF diterima untuk DOCUMENT; audio WAV diterima dan durasi terbaca', async () => {
    await put('ok.pdf', Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'));
    expect(errCode(await check('ok.pdf', 'DOCUMENT'))).toBe('OK');
    await put('a.wav', wav(2));
    const r = await check('a.wav', 'AUDIO_LISTENING');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.asset.durationSec).toBe(2);
    expect(errCode(await check('a.wav', 'IMAGE'))).toBe('mime_mismatch');
  });
});

describe('FsStorageDriver', () => {
  it('menyimpan dengan nama UUID, tidak dapat membaca key di luar root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'store-'));
    const s = new FsStorageDriver(root);
    const key = await s.put(Buffer.from('halo'), 'png');
    expect(key).toMatch(/^[0-9a-f]{2}\/[0-9a-f-]{36}\.png$/);
    expect((await s.get(key)).toString()).toBe('halo');
    expect(await s.exists(key)).toBe(true);
    await s.remove(key);
    expect(await s.exists(key)).toBe(false);
    await expect(s.get('../../etc/passwd')).rejects.toThrow();
    await expect(s.put(Buffer.from('x'), '../x')).rejects.toThrow();
    await rm(root, { recursive: true, force: true });
  });
});
