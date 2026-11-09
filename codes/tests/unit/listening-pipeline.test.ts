import { describe, expect, it } from 'vitest';
import {
  computePlannedMs,
  countWords,
  isWithinDurationTolerance,
  verifyAntiClip,
} from '@/server/listening/duration';
import {
  parseListeningScript,
  type ScriptItem,
} from '@/server/listening/script-parser';
import { ffmpegCheck } from '@/server/cli/doctor';

describe('Listening Script Parser (AC-A1, SPEC-024 D2)', () => {
  const validS1Script = `---
part_code: GT-L-S1-001
part_no: 1
title: Pendaftaran Perpustakaan
accent: UK
bank_code: GT-LIS-S1-001
voices:
  A: bf_emma
  B: bm_george
speed:
  A: 1.00
  B: 1.05
target_duration_sec: 420
---
[A] Good morning, City Library. How can I help you?
[B] Hi, I would like to join the library, please.
[pause 2s]
[A] Of course. Could I have your surname?
`;

  it('lulus untuk skrip S1 valid dengan 2 pembicara', () => {
    const { script, issues } = parseListeningScript(validS1Script);
    expect(issues).toHaveLength(0);
    expect(script).toBeDefined();
    expect(script?.meta.part_code).toBe('GT-L-S1-001');
    expect(script?.meta.part_no).toBe(1);
    expect(script?.usedSpeakers).toEqual(['A', 'B']);
    expect(script?.utterances).toHaveLength(3);
    expect(script?.pauses).toHaveLength(1);
    expect(script?.pauses[0].durationSec).toBe(2);
  });

  it('menolak unknown_front_matter_key', () => {
    const bad = validS1Script.replace('target_duration_sec: 420', 'target_duration_sec: 420\nextra_key: 123');
    const { issues } = parseListeningScript(bad);
    expect(issues.some((i) => i.code === 'unknown_front_matter_key')).toBe(true);
  });

  it('menolak part_no_mismatch', () => {
    const bad = validS1Script.replace('part_no: 1', 'part_no: 2');
    const { issues } = parseListeningScript(bad);
    expect(issues.some((i) => i.code === 'part_no_mismatch')).toBe(true);
  });

  it('menolak duplicate_voice', () => {
    const bad = validS1Script.replace('B: bm_george', 'B: bf_emma');
    const { issues } = parseListeningScript(bad);
    expect(issues.some((i) => i.code === 'duplicate_voice')).toBe(true);
  });

  it('menolak speed_out_of_range (1.20 dan 0.90)', () => {
    const badHigh = validS1Script.replace('B: 1.05', 'B: 1.20');
    const resHigh = parseListeningScript(badHigh);
    expect(resHigh.issues.some((i) => i.code === 'speed_out_of_range')).toBe(true);

    const badLow = validS1Script.replace('B: 1.05', 'B: 0.90');
    const resLow = parseListeningScript(badLow);
    expect(resLow.issues.some((i) => i.code === 'speed_out_of_range')).toBe(true);
  });

  it('menolak speaker_without_voice dan voice_without_speaker', () => {
    // Pembicara C di naskah tapi tidak di voices
    const badSpeaker = validS1Script + '[C] Hello there.\n';
    const res1 = parseListeningScript(badSpeaker);
    expect(res1.issues.some((i) => i.code === 'speaker_without_voice')).toBe(true);

    // Voice C di front-matter tapi tidak bicara di naskah
    const badVoice = validS1Script.replace('voices:\n  A: bf_emma\n  B: bm_george', 'voices:\n  A: bf_emma\n  B: bm_george\n  C: bf_isabella\nspeed:\n  A: 1.0\n  B: 1.0\n  C: 1.0');
    const res2 = parseListeningScript(badVoice);
    expect(res2.issues.some((i) => i.code === 'voice_without_speaker')).toBe(true);
  });

  it('menolak pause_invalid (0.3s bukan kelipatan 0.5s, 11s melebihi 10s)', () => {
    const bad1 = validS1Script.replace('[pause 2s]', '[pause 0.3s]');
    expect(parseListeningScript(bad1).issues.some((i) => i.code === 'pause_invalid')).toBe(true);

    const bad2 = validS1Script.replace('[pause 2s]', '[pause 11s]');
    expect(parseListeningScript(bad2).issues.some((i) => i.code === 'pause_invalid')).toBe(true);
  });

  it('menolak line_unparseable untuk format baris tidak dikenal', () => {
    const bad = validS1Script + 'Some random sentence without speaker tag\n';
    const res = parseListeningScript(bad);
    expect(res.issues.some((i) => i.code === 'line_unparseable')).toBe(true);
  });

  it('menolak speaker_count_invalid (S1 dengan 3 pembicara, S2 dengan 2 pembicara)', () => {
    const s1With3 = `---
part_code: GT-L-S1-001
part_no: 1
title: S1 Test
accent: UK
bank_code: GT-LIS-S1-001
voices:
  A: v_a
  B: v_b
  C: v_c
speed:
  A: 1.0
  B: 1.0
  C: 1.0
---
[A] Hi
[B] Hello
[C] Good morning
`;
    expect(parseListeningScript(s1With3).issues.some((i) => i.code === 'speaker_count_invalid')).toBe(true);

    const s2With2 = `---
part_code: GT-L-S2-001
part_no: 2
title: S2 Monologue Test
accent: UK
bank_code: GT-LIS-S2-001
voices:
  A: v_a
  B: v_b
speed:
  A: 1.0
  B: 1.0
---
[A] Welcome to the tour.
[B] Thank you.
`;
    expect(parseListeningScript(s2With2).issues.some((i) => i.code === 'speaker_count_invalid')).toBe(true);
  });

  it('menolak script_too_long bila melebihi 300 ujaran', () => {
    let longBody = '';
    for (let i = 0; i < 305; i++) {
      longBody += i % 2 === 0 ? '[A] Test utterance line\n' : '[B] Response utterance line\n';
    }
    const longScript = `---
part_code: GT-L-S1-001
part_no: 1
title: S1 Long Test
accent: UK
bank_code: GT-LIS-S1-001
voices:
  A: v_a
  B: v_b
speed:
  A: 1.0
  B: 1.0
---
` + longBody;
    expect(parseListeningScript(longScript).issues.some((i) => i.code === 'script_too_long')).toBe(true);
  });
});

