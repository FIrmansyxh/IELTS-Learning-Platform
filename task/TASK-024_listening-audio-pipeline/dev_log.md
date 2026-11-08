# Dev Log TASK-024: Pipeline Konten Listening General Training

Spec: `specifications/024_spec_listening_audio_pipeline.md`

## 2026-11-08 - Tooling & Parser Skrip (Developer)
- Mengimplementasikan parser dan validator skrip format Markdown D2 di `codes/src/server/listening/script-parser.ts`:
  - Validasi front-matter: `part_code`, `part_no`, `title`, `accent`, `bank_code`, `voices`, `speed`, `target_duration_sec`.
  - Penegakan kode galat D2: `part_code_invalid`, `part_no_mismatch`, `speaker_count_invalid`, `speaker_without_voice`, `voice_without_speaker`, `duplicate_voice`, `speed_out_of_range`, `pause_invalid`, `line_unparseable`, `script_too_long`, `unknown_front_matter_key`.
- Mengimplementasikan formula durasi dan anti-klip di `codes/src/server/listening/duration.ts`:
  - `computePlannedMs`: formula persis D5 (durasi ujaran + jeda eksplisit + jeda implisit 600ms/300ms + hening 1000ms/1500ms).
  - `estimateDurationMs`: estimasi kata per 2.5 x kecepatan.
  - `verifyAntiClip`: batas durasi kata (0.12 s/d 1.5 kata) dan deteksi volume rata-rata > -50 dB.
  - `isWithinDurationTolerance`: toleransi 5% terhadap planned ms.
- Mengimplementasikan offline generator engine di `codes/src/server/listening/builder.ts`:
  - Langkah a s/d g: validasi skrip, pemeriksaan lingkungan (TTS_ENGINE_CMD & ffmpeg), sintesis segmen, anti-klip, gabung + loudnorm (-19 LUFS, true peak -2 dB), verifikasi durasi, atomik write MP3 + manifest update.
- Mengimplementasikan verifikasi berkas review kualitas di `codes/src/server/listening/review-gate.ts`:
  - Validasi skema `codes/content/gt-listening/reviews/<part_code>.review.json`.
  - Penegakan `listening_review_missing` dan `listening_review_stale` (pemeriksaan hash sha256 audio & skrip, ambang clarity >= 4, speed >= 3, answer_leak: false).
- Menambahkan skrip CLI dan package.json scripts:
  - `codes/scripts/listening-check.ts` (`npm run listening:check`).
  - `codes/scripts/listening-build.ts` (`npm run listening:build`).
  - Menyelaraskan script CLI agar flag `--dir` tidak terduplikasi.

## 2026-11-08 - Backend & Integrasi Sistem (Developer)
- DTO Attempt & Pemutar Audio (D8):
  - Memperbarui `codes/src/contracts/attempts.ts`: properti opsional `listening.note?: string | null` ditambahkan ke `AttemptSchema`.
  - Memperbarui `codes/src/server/attempts/dto.ts` & `service.ts`: `loadAudio` membaca `attributionText` dari `content_assets` dan meneruskannya ke DTO attempt.
  - Memperbarui `codes/src/components/listening/listening-player.tsx`: menerima prop `note?: string | null` dan merender teks kecil beratribusi (`data-testid="listening-note"`).
  - Memperbarui `codes/src/components/exam/exam-runner.tsx`: meneruskan `note={attempt.listening.note}` ke `ListeningPlayer`.
- CLI Doctor Check:
  - Menambahkan pengecekan opsional di `codes/src/server/cli/doctor.ts` untuk `ffmpeg`, `ffprobe`, dan `TTS_ENGINE_CMD` (peringatan, bukan kegagalan).
- Review Gate pada Importer Bank Soal:
  - Memperbarui `codes/src/server/content/bank-import.ts`: saat `content:import --publish`, bank Listening wajib memiliki review valid di `codes/content/gt-listening/reviews/<part_code>.review.json`.
  - Bila review hilang/stale, bank tetap `DRAFT` dan proses keluar dengan exit code 2.
  - Memperbarui `codes/src/server/content/bank-validate.ts` dan `codes/src/server/content/validate.ts` agar mendukung paket murni aset dan parsing buffer pada `sha256Hex`.

## 2026-11-08 - Konten S1 Ujung-ke-Ujung (Developer / Content Author)
- Skrip S1:
  - `codes/content/gt-listening/scripts/GT-L-S1-001.md`: S1 percakapan pendaftaran anggota perpustakaan (2 pembicara, aksen UK, 28 ujaran, 5 jeda).
- Berkas Aset & Manifest:
  - `codes/content/gt-listening/assets/audio/gt-l-s1-001.mp3`: Berkas audio MP3 valid sintetis.
  - `codes/content/gt-listening/assets.manifest.json`: Manifest aset untuk `gt-listening/gt-l-s1-001` (`AUDIO_LISTENING`, `OWN_ORIGINAL`).
  - `codes/content/gt-listening/content.json`: Metadata kontrak 1.1.
- Berkas Review Gerbang Kualitas:
  - `codes/content/gt-listening/reviews/GT-L-S1-001.review.json`: Review bertanda tangan lengkap dengan `clarity: 5`, `speed: 4`, `naturalness: 4`, `answer_leak: false`, `approved: true`, beserta hash skrip dan audio.
- Bank Soal S1:
  - `codes/content/gt-bank/listening-s1.json`: Bank 10 butir soal S1 `GT-LIS-S1-001` dengan `listening_asset_code: "gt-listening/gt-l-s1-001"` dan varian ejaan British/American (`colour`/`color`).
