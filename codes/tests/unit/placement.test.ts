import { describe, expect, it } from 'vitest';
import {
  pickNextPlacementQuestion,
  computePlacementRecommendation,
  type PlacementHistoryItem,
} from '@/server/exams/placement';
import type { Question } from '@/contracts/content';

function createDummyQuestion(id: string, difficulty: number): Question {
  return {
    question_type: 'MCQ_SINGLE',
    question_id: id,
    skill: 'READING',
    prompt: `Soal ${id} tingkat ${difficulty}`,
    difficulty,
    points: 1,
    options: ['Option A', 'Option B'],
    correct_answers: ['Option A'],
    explanation_id: 'Penjelasan soal',
  };
}

describe('pickNextPlacementQuestion (D3 Staircase Adaptive)', () => {
  const bank: Question[] = [
    createDummyQuestion('q-d1-1', 1),
    createDummyQuestion('q-d1-2', 1),
    createDummyQuestion('q-d2-1', 2),
    createDummyQuestion('q-d2-2', 2),
    createDummyQuestion('q-d3-1', 3),
    createDummyQuestion('q-d3-2', 3),
    createDummyQuestion('q-d3-3', 3),
    createDummyQuestion('q-d4-1', 4),
    createDummyQuestion('q-d4-2', 4),
    createDummyQuestion('q-d5-1', 5),
    createDummyQuestion('q-d5-2', 5),
  ];

  it('memilih soal dengan tingkat kesulitan yang diminta bila tersedia', () => {
    const picked = pickNextPlacementQuestion(bank, [], 3, 'att-test-1');
    expect(picked).not.toBeNull();
    expect(picked?.difficulty).toBe(3);
  });

  it('tidak memilih kembali soal yang sudah pernah disajikan (servedIds)', () => {
    const served = ['q-d3-1', 'q-d3-2'];
    const picked = pickNextPlacementQuestion(bank, served, 3, 'att-test-1');
    expect(picked).not.toBeNull();
    expect(picked?.question_id).toBe('q-d3-3');
    expect(picked?.difficulty).toBe(3);
  });

  it('menggunakan fallback offsets (+1, -1, +2, -2...) jika soal pada tingkat d habis', () => {
    const servedD3 = ['q-d3-1', 'q-d3-2', 'q-d3-3'];
    // Offset +1 mencari d=4 lebih dulu
    const picked = pickNextPlacementQuestion(bank, servedD3, 3, 'att-test-1');
    expect(picked).not.toBeNull();
    expect(picked?.difficulty).toBe(4);
  });

  it('menggunakan offset negatif jika offset positif habis', () => {
    const servedD3AndD4 = [
      'q-d3-1', 'q-d3-2', 'q-d3-3',
      'q-d4-1', 'q-d4-2',
    ];
    // Offset +1 (d=4) habis, fallback ke -1 (d=2)
    const picked = pickNextPlacementQuestion(bank, servedD3AndD4, 3, 'att-test-1');
    expect(picked).not.toBeNull();
    expect(picked?.difficulty).toBe(2);
  });

  it('mengembalikan null bila seluruh bank soal telah disajikan', () => {
    const allIds = bank.map((q) => q.question_id);
    const picked = pickNextPlacementQuestion(bank, allIds, 3, 'att-test-1');
    expect(picked).toBeNull();
  });
});

describe('computePlacementRecommendation (D4 Rekomendasi)', () => {
  it('vektor 1: seluruh 25 soal benar -> ability 5.00 -> Tier 4', () => {
    // 25 jawaban benar berturut-turut
    const history: PlacementHistoryItem[] = [];
    let d = 3;
    for (let i = 1; i <= 25; i++) {
      history.push({ question_id: `q-${i}`, difficulty: d, correct: true });
      d = Math.min(5, d + 1);
    }
    const rec = computePlacementRecommendation(history);
    expect(rec.correct_count).toBe(25);
    expect(rec.served_count).toBe(25);
    expect(rec.ability).toBe(5.0);
    expect(rec.recommended_tier).toBe(4);
  });

  it('vektor 2: seluruh 25 soal salah -> ability 1.00 -> Tier 1', () => {
    // 25 jawaban salah berturut-turut
    const history: PlacementHistoryItem[] = [];
    let d = 3;
    for (let i = 1; i <= 25; i++) {
      history.push({ question_id: `q-${i}`, difficulty: d, correct: false });
      d = Math.max(1, d - 1);
    }
    const rec = computePlacementRecommendation(history);
    expect(rec.correct_count).toBe(0);
    expect(rec.served_count).toBe(25);
    expect(rec.ability).toBe(1.0);
    expect(rec.recommended_tier).toBe(1);
  });

  it('vektor 3: selang-seling benar-salah (benar ganjil, salah genap) -> Tier 3', () => {
    const history: PlacementHistoryItem[] = [];
    let d = 3;
    for (let i = 1; i <= 25; i++) {
      const isCorrect = i % 2 === 1; // 13 benar, 12 salah
      history.push({ question_id: `q-${i}`, difficulty: d, correct: isCorrect });
      d = isCorrect ? Math.min(5, d + 1) : Math.max(1, d - 1);
    }
    const rec = computePlacementRecommendation(history);
    expect(rec.correct_count).toBe(13);
    expect(rec.ability).toBeGreaterThanOrEqual(3.0);
    expect(rec.ability).toBeLessThan(4.0);
    expect(rec.recommended_tier).toBe(3);
  });

  it('vektor 4: selang-seling salah-benar (salah ganjil, benar genap) -> Tier 2', () => {
    const history: PlacementHistoryItem[] = [];
    let d = 3;
    for (let i = 1; i <= 25; i++) {
      const isCorrect = i % 2 === 0; // 12 benar, 13 salah
      history.push({ question_id: `q-${i}`, difficulty: d, correct: isCorrect });
      d = isCorrect ? Math.min(5, d + 1) : Math.max(1, d - 1);
    }
    const rec = computePlacementRecommendation(history);
    expect(rec.correct_count).toBe(12);
    expect(rec.ability).toBeGreaterThanOrEqual(2.0);
    expect(rec.ability).toBeLessThan(3.0);
    expect(rec.recommended_tier).toBe(2);
  });

  it('safeguard: jawaban benar < 32% (< 8 dari 25) selalu merekomendasikan Tier 1', () => {
    const history: PlacementHistoryItem[] = [];
    // 7 jawaban benar pada soal difficulty tinggi, tapi total benar < 8
    for (let i = 1; i <= 25; i++) {
      const isCorrect = i <= 7;
      history.push({ question_id: `q-${i}`, difficulty: 4, correct: isCorrect });
    }
    const rec = computePlacementRecommendation(history);
    expect(rec.correct_count).toBe(7);
    expect(rec.recommended_tier).toBe(1);
  });

  it('membatasi rekomendasi tier pada rentang 1 sampai 4', () => {
    // history kosong
    const emptyRec = computePlacementRecommendation([]);
    expect(emptyRec.recommended_tier).toBe(1);
    expect(emptyRec.ability).toBe(0);
  });
});