describe('Duration & Anti-Clip Rules (AC-A2, AC-A3, AC-A4, SPEC-024 D5)', () => {
  it('AC-A2: computePlannedMs menghitung persis formula D5', () => {
    // 3 ujaran: A -> B (beda pembicara: +600ms), B -> B (sama pembicara: +300ms)
    // Satu jeda 2 detik (2000ms)
    // Hening awal: 1000ms, hening akhir: 1500ms
    const items: ScriptItem[] = [
      { kind: 'UTTERANCE', lineNo: 1, speaker: 'A', text: 'Hello' },
      { kind: 'PAUSE', lineNo: 2, durationSec: 2 },
      { kind: 'UTTERANCE', lineNo: 3, speaker: 'B', text: 'Hi there' },
      { kind: 'UTTERANCE', lineNo: 4, speaker: 'B', text: 'How are you' },
    ];
    const segmentMs = [1200, 1400, 1600]; // Total segmen = 4200ms

    // Expected:
    // Hening awal: 1000ms
    // Hening akhir: 1500ms
    // Segmen: 1200 + 1400 + 1600 = 4200ms
    // Jeda eksplisit: 2000ms
    // Jeda implisit: A ke B = 600ms, B ke B = 300ms
    // Total planned_ms = 1000 + 1500 + 4200 + 2000 + 600 + 300 = 9600ms
    const planned = computePlannedMs(items, segmentMs);
    expect(planned).toBe(9600);
  });

  it('AC-A3: toleransi durasi 5% (lulus pada 4% lebih pendek, gagal pada 6% lebih pendek)', () => {
    const planned = 10000;
    const dur4PercentShort = 9600; // 4% selisih
    const dur6PercentShort = 9400; // 6% selisih

    expect(isWithinDurationTolerance(dur4PercentShort, planned)).toBe(true);
    expect(isWithinDurationTolerance(dur6PercentShort, planned)).toBe(false);
  });

  it('AC-A4: verifyAntiClip menolak segmen 0.3s untuk 20 kata (segment_suspect)', () => {
    const text20Words = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty';
    expect(countWords(text20Words)).toBe(20);

    // Batas min untuk 20 kata = 0.12 * 20 = 2.4 detik
    // Durasi 0.3 detik harus ditolak
    const res = verifyAntiClip(text20Words, 0.3);
    expect(res.valid).toBe(false);
    expect(res.minDurationSec).toBe(2.4);

    // Durasi wajar (misal 5.0 detik) harus lulus
    expect(verifyAntiClip(text20Words, 5.0).valid).toBe(true);

    // Volume <= -50 dB harus ditolak
    expect(verifyAntiClip(text20Words, 5.0, -52.0).valid).toBe(false);
  });
});

describe('Doctor Listening Check (AC-A11)', () => {
  it('ffmpegCheck mengembalikan status ok atau warn (bukan fail)', async () => {
    const check = await ffmpegCheck();
    expect(check.name).toBe('Alat audio (Listening)');
    expect(['ok', 'warn']).toContain(check.status);
    expect(check.status).not.toBe('fail');
  });
});
