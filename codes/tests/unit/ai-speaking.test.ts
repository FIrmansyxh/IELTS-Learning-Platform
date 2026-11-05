import { describe, expect, it } from 'vitest';
import { detectAudioMime } from '@/server/ai/audio';
import { postProcessSpeakingScores } from '@/server/ai/speaking-scoring';
import { MockSttClient } from '@/server/ai/stt';
import { ApiError } from '@/server/http/errors';

describe('AI Speaking Scoring & Audio Validation (SPEC-013)', () => {
  describe('detectAudioMime', () => {
    it('mendeteksi WebM EBML header (1A 45 DF A3)', () => {
      const buffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00]);
      const result = detectAudioMime(buffer);
      expect(result.mimeType).toBe('audio/webm');
      expect(result.extension).toBe('webm');
    });

    it('mendeteksi OGG header (OggS: 4F 67 67 53)', () => {
      const buffer = Buffer.from([0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00]);
      const result = detectAudioMime(buffer);
      expect(result.mimeType).toBe('audio/ogg');
      expect(result.extension).toBe('ogg');
    });

    it('mendeteksi MP4/M4A ftyp header (offset 4: 66 74 79 70)', () => {
      const buffer = Buffer.from([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20,
      ]);
      const result = detectAudioMime(buffer);
      expect(result.mimeType).toBe('audio/mp4');
      expect(result.extension).toBe('m4a');
    });

    it('melempar ApiError UNSUPPORTED_AUDIO_TYPE jika magic bytes tidak cocok', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG
      expect(() => detectAudioMime(buffer)).toThrow(ApiError);

      const shortBuffer = Buffer.from([0x01, 0x02]);
      expect(() => detectAudioMime(shortBuffer)).toThrow(ApiError);
    });
  });

  describe('postProcessSpeakingScores', () => {
    const baseCriteria = {
      fluency: 7.0,
      lexical: 7.0,
      grammar: 7.0,
      pronunciation: 7.0,
    };

    it('menghitung rata-rata band dan membulatkan ke half-band terdekat', () => {
      const result = postProcessSpeakingScores({
        criteria: {
          fluency: 6.0,
          lexical: 6.5,
          grammar: 7.0,
          pronunciation: 6.5,
        },
        kind: 'SPEAKING_PART1',
        wordCount: 100,
        durationSec: 45,
        isInjection: false,
        isNonEnglish: false,
        sttConfidence: 0.85,
      });

      // Mean: (6 + 6.5 + 7 + 6.5) / 4 = 26 / 4 = 6.5
      expect(result.overallBand).toBe(6.5);
      expect(result.flags.pronunciation_estimated).toBe(true);
      expect(result.flags.low_audio_quality).toBe(false);
      expect(result.flags.score_capped).toBe(false);
    });

    it('menerapkan durasi cap untuk SPEAKING_PART2 (< 30s -> kap 4.0)', () => {
      const result = postProcessSpeakingScores({
        criteria: baseCriteria,
        kind: 'SPEAKING_PART2',
        wordCount: 50,
        durationSec: 25,
        isInjection: false,
        isNonEnglish: false,
        sttConfidence: 0.9,
      });

      expect(result.overallBand).toBe(4.0);
      expect(result.flags.score_capped).toBe(true);
      expect(result.flags.cap_reason).toBe('duration');
    });

    it('menerapkan durasi cap untuk MINI_TASK_SPEAKING (30s <= durasi < 60s -> kap 5.5)', () => {
      const result = postProcessSpeakingScores({
        criteria: baseCriteria,
        kind: 'MINI_TASK_SPEAKING',
        wordCount: 80,
        durationSec: 45,
        isInjection: false,
        isNonEnglish: false,
        sttConfidence: 0.88,
      });

      expect(result.overallBand).toBe(5.5);
      expect(result.flags.score_capped).toBe(true);
      expect(result.flags.cap_reason).toBe('duration');
    });

    it('Part 1 dan Part 3 TIDAK terkena durasi cap meskipun durasi < 30s', () => {
      const result = postProcessSpeakingScores({
        criteria: baseCriteria,
        kind: 'SPEAKING_PART1',
        wordCount: 30,
        durationSec: 15,
        isInjection: false,
        isNonEnglish: false,
        sttConfidence: 0.9,
      });

      expect(result.overallBand).toBe(7.0);
      expect(result.flags.score_capped).toBe(false);
    });

    it('menerapkan word count cap (< 15 kata -> kap 4.0)', () => {
      const result = postProcessSpeakingScores({
        criteria: baseCriteria,
        kind: 'SPEAKING_PART1',
        wordCount: 10,
        durationSec: 12,
        isInjection: false,
        isNonEnglish: false,
        sttConfidence: 0.85,
      });

      expect(result.overallBand).toBe(4.0);
      expect(result.flags.score_capped).toBe(true);
      expect(result.flags.cap_reason).toBe('word_count');
    });

    it('menerapkan non-English cap (isNonEnglish -> kap 4.0)', () => {
      const result = postProcessSpeakingScores({
        criteria: baseCriteria,
        kind: 'SPEAKING_PART2',
        wordCount: 80,
        durationSec: 75,
        isInjection: false,
        isNonEnglish: true,
        sttConfidence: 0.9,
      });

      expect(result.overallBand).toBe(4.0);
      expect(result.flags.non_english_suspected).toBe(true);
      expect(result.flags.cap_reason).toBe('non_english');
    });

    it('menerapkan high band cap (>= 8.0 -> kap 7.5)', () => {
      const result = postProcessSpeakingScores({
        criteria: {
          fluency: 8.5,
          lexical: 8.5,
          grammar: 8.0,
          pronunciation: 8.5,
        },
        kind: 'SPEAKING_PART2',
        wordCount: 180,
        durationSec: 100,
        isInjection: false,
        isNonEnglish: false,
        sttConfidence: 0.95,
      });

      // Raw mean = (8.5+8.5+8.0+8.5)/4 = 33.5/4 = 8.375 -> 8.5, capped to 7.5
      expect(result.overallBand).toBe(7.5);
      expect(result.flags.high_band_capped).toBe(true);
    });

    it('menandai low_audio_quality jika confidence < 0.5', () => {
      const result = postProcessSpeakingScores({
        criteria: baseCriteria,
        kind: 'SPEAKING_PART2',
        wordCount: 90,
        durationSec: 80,
        isInjection: false,
        isNonEnglish: false,
        sttConfidence: 0.35,
      });

      expect(result.flags.low_audio_quality).toBe(true);
    });
  });

  describe('MockSttClient', () => {
    it('mengembalikan transkrip mock dan keyakinan tinggi', async () => {
      const client = new MockSttClient();
      const res = await client.transcribe('dummy/path.wav', { language: 'en' });

      expect(res.text.length).toBeGreaterThan(50);
      expect(res.confidence).toBeGreaterThan(0.8);
      expect(res.engine).toContain('mock-stt');
      expect(res.segments.length).toBeGreaterThan(0);
    });
  });
});
