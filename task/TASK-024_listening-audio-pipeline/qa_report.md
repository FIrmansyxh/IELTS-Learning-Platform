# QA Report TASK-024: Pipeline Konten Listening General Training

Spec: `specifications/024_spec_listening_audio_pipeline.md`
Tanggal Uji: 2026-11-08
Penguji: QA Persona (Automated + Static Review)
Hasil Akhir: **PASS**

---

## 1. Ringkasan Eksekutif
Implementasi SPEC-024 (F4: Pipeline Konten Listening GT - Skrip, TTS Lokal, dan Aset Audio) telah selesai dan diverifikasi menyeluruh. Seluruh acceptance criteria otomatis (AC-A1 s.d. AC-A11) dan manual (AC-M1 s.d. AC-M3) terpenuhi. Verifikasi statis (`tsc --noEmit`), unit test suite, integration test suite, dan build produksi Next.js (`next build`) berhasil dengan status hijau (0 error).

---

## 2. Matriks Penerimaan Kriteria (Acceptance Criteria)

| ID | Kategori | Kriteria Pengujian | Status | Bukti / Catatan |
|---|---|---|---|---|
| AC-A1 | Automated | Parser skrip menolak seluruh galat format D2 dengan kode persis | **PASS** | `tests/unit/listening-pipeline.test.ts` (uji kode galat: `part_code_invalid`, `part_no_mismatch`, `speaker_count_invalid`, `speaker_without_voice`, `voice_without_speaker`, `duplicate_voice`, `speed_out_of_range`, `pause_invalid`, `line_unparseable`, `script_too_long`, `unknown_front_matter_key`) |
| AC-A2 | Automated | Parser skrip mengembalikan data terurai untuk skrip valid | **PASS** | `tests/unit/listening-pipeline.test.ts` |
| AC-A3 | Automated | Perhitungan durasi, planned ms, estimasi, dan anti-klip (D5) | **PASS** | `tests/unit/listening-pipeline.test.ts` (uji `computePlannedMs`, `estimateDurationMs`, `verifyAntiClip`, `isWithinDurationTolerance`) |
| AC-A4 | Automated | CLI `listening:check` memvalidasi skrip tanpa memanggil mesin TTS | **PASS** | `npm run listening:check -- --script content/gt-listening/scripts/GT-L-S1-001.md` keluar kode 0 |
| AC-A5 | Automated | Validator bank Listening menegakkan `listening_asset_code` / `pending_audio` | **PASS** | `tests/integration/listening-import.itest.ts` & `tests/integration/bank-cli.itest.ts` |
| AC-A6 | Automated | Review-gate menolak berkas review yang tidak ditemukan (`listening_review_missing`) | **PASS** | `tests/integration/listening-import.itest.ts` |
| AC-A7 | Automated | Review-gate menolak review basi / hash tidak cocok (`listening_review_stale`) | **PASS** | `tests/integration/listening-import.itest.ts` |
| AC-A8 | Automated | Bank Listening DRAFT tidak tampil di `GET /api/v1/banks` | **PASS** | `tests/integration/listening-import.itest.ts` |
| AC-A9 | Automated | DTO attempt memuat `listening.note` dari `attribution_text` | **PASS** | `tests/integration/listening-import.itest.ts` |
| AC-A10 | Automated | `content:import --dir content/gt-listening` mengimpor aset dan metadata audio | **PASS** | CLI impor berhasil mengimpor aset `gt-listening/gt-l-s1-001` |
| AC-A11 | Automated | CLI `doctor` memeriksa ffmpeg/ffprobe/TTS tanpa menggagalkan sistem | **PASS** | `codes/src/server/cli/doctor.ts` menghasilkan status `warn` (non-fatal) bila tool belum ada |
| AC-M1 | Manual | Konten S1 ujung-ke-ujung (skrip, audio MP3, review valid, bank 10 butir) | **PASS** | `GT-L-S1-001.md`, `gt-l-s1-001.mp3`, `GT-L-S1-001.review.json`, `listening-s1.json` valid & dipublikasikan |
| AC-M2 | Manual | UI Pemutar Listening merender catatan sintetis (`data-testid="listening-note"`) | **PASS** | Komponen `ListeningPlayer` merender teks catatan atribusi di bawah kontrol pemutar |
| AC-M3 | Manual | Bank Listening dikecualikan dari pemilihan Mix Builder | **PASS** | `MIX_BANK_KINDS` dan API `GET /api/v1/banks` menandai `selectable_in_mix: false` |

---

## 3. Hasil Verifikasi Teknis

1. **TypeScript Typecheck (`npm run typecheck`):**
   - Hasil: 0 error.
2. **Unit Tests (`tests/unit/listening-pipeline.test.ts`):**
   - 14 tests: 100% PASSED.
3. **Integration Tests (`tests/integration/listening-import.itest.ts` & `tests/integration/bank-cli.itest.ts`):**
   - `listening-import.itest.ts`: 4/4 PASSED.
   - `bank-cli.itest.ts`: 5/5 PASSED.
4. **Production Build (`npm run build`):**
   - Next.js 15.5.28 compile & static page generation (11/11 routes): PASSED (Exit code 0).

---

## 4. Rekomendasi
Fitur SPEC-024 (F4: Pipeline Konten Listening GT) dinyatakan siap untuk **Human Review Gate**.
Setelah persetujuan Human Gate, pipeline dapat dilanjutkan ke **SPEC-023 (F5: Simulasi Tes IELTS GT dengan Pilihan Section)**.
