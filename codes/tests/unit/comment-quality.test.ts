import { describe, expect, it } from 'vitest';
import { findGenericComments, isGenericComment } from '@/server/ai/comment-quality';
import { MockLlmClient } from '@/server/ai/llm';
import { WritingEvaluationOutputSchema } from '@/contracts/ai';

describe('isGenericComment', () => {
  it.each([
    '',
    'K1',
    'komentar1',
    'komentar1_1_5.5',
    'T1-1',
    'Komentar mengenai pencapaian tugas',
    'Komentar mengenai koherensi dan kohesi',
    'Komentar mengenai sumber daya leksikal',
    'Komentar mengenai rentang dan ketepatan tata bahasa',
    'Keterangan tentang respons tugas',
  ])('menolak label/placeholder: %j', (text) => {
    expect(isGenericComment(text)).toBe(true);
  });

  it.each([
    'Menjawab sebagian besar tugas dengan argumen pendukung.',
    'Komentar mengenai pencapaian tugas menunjukkan bahwa surat tidak memenuhi semua poin penting yang diminta.',
    'Keterangan tentang respons tugas menunjukkan bahwa siswa telah mencoba menjawab semua bagian pertanyaan.',
    "Poin ketiga (saran untuk dewan kota) hanya disebut sekilas dan tidak dikembangkan.",
    'Penggunaan "can not" seharusnya "cannot".',
  ])('menerima kalimat yang berisi penilaian: %j', (text) => {
    expect(isGenericComment(text)).toBe(false);
  });
});

describe('findGenericComments', () => {
  /** Keluaran contoh dari MockLlmClient (semua komentarnya berisi). */
  async function sample() {
    const r = await new MockLlmClient().generate({ systemPrompt: '', userPrompt: '' });
    return WritingEvaluationOutputSchema.parse(JSON.parse(r.content));
  }

  it('kosong untuk keluaran contoh yang berisi', async () => {
    expect(findGenericComments(await sample())).toEqual([]);
  });

  it('melaporkan jalur bidang yang generik', async () => {
    const out = await sample();
    out.criteria.task_response.comment_id = 'Komentar mengenai pencapaian tugas';
    out.criteria.lexical.comment_id = 'K1';
    expect(findGenericComments(out)).toEqual(['criteria.task_response.comment_id', 'criteria.lexical.comment_id']);
  });
});
