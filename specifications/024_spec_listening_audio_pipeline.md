# SPEC-024: Pipeline Konten Listening General Training (Skrip, TTS Lokal, Aset Audio)

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-004)
- **Created:** 2026-11-08
- **Status:** draft (menunggu persetujuan human)
- **Depends on:** SPEC-004, SPEC-011, SPEC-018, SPEC-022
- **Prioritas:** P1
- **Cakupan:** Konten (skrip + soal), Tooling (generator audio offline), Backend (impor aset audio) tanpa perubahan runtime pemutar

## User Story
Sebagai Learner, saya ingin soal Listening dengan audio realistis yang diputar sekali dalam kondisi ujian, sehingga latihan Listening saya setara dengan format ujian General Training.

## Non-Goals / Out of Scope
- Tidak ada penilaian AI untuk Listening: soal objektif dinilai otomatis oleh mesin yang ada.
- Tidak ada TTS saat runtime: audio dibuat SEKALI di mesin pemilik dan disimpan sebagai aset.
- Tidak mengunduh atau menyimpan ulang rekaman berhak cipta (Cambridge IELTS, dsb.).
- Tidak memakai LLM untuk membuat soal; skrip dan soal ditulis lalu ditinjau manusia.

## Definisi Tetap
**D1. Format.** 4 bagian: S1 percakapan dua orang tentang hal sehari-hari (isian formulir), S2 monolog situasi sehari-hari (pilihan ganda, pelabelan peta), S3 diskusi hingga empat pembicara dalam konteks pelatihan/pendidikan, S4 monolog bertema akademik. Total 40 soal; General Training memakai bagian yang sama dengan Academic.
**D2. Skrip.** Berkas Markdown per bagian di `codes/content/gt-listening/scripts/` dengan penanda pembicara (`[A]`, `[B]`, ...), jeda (`[pause 2s]`), dan metadata (kecepatan, aksen yang dituju). Skrip memuat jawaban sebagai bagian dari ujaran, mengikuti pola jebakan IELTS (koreksi diri, distractor).
**D3. Sintesis.** Alat lokal gratis (kandidat: Kokoro-82M, Piper; keduanya perlu diverifikasi lisensi model dan kualitas suaranya lewat uji dengar sebelum dipilih). Satu suara per pembicara, variasi kecepatan 0,95-1,15, jeda disisipkan, normalisasi volume. Keluaran WAV lalu dikonversi ke audio terkompresi (butuh `ffmpeg`, belum terpasang).
**D4. Aset.** Setiap audio didaftarkan di manifest aset (`kind: AUDIO_LISTENING`, `rights_status: OWN_ORIGINAL`, `source_code: OWN`) dan dirujuk oleh `listening_asset_code` pada bank/set (SPEC-018 dan 022).
**D5. Kualitas.** Setiap bagian lolos uji dengar manusia (kejelasan, kecepatan, kebocoran jawaban) sebelum berstatus `PUBLISHED`; keterbatasan TTS (kurang aksen dan derau alami) dicatat di UI sebagai catatan.
**D6. Bank.** Bank Listening `LISTENING_GT_S1..S4` (SPEC-022) berisi soal terkait; bank tanpa audio berstatus `PENDING_AUDIO` dan tidak dipilih oleh perakit.

## Technical Flow
1. Penulisan skrip dan soal (AI + peninjauan manusia).
2. `npm run listening:build -- --script <berkas>` memanggil mesin TTS lokal, menggabungkan, menormalkan, menulis audio dan entri manifest.
3. `npm run content:import` mendaftarkan aset; bank diimpor dan dipublikasikan.
4. Pemutar SPEC-011 memutar sekali dengan rewind terkunci pada mode ujian.

## Database Changes
Tidak ada (memakai `content_assets`).

## UI/UX
Tanpa perubahan pemutar. Menambah catatan kecil: "Audio dibuat dengan suara sintetis".

## Acceptance Criteria
1. Satu bagian S1 selesai ujung-ke-ujung: skrip -> audio -> aset -> soal -> dikerjakan di pemutar dalam mode ujian.
2. Durasi audio sesuai metadata skrip (+/- 5%); tidak ada klip terpotong.
3. Validator konten menolak bank Listening tanpa `listening_asset_code` yang terdaftar.
4. Uji dengar manusia tercatat sebelum publikasi.

## Edge Cases & Validation
- Mesin TTS gagal memuat model: perintah berhenti dengan galat jelas, tidak menulis aset setengah jadi.
- Dua pembicara dengan suara identik ditolak oleh pemeriksaan skrip.
- Jawaban yang diucapkan dengan ejaan berbeda (UK/US) diterima oleh daftar `correct_answers`.

## Human Approval
- [ ] Disetujui human (belum)

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
