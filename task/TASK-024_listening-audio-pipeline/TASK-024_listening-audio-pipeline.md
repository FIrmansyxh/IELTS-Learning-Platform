# TASK-024 Pipeline Konten Listening General Training (Skrip, TTS Lokal, Aset Audio)
**Spec:** `specifications/024_spec_listening_audio_pipeline.md`
**Priority:** P1
**Wave:** W9 (urutan build ke-4 dari 5)
**Size:** L
**Assigned To:** Developer Agent (Tooling + Konten + Backend minimal)
**Dependencies:** TASK-022 (bank `LISTENING_GT_S1..S4`, validator bank), TASK-021 (urutan wajib); TASK-004, TASK-011 (pemutar Listening terkunci); TASK-018 (aset berlisensi; SUPERSEDED, efektif = manifest + `content:import`)
**Current Status:** not_started

---

## Description
Membangun alur offline pembuatan konten Listening GT: skrip Markdown berpenanda pembicara/jeda -> sintesis TTS lokal sekali di mesin pemilik -> penggabungan, normalisasi, kompresi -> aset audio `OWN_ORIGINAL` terdaftar di manifest -> bank Listening merujuk `listening_asset_code` -> dikerjakan di pemutar SPEC-011 (mode ujian, diputar sekali). Tidak ada TTS saat runtime, tidak ada AI penilai Listening. Tanpa perubahan runtime pemutar selain catatan "Audio dibuat dengan suara sintetis".

## Acceptance Criteria (dirujuk dari SPEC-024)
- [ ] AC-1: satu bagian S1 ujung-ke-ujung: skrip -> audio -> aset -> soal -> dikerjakan di pemutar mode ujian.
- [ ] AC-2: durasi audio sesuai metadata skrip (+/- 5%); tidak ada klip terpotong.
- [ ] AC-3: validator konten menolak bank Listening tanpa `listening_asset_code` terdaftar.
- [ ] AC-4: uji dengar manusia tercatat sebelum publikasi (D5).
- [ ] Edge: model TTS gagal dimuat -> berhenti dengan galat jelas, tidak menulis aset setengah jadi.
- [ ] Edge: dua pembicara dengan suara identik ditolak oleh pemeriksaan skrip.
- [ ] Edge: ejaan UK/US diterima via daftar `correct_answers`.
- [ ] D4: aset terdaftar `kind: AUDIO_LISTENING`, `rights_status: OWN_ORIGINAL`, `source_code: OWN`.
- [ ] D6: bank Listening tanpa audio tetap `PENDING_AUDIO` dan tidak dipilih perakit.
- [ ] UI: catatan kecil "Audio dibuat dengan suara sintetis" (D5).

## Subtasks

### Tooling / Konten
1. SPIKE (didahulukan): verifikasi mesin TTS (kandidat Kokoro-82M, Piper): lisensi model, kualitas lewat uji dengar, kebutuhan runtime (Python/ONNX), dan pasang `ffmpeg`. Putuskan dan catat di dev_log + ADR singkat (bukan keputusan dev sendirian).
2. Format skrip Markdown D2 (`codes/content/gt-listening/scripts/`): penanda `[A]`, `[B]`, `[pause 2s]`, front-matter metadata (kecepatan, aksen, durasi target); parser + pemeriksa (suara pembicara unik, kecepatan 0,95-1,15).
3. `scripts/listening-build.ts`: `npm run listening:build -- --script <berkas>`; panggil TTS, sisipkan jeda, gabung, normalisasi volume, WAV -> audio terkompresi, tulis aset + entri manifest atomik (tulis ke temp lalu rename).
4. Tulis satu skrip S1 (percakapan, isian formulir) + 10 soal + bank `LISTENING_GT_S1` (status `PENDING_AUDIO` sampai audio lolos uji dengar).
5. Catatan uji dengar: templat berkas log (kejelasan, kecepatan, kebocoran jawaban) sebagai gerbang publikasi.

### Backend
1. Validator konten/bank (bersama TASK-022): tolak bank Listening tanpa `listening_asset_code` terdaftar; terima `PENDING_AUDIO` sebagai status sementara tanpa kode.
2. `content:import` mendaftarkan aset audio (manifest) ke `content_assets`; hitung durasi dan simpan.
3. Pemutar SPEC-011: verifikasi stream aset OWN_ORIGINAL dan pemutaran sekali; tanpa perubahan logika.
4. Tes: unit parser skrip + pemeriksaan pembicara, unit validator, integrasi impor aset (tanpa memanggil TTS; pakai fixture audio nada C-11).

### Frontend
1. Catatan "Audio dibuat dengan suara sintetis" di pemutar Listening (teks via `src/i18n/id.ts`).
2. Tidak ada perubahan lain; E2E: S1 uji dengan fixture audio nada.

## File / Area Kode yang Disentuh
- `codes/content/gt-listening/scripts/*.md` (baru), `codes/content/gt-bank/listening-*.json` (baru), `content/.../assets.manifest.json`
- `codes/scripts/listening-build.ts` (baru), `scripts/bank-validate.ts`, `scripts/content-import.ts`, `package.json` (`listening:build`)
- `src/server/content/*`, `src/server/assets/*` (hanya bila tersisa), `src/components/listening/*`, `src/i18n/id.ts`
- `tests/unit`, `tests/integration`, `tests/fixtures/content/` (audio nada)

## Definition of Done
- Semua AC dicentang kecuali AC-4 yang dibuktikan oleh catatan uji dengar manusia (butuh pemilik); typecheck, lint, unit, integrasi hijau; alur S1 terbukti di pemutar.
- dev_log (termasuk keputusan TTS) diisi; status log diperbarui.

## Risiko / Catatan
- R1: AC-1/2/4 bergantung pada mesin TTS, `ffmpeg`, dan telinga manusia; tidak bisa diotomasi penuh di CI. Tes otomatis memakai fixture; AC-1 dan AC-4 diverifikasi manual (butuh jadwal pemilik).
- R2: Pemilihan mesin TTS ditulis "kandidat, perlu diverifikasi" tanpa kriteria penerimaan; usul kriteria: lisensi model memperbolehkan penggunaan pribadi/turunan, RTF layak di CPU pemilik, dan lolos uji dengar kecil.
- R3: Spec menyebut `ffmpeg` "belum terpasang" dan prasyarat instalasi di mesin pemilik; harus dicatat di README dan `doctor` (cek `ffmpeg`, opsional).
- R4: Depends on SPEC-018 (aset berlisensi; UI-nya SUPERSEDED). Kenyataan: tidak ada admin untuk memverifikasi hak; manifest dan `rights_status` diisi oleh berkas konten.
- R5: Bagian S3/S4 dan 40 soal lengkap tidak ada dalam AC; hanya S1 yang wajib. Karena itu TASK-023 tidak boleh mengasumsikan Listening tersedia (lihat R3 di TASK-023).
- R6: AC-2 membutuhkan "durasi metadata skrip" yang tidak didefinisikan cara menghitungnya (jumlah kata/kecepatan + jeda); tentukan rumus di dev_log.

---

## Status Log

| Timestamp | Agent | Status | Notes |
|-----------|-------|--------|-------|
| 2026-11-08 12:00 | pm agent | task created | - |
