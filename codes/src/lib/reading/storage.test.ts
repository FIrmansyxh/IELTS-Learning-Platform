// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePassages } from './parsePassages';
import {
  clampSplit,
  clearAttemptStorage,
  clearExamStorage,
  loadAudioPosition,
  loadFlags,
  loadHighlights,
  loadSplit,
  saveAudioPosition,
  saveFlags,
  saveHighlights,
  saveSplit,
} from './storage';
import { DRAFT_TTL_MS, loadDraft, pruneExpiredDrafts, saveDraft } from '@/lib/ai/draft';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('storage Reading/Listening', () => {
  it('split: default 50, dibatasi 35-65, tahan data rusak', () => {
    expect(loadSplit()).toBe(50);
    saveSplit(90);
    expect(loadSplit()).toBe(65);
    saveSplit(10);
    expect(loadSplit()).toBe(35);
    window.localStorage.setItem('split:v1', '{"ratio":"x"}');
    expect(loadSplit()).toBe(50);
    window.localStorage.setItem('split:v1', 'bukan json');
    expect(loadSplit()).toBe(50);
    expect(clampSplit(Number.NaN)).toBe(50);
  });

  it('flag dan posisi audio: round-trip dan nilai tidak valid diabaikan', () => {
    saveFlags('a1', new Set(['Q1', 'Q2']));
    expect(loadFlags('a1')).toEqual(['Q1', 'Q2']);
    window.localStorage.setItem('flag:v1:a2', '[1,"Q9",null]');
    expect(loadFlags('a2')).toEqual(['Q9']);
    expect(loadAudioPosition('a1')).toBeNull();
    saveAudioPosition('a1', 61.9);
    expect(loadAudioPosition('a1')).toBe(61);
    window.localStorage.setItem('audio:v1:a3', '{"position_sec":-4}');
    expect(loadAudioPosition('a3')).toBeNull();
  });

  it('sorotan: hanya yang valid terhadap panjang paragraf; maks 200', () => {
    const passages = parsePassages('Halo dunia.');
    saveHighlights('a1', [
      { id: '1', passage_no: 1, paragraph_index: 0, start: 0, end: 4, color: 'yellow' },
      { id: '2', passage_no: 1, paragraph_index: 0, start: 4, end: 4, color: 'yellow' },
      { id: '3', passage_no: 1, paragraph_index: 0, start: 0, end: 99, color: 'green' },
      { id: '4', passage_no: 2, paragraph_index: 0, start: 0, end: 1, color: 'green' },
    ]);
    expect(loadHighlights('a1', passages).map((h) => h.id)).toEqual(['1']);
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `h${i}`, passage_no: 1, paragraph_index: 0, start: 0, end: 2, color: 'yellow' }));
    window.localStorage.setItem('hl:v1:a2', JSON.stringify(many));
    expect(loadHighlights('a2', passages)).toHaveLength(200);
  });

  it('akses penyimpanan yang melempar galat tidak melempar ke pemanggil', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('x');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('x');
    });
    expect(() => saveSplit(40)).not.toThrow();
    expect(loadSplit()).toBe(50);
    expect(loadFlags('a')).toEqual([]);
    expect(() => saveAudioPosition('a', 3)).not.toThrow();
  });

  it('F-10-03: clearExamStorage menghapus hl/flag/audio/split; clearAttemptStorage hanya attempt itu', () => {
    saveHighlights('a', []);
    saveFlags('a', ['q']);
    saveAudioPosition('a', 3);
    saveFlags('b', ['q']);
    saveSplit(40);
    window.localStorage.setItem('lain', '1');
    clearAttemptStorage('a');
    expect(window.localStorage.getItem('flag:v1:a')).toBeNull();
    expect(window.localStorage.getItem('audio:v1:a')).toBeNull();
    expect(window.localStorage.getItem('flag:v1:b')).not.toBeNull();
    clearExamStorage();
    expect(window.localStorage.getItem('flag:v1:b')).toBeNull();
    expect(window.localStorage.getItem('split:v1')).toBeNull();
    expect(window.localStorage.getItem('lain')).toBe('1');
  });
});

describe('F-12-04: draf & submission aktif AI', () => {
  it('clearExamStorage menghapus semua draft:v1: dan ai-sub:v1: (semua user)', () => {
    window.localStorage.setItem('draft:v1:u1:s:mini', 'x');
    window.localStorage.setItem('draft:v1:u2:a:q', 'x');
    window.localStorage.setItem('ai-sub:v1:u1:s:mini', 'x');
    window.localStorage.setItem('lain', '1');
    clearExamStorage();
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem('lain')).toBe('1');
  });

  it('draf: roundtrip, kedaluwarsa setelah TTL dihapus, format lama dibuang, prune', () => {
    const now = 1_000_000_000_000;
    expect(saveDraft('draft:v1:u:s:mini', 'halo', now)).toBe(true);
    expect(loadDraft('draft:v1:u:s:mini', now + DRAFT_TTL_MS - 1)).toBe('halo');
    expect(loadDraft('draft:v1:u:s:mini', now + DRAFT_TTL_MS + 1)).toBe('');
    expect(window.localStorage.getItem('draft:v1:u:s:mini')).toBeNull();
    window.localStorage.setItem('draft:v1:u:lama', 'teks polos');
    saveDraft('draft:v1:u:basi', 'x', now);
    saveDraft('draft:v1:u:segar', 'y', now + DRAFT_TTL_MS);
    pruneExpiredDrafts(now + DRAFT_TTL_MS + 5);
    expect(window.localStorage.getItem('draft:v1:u:lama')).toBeNull();
    expect(window.localStorage.getItem('draft:v1:u:basi')).toBeNull();
    expect(window.localStorage.getItem('draft:v1:u:segar')).not.toBeNull();
  });
});
