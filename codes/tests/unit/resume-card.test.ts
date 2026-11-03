import { describe, expect, it } from 'vitest';
import { fallbackTab, positionLabel, resumePath, type CardPosition } from '@/server/resume/card';

const P = (over: Partial<CardPosition>): CardPosition => ({
  tab: 'LEARN',
  subtab: null,
  videoSec: 0,
  questionIndex: null,
  questionCount: null,
  attemptId: null,
  fallback: false,
  ...over,
});
const ATT = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a';

describe('position_label (SPEC-007)', () => {
  it('video dengan detik: mm:ss berpad', () => {
    expect(positionLabel(P({ subtab: 'VIDEO', videoSec: 222 }))).toBe('Video 03:42');
    expect(positionLabel(P({ subtab: 'VIDEO', videoSec: 5 }))).toBe('Video 00:05');
    expect(positionLabel(P({ subtab: 'VIDEO', videoSec: 21600 }))).toBe('Video 360:00');
  });
  it('video detik 0, artikel, subtab null, slide', () => {
    expect(positionLabel(P({ subtab: 'VIDEO' }))).toBe('Video dari awal');
    expect(positionLabel(P({ subtab: 'ARTICLE' }))).toBe('Tab Pelajari - Artikel');
    expect(positionLabel(P({}))).toBe('Tab Pelajari - Artikel');
    expect(positionLabel(P({ subtab: 'SLIDES' }))).toBe('Tab Pelajari - Slide');
  });
  it('latihan dengan/tanpa attempt valid, terapkan, fallback', () => {
    expect(positionLabel(P({ tab: 'DRILL', questionIndex: 3, questionCount: 10, attemptId: ATT }))).toBe('Tab Latihan - Soal 4 dari 10');
    expect(positionLabel(P({ tab: 'DRILL' }))).toBe('Tab Latihan');
    expect(positionLabel(P({ tab: 'MINI_TASK' }))).toBe('Tab Terapkan');
    expect(positionLabel(P({ fallback: true }))).toBe('Sub-modul berikutnya');
  });
});

describe('resume_path (SPEC-007)', () => {
  it('video: tab, sub, t', () => {
    expect(resumePath('2.1.3', P({ subtab: 'VIDEO', videoSec: 222 }))).toBe('/belajar/2.1.3?tab=pelajari&sub=video&t=222');
    expect(resumePath('2.1.3', P({ subtab: 'VIDEO' }))).toBe('/belajar/2.1.3?tab=pelajari&sub=video');
  });
  it('artikel, slide, subtab null', () => {
    expect(resumePath('1.1.1', P({ subtab: 'ARTICLE' }))).toBe('/belajar/1.1.1?tab=pelajari&sub=artikel');
    expect(resumePath('1.1.1', P({ subtab: 'SLIDES' }))).toBe('/belajar/1.1.1?tab=pelajari&sub=slide');
    expect(resumePath('1.1.1', P({}))).toBe('/belajar/1.1.1?tab=pelajari');
  });
  it('latihan: q lalu attempt; tanpa attempt valid tidak ada q/attempt', () => {
    expect(resumePath('2.1.3', P({ tab: 'DRILL', questionIndex: 3, questionCount: 10, attemptId: ATT }))).toBe(`/belajar/2.1.3?tab=latihan&q=3&attempt=${ATT}`);
    expect(resumePath('2.1.3', P({ tab: 'DRILL' }))).toBe('/belajar/2.1.3?tab=latihan');
    expect(resumePath('2.1.3', P({ tab: 'DRILL', attemptId: ATT }))).toBe(`/belajar/2.1.3?tab=latihan&attempt=${ATT}`);
  });
  it('terapkan dan fallback tanpa posisi detail', () => {
    expect(resumePath('2.1.3', P({ tab: 'MINI_TASK' }))).toBe('/belajar/2.1.3?tab=terapkan');
    expect(resumePath('1.1.1', P({ fallback: true, subtab: 'VIDEO', videoSec: 9 }))).toBe('/belajar/1.1.1?tab=pelajari');
  });
});

describe('fallbackTab', () => {
  const s = { learnCompleted: false, completed: false, hasMiniTask: true, miniTaskCompleted: false };
  it('urutan: LEARN, DRILL, MINI_TASK, lalu LEARN', () => {
    expect(fallbackTab(s)).toBe('LEARN');
    expect(fallbackTab({ ...s, learnCompleted: true })).toBe('DRILL');
    expect(fallbackTab({ ...s, learnCompleted: true, completed: true })).toBe('MINI_TASK');
    expect(fallbackTab({ ...s, learnCompleted: true, completed: true, miniTaskCompleted: true })).toBe('LEARN');
    expect(fallbackTab({ ...s, learnCompleted: true, completed: true, hasMiniTask: false })).toBe('LEARN');
  });
});
