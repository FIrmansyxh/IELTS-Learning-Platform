import { describe, expect, it } from 'vitest';
import { parseAudioRange } from '@/server/attempts/audio-range';

const SIZE = 4_812_344;

describe('parseAudioRange (SPEC-011)', () => {
  it('tanpa header / satuan selain bytes / multi-rentang -> full', () => {
    expect(parseAudioRange(null, SIZE)).toEqual({ kind: 'full' });
    expect(parseAudioRange('', SIZE)).toEqual({ kind: 'full' });
    expect(parseAudioRange('items=0-5', SIZE)).toEqual({ kind: 'full' });
    expect(parseAudioRange('bytes=0-9,20-29', SIZE)).toEqual({ kind: 'full' });
  });

  it('rentang eksplisit, ujung terbuka, ujung dipotong ke total-1', () => {
    expect(parseAudioRange('bytes=0-1023', SIZE)).toEqual({ kind: 'range', start: 0, end: 1023 });
    expect(parseAudioRange('bytes=100-', SIZE)).toEqual({ kind: 'range', start: 100, end: SIZE - 1 });
    expect(parseAudioRange('bytes=10-99999999', SIZE)).toEqual({ kind: 'range', start: 10, end: SIZE - 1 });
    expect(parseAudioRange(`bytes=${SIZE - 1}-${SIZE - 1}`, SIZE)).toEqual({ kind: 'range', start: SIZE - 1, end: SIZE - 1 });
    expect(parseAudioRange(' BYTES=5-6 ', SIZE)).toEqual({ kind: 'range', start: 5, end: 6 });
  });

  it('sufiks bytes=-500 = 500 byte terakhir; sufiks lebih besar dari berkas = seluruh berkas', () => {
    expect(parseAudioRange('bytes=-500', SIZE)).toEqual({ kind: 'range', start: SIZE - 500, end: SIZE - 1 });
    expect(parseAudioRange('bytes=-99999999', SIZE)).toEqual({ kind: 'range', start: 0, end: SIZE - 1 });
  });

  it('tidak valid -> invalid (416)', () => {
    for (const h of ['bytes=9999999-', `bytes=${SIZE}-`, 'bytes=10-5', 'bytes=-', 'bytes=-0', 'bytes=abc', 'bytes=1-2-3', 'bytes=', 'bytes=99999999999999999999-']) {
      expect(parseAudioRange(h, SIZE), h).toEqual({ kind: 'invalid' });
    }
  });

  it('berkas kosong: rentang apa pun tidak terpenuhi', () => {
    expect(parseAudioRange('bytes=0-0', 0)).toEqual({ kind: 'invalid' });
    expect(parseAudioRange('bytes=-5', 0)).toEqual({ kind: 'invalid' });
    expect(parseAudioRange(null, 0)).toEqual({ kind: 'full' });
  });
});
