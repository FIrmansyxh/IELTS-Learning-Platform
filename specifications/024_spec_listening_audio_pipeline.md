# SPEC-024: Pipeline Konten Listening General Training (Skrip, TTS Lokal, Aset Audio)

## Metadata
- **Author:** Orchestrator (atas permintaan human, ADR-004); direvisi teknis oleh Analyst 2026-11-08 (menyelaraskan dengan SPEC-025/ADR-005)
- **Created:** 2026-11-08
- **Status:** approved (human, 2026-11-08, via /build-feature: disetujui apa adanya); revisi teknis 2026-11-08 menunggu konfirmasi human pada butir "Keputusan Analyst"
- **Depends on:** SPEC-004 (manifest aset `AssetManifest`, `content:import`), SPEC-011 (pemutar Listening), SPEC-022 (kontrak bank Listening, validator bank, migrasi `0002`), SPEC-025. (SPEC-018 SUPERSEDED: pendaftaran aset = `assets.manifest.json` + `content:import`, tanpa UI/endpoint admin.) Dependensi berstatus `ready_to_test` dianggap cukup (dispensasi human).
- **Prioritas:** P1
- **Urutan build:** KE-3 dari 4 (022 -> 021 -> 024 -> 023).
- **Cakupan:** Konten (skrip + soal), Tooling (generator audio offline `listening:build`, validator skrip), Backend minimal (validator bank Listening sudah di SPEC-022; impor aset sudah di SPEC-004; catatan sintetis di DTO pemutar). Tanpa perubahan logika runtime pemutar.

## User Story
Sebagai Learner (profil lokal), saya ingin soal Listening dengan audio realistis yang diputar sekali dalam kondisi ujian, sehingga latihan Listening saya setara dengan format ujian General Training.

## Non-Goals / Out of Scope
- Tidak ada penilaian AI untuk Listening: soal objektif dinilai otomatis oleh mesin yang ada.
- Tidak ada TTS saat runtime aplikasi: audio dibuat SEKALI di mesin pemilik lewat CLI dan disimpan sebagai aset berkas.
- Tidak mengunduh atau menyimpan ulang rekaman berhak cipta (mis. Cambridge IELTS).
- Tidak memakai LLM untuk membuat soal; skrip dan soal ditulis lalu ditinjau manusia.
- Tidak ada UI/endpoint admin untuk aset atau uji dengar (SPEC-025): pendaftaran lewat manifest, uji dengar dicatat sebagai berkas.
- Tidak membundel model TTS atau `ffmpeg` ke repo; keduanya dipasang pemilik (D3). `ffmpeg` bukan dependensi runtime aplikasi.
- Tidak ada pemilihan bank Listening di Mix Builder (SPEC-022) dan tidak ada pemutaran ulang audio di mode ujian.
- Cakupan wajib versi ini: bagian S1 ujung-ke-ujung (AC-A9/AC-M1). Skrip, audio, dan soal S2-S4 (dan 40 soal lengkap yang dibutuhkan Listening di SPEC-023) adalah pekerjaan konten lanjutan memakai alat yang sama; kontrak, validator, dan alat WAJIB sudah mendukung S1-S4.

## Definisi Tetap
**D1. Format.** 4 bagian: S1 percakapan dua orang tentang hal sehari-hari (isian formulir), S2 monolog situasi sehari-hari (pilihan ganda, pelabelan peta), S3 diskusi hingga empat pembicara dalam konteks pelatihan/pendidikan, S4 monolog bertema akademik. Total 40 soal (10 per bagian); General Training memakai bagian yang sama dengan Academic. Jumlah pembicara per bagian (divalidasi, `speaker_count_invalid`): S1 tepat 2, S2 tepat 1, S3 2-4, S4 tepat 1.

**D2. Skrip.** Berkas Markdown per bagian di `codes/content/gt-listening/scripts/<part_code>.md`. Satu berkas = satu bagian = satu aset audio = satu bank soal.
```
---
part_code: GT-L-S1-001
part_no: 1
title: Pendaftaran keanggotaan perpustakaan
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
```
Aturan format (kode galat persis; semua dicek `listening:build` dan `listening:check`):
- Front-matter wajib: `part_code` (regex `^GT-L-S[1-4]-\d{3}$`), `part_no` (1-4, harus sama dengan digit setelah `S` pada `part_code`; `part_no_mismatch`), `title` (1-150), `accent` (`UK`\|`US`\|`AU`), `bank_code` (regex bank `^GT-[A-Z0-9]+(-[A-Z0-9]+)*$`), `voices` (peta huruf pembicara -> id suara mesin, string 1-60), `speed` (peta huruf -> angka). `target_duration_sec` opsional (integer 60-1800). Kunci lain -> `unknown_front_matter_key`.
- Pembicara dinyatakan `[A]`..`[F]` di awal baris diikuti satu spasi dan ujaran satu baris (1-600 karakter). Setiap huruf yang dipakai di ujaran harus ada di `voices` dan `speed` (`speaker_without_voice`); huruf di `voices` yang tidak dipakai -> `voice_without_speaker`.
- Jeda: baris sendiri `[pause Ns]` dengan N kelipatan 0,5 pada 0,5-10 (`pause_invalid`). Baris kosong diabaikan. Baris lain -> `line_unparseable` (disertai nomor baris).
- Dua pembicara berbeda dengan id suara sama -> `duplicate_voice`. Kecepatan di luar 0,95-1,15 (inklusif) -> `speed_out_of_range`.
- Skrip memuat jawaban sebagai bagian ujaran dengan pola jebakan IELTS (koreksi diri, distractor) — ini penulisan konten, tidak divalidasi mesin.
- Panjang naskah: 1-300 ujaran (`script_too_long`).

**D3. Sintesis (mesin lokal gratis, dipilih lewat SPIKE berkriteria).** Kandidat: Kokoro-82M, Piper. Satu suara per pembicara, kecepatan per pembicara dari `speed`, jeda disisipkan sebagai hening, normalisasi volume, keluaran WAV segmen lalu digabung dan dikonversi ke MP3 mono 24 kHz 96 kbps dengan `ffmpeg` (normalisasi `loudnorm` target -19 LUFS, true peak -2 dB). Kriteria penerimaan mesin (semua wajib lolos; hasil dicatat di dev_log dan ADR-006 yang ditulis Developer setelah human menyetujui pilihan):
| Kode | Kriteria | Cara uji | Lulus bila |
|---|---|---|---|
| K1 | Lisensi kode, bobot model, DAN suara yang dipakai | baca berkas lisensi resmi | salah satu: Apache-2.0, MIT, CC0, CC-BY-4.0; tanpa klausul non-komersial atau tanpa-turunan pada keluaran audio; sumber dicatat di `content_sources` (kode `TTS_KOKORO` atau `TTS_PIPER`, `license_type` `CC0`\|`CC_BY`\|`MIT`\|`OTHER` dengan `license_note` menyebut lisensi persis) |
| K2 | Offline | putuskan jaringan setelah unduhan model, sintesis naskah uji | berhasil tanpa jaringan |
| K3 | Kecepatan CPU | sintesis naskah uji 3 menit tanpa GPU di mesin pemilik | RTF (waktu sintesis / durasi audio) <= 1,0; puncak RAM <= 4 GB; ukuran model <= 1 GB |
| K4 | Ragam suara | hitung suara berbeda yang tersedia pada aksen target | >= 4 suara berbeda (untuk S3 dengan 4 pembicara) |
| K5 | Uji dengar pemilik | 3 sampel: dialog 2 suara ±60 detik, monolog ±60 detik, kalimat berisi 10 butir kunci (angka, ejaan huruf nama, tanggal, nomor telepon, alamat) | skor kejelasan >= 4 dari 5, naturalness >= 3 dari 5, dan 0 salah baca pada 10 butir kunci |
| K6 | Pemasangan | pasang di Windows tanpa kompilasi manual selain `pip install`/unduh biner; `ffmpeg` dan `ffprobe` >= 6.0 di `PATH` | berhasil dan tercatat di README |
Mesin terpilih = kandidat pertama yang lulus K1-K6; bila keduanya lulus, pilih naturalness tertinggi pada K5. Bila tidak ada yang lulus, berhenti dan tanyakan human (opsi di luar spec ini). Konfigurasi lewat `.env`: `TTS_ENGINE` (`kokoro`\|`piper`), `TTS_ENGINE_CMD` (jalur perintah mesin; dijalankan dengan `child_process.execFile`, argumen berupa array, tanpa shell), `TTS_MODEL_DIR`, `FFMPEG_PATH` (default `ffmpeg`), `FFPROBE_PATH` (default `ffprobe`). `npm run doctor` menambah pemeriksaan OPSIONAL (peringatan, bukan galat) untuk `ffmpeg`, `ffprobe`, `TTS_ENGINE_CMD`.

**D4. Aset.** Setiap audio didaftarkan pada `codes/content/gt-listening/assets.manifest.json` (format `AssetManifest` SPEC-004): `asset_code = "gt-listening/<part_code dalam huruf kecil>"` (mis. `gt-listening/gt-l-s1-001`; memenuhi `ASSET_CODE_RE`), `kind: "AUDIO_LISTENING"`, `title`, `source_code: "OWN"`, `rights_status: "OWN_ORIGINAL"`, `file: "audio/<part_code huruf kecil>.mp3"` (relatif ke `codes/content/gt-listening/assets/`), `attribution_text: "Audio dibuat dengan suara sintetis."`. Bank merujuk lewat `listening_asset_code` (kontrak SPEC-022 D7). `content:import` mengisi `content_assets.duration_sec = round(durasi terukur / 1000)`, `mime_type='audio/mpeg'`, `sha256`, `size_bytes`.

**D5. Durasi (definisi tunggal).** Dari skrip dan keluaran mesin dihitung:
- `segment_ms[i]` = durasi WAV ujaran ke-i (diukur dari berkas keluaran mesin).
- `planned_ms` = jumlah `segment_ms[i]` + jumlah jeda eksplisit `[pause Ns]` (N x 1000) + jeda implisit 600 ms antara dua ujaran berurutan yang pembicaranya berbeda, 300 ms bila pembicaranya sama + hening awal 1000 ms + hening akhir 1500 ms.
- `measured_ms` = durasi berkas MP3 akhir menurut `ffprobe`.
- **Lulus durasi** bila `abs(measured_ms - planned_ms) / planned_ms <= 0,05`.
- **Anti-klip terpotong/kosong:** tiap segmen harus berdurasi antara `0,12 x jumlah_kata` dan `1,5 x jumlah_kata` detik (jumlah_kata = token dipisah spasi yang mengandung huruf atau angka) dan volume rata-rata > -50 dB (`volumedetect`); pelanggaran -> `segment_suspect` (menghentikan build).
- Informasi saja (tidak menggagalkan): `estimated_ms` = jumlah_kata/(2,5 x kecepatan) per ujaran + jeda seperti di atas dicetak; peringatan `target_duration_mismatch` bila `target_duration_sec` ada dan `abs(measured_ms/1000 - target_duration_sec) / target_duration_sec > 0,15`.

**D6. Penerimaan kualitas (gerbang publikasi).** Setiap bagian lolos uji dengar manusia sebelum bank berstatus `PUBLISHED`. Bukti = berkas `codes/content/gt-listening/reviews/<part_code>.review.json`:
| Field | Tipe | Wajib | Constraint |
|---|---|---|---|
| `part_code` | string | ya | sama dengan skrip |
| `reviewer` | string | ya | 1-40 |
| `reviewed_at` | string | ya | `YYYY-MM-DD` |
| `clarity` | int | ya | 1-5 |
| `speed` | int | ya | 1-5 |
| `naturalness` | int | ya | 1-5 |
| `answer_leak` | boolean | ya | true bila narasi membocorkan jawaban di luar pola jebakan IELTS (mis. "jawabannya adalah ...") |
| `approved` | boolean | ya | |
| `script_sha256` | string | ya | SHA-256 berkas skrip saat diuji |
| `audio_sha256` | string | ya | SHA-256 berkas MP3 saat diuji |
| `notes` | string | tidak | <= 1000 |
Sah bila `approved=true`, `clarity >= 4`, `speed >= 3`, `answer_leak=false`, dan kedua hash cocok dengan berkas saat ini. `content:import --publish`: bank Listening tanpa berkas sah TIDAK dipublikasikan (tetap `DRAFT`), run mencetak `listening_review_missing` (berkas tidak ada) atau `listening_review_stale` (hash tidak cocok / ambang tak terpenuhi), dan keluar dengan kode 2. Keterbatasan TTS (kurang aksen dan derau alami) dicatat di UI sebagai catatan (D8).

**D7. Bank.** Bank Listening `LISTENING_GT_S1..S4` (SPEC-022 D2/D7) berisi 10 soal per bagian, `section_no` soal = `part_no`. Bank tanpa audio memakai `pending_audio: true` (status `DRAFT`, tidak dipilih perakit). Ejaan UK/US: `correct_answers` memuat semua varian ejaan yang diterima (mis. `["colour","color"]`); normalisasi jawaban memakai mesin SPEC-006 apa adanya.

**D8. Catatan pemutar.** DTO attempt (`GET /attempts/{id}`) pada objek `listening` ditambah field `note` (string atau null) = `content_assets.attribution_text` aset audio; `ListeningPlayer` (design-system 5.14) menampilkan `note` di bawah pemutar sebagai teks kecil bila tidak null. Perilaku putar-sekali dan kunci-rewind SPEC-011 tidak berubah.

## Technical Flow
1. Penulis membuat skrip `scripts/GT-L-S1-001.md` dan bank `content/gt-bank/listening-s1.json` (10 soal, `pending_audio: true`).
2. `npm run listening:check -- --script <berkas>` memvalidasi skrip (D2) tanpa memanggil mesin; keluar 0 bila valid.
3. `npm run listening:build -- --script <berkas>`: (a) validasi skrip; (b) cek `ffmpeg`/`ffprobe`/mesin TTS dapat dijalankan, jika tidak berhenti dengan galat tanpa menulis apa pun; (c) sintesis tiap ujaran ke WAV di folder sementara; (d) cek anti-klip (D5); (e) susun hening/jeda, gabung, normalisasi, konversi ke MP3; (f) cek durasi (D5); (g) tulis atomik: salin MP3 ke `assets/<nama>.mp3.tmp` lalu `rename`, perbarui `assets.manifest.json` lewat berkas sementara lalu `rename`; (h) hapus folder sementara; (i) cetak ringkasan (durasi terukur, `planned_ms`, RTF, SHA-256).
4. Pemilik melakukan uji dengar dan menulis `reviews/<part_code>.review.json` (D6).
5. Penulis mengganti `pending_audio: true` menjadi `listening_asset_code` di bank, lalu `npm run bank:validate -- --dir content/gt-bank` dan `npm run content:import -- --dir content/gt-listening` (aset) lalu `npm run content:import -- --dir content/gt-bank --publish`.
6. Learner mengerjakan set Listening di pemutar SPEC-011 mode ujian (diputar sekali, rewind terkunci) dan melihat catatan sintetis.

## API Contract
Tidak ada endpoint HTTP baru. Antarmuka baru adalah CLI (kontrak persis):
- `npm run listening:check -- --script <path>`: keluar 0 bila valid; non-0 dengan satu baris per galat `"<kode>: <pesan> (baris <n>)"`.
- `npm run listening:build -- --script <path> [--keep-temp] [--dry-run]`: `--dry-run` hanya melakukan langkah (a) dan (b) lalu mencetak `estimated_ms`. Kode keluar: 0 sukses; 1 galat validasi skrip; 2 galat lingkungan (mesin TTS/ffmpeg tidak ada atau gagal memuat model); 3 galat kualitas (`segment_suspect` atau durasi di luar 5%). Pada kode non-0 tidak ada berkas aset/manifest yang berubah.
- `npm run content:import -- --dir content/gt-bank --publish`: perilaku Listening di D6 (kode keluar 2 bila ada bank dilewati).
- Perubahan aditif `GET /api/v1/attempts/{attempt_id}`: `data.listening.note: string | null`. Contoh: `"listening": { "audio_url": "/api/v1/assets/3f1d2c9e-6a7b-4c8d-9e0f-1a2b3c4d5e6f/file", "mime_type": "audio/mpeg", "duration_sec": 428, "note": "Audio dibuat dengan suara sintetis." }`.
- Streaming aset audio: endpoint SPEC-011/005 yang ada (`GET /api/v1/assets/{asset_id}/file`, `auth: 'user'`, `Range` didukung) tanpa perubahan.

## Database Changes
Tidak ada migrasi baru. Memakai `content_assets` (kolom yang sudah ada: `asset_code`, `kind`, `source_id`, `rights_status`, `storage_backend`, `storage_key`, `mime_type`, `size_bytes`, `sha256`, `duration_sec`, `attribution_text`) dan `assessment_sets.listening_asset_id` (kolom ada). Bank Listening memakai kolom `bank_code`, `bank_kind` dari migrasi `0002` (SPEC-022). Sumber `TTS_KOKORO`/`TTS_PIPER` ditambahkan ke `content_sources` lewat seed (`scripts/seed.ts`, modul `content_sources`) hanya setelah mesin dipilih (K1).

## UI/UX
- Tanpa perubahan alur pemutar. Menambah catatan kecil di bawah `ListeningPlayer` (design-system 5.14, teks kecil `text-muted`): "Audio dibuat dengan suara sintetis." (dari `listening.note`; tidak tampil bila `note` null). Teks Indonesia di `src/i18n/id.ts` hanya untuk label tambahan; isi catatan berasal dari data.
- State: audio gagal dimuat (galat jaringan lokal) memakai penanganan SPEC-011; tidak ada state baru.

## Acceptance Criteria
Dibagi: **otomatis** (CI dan mesin dev tanpa TTS/ffmpeg asli, memakai fixture; WAJIB lulus untuk "selesai build") dan **manual-manusia** (butuh mesin TTS, `ffmpeg`, dan telinga pemilik; dijadwalkan terpisah, dibuktikan oleh berkas bukti).

### Otomatis (AC-A)
- [ ] **AC-A1** **Given** skrip valid dengan 2 pembicara **When** `listening:check` **Then** keluar 0; **Given** fixture negatif **Then** keluar non-0 dengan tepat kode: `duplicate_voice` (dua huruf, id suara sama), `speed_out_of_range` (1.20 dan 0.90), `speaker_without_voice`, `voice_without_speaker`, `pause_invalid` (`[pause 0.3s]`, `[pause 11s]`), `line_unparseable`, `speaker_count_invalid` (S1 dengan 3 pembicara), `part_no_mismatch`, `unknown_front_matter_key`, `script_too_long`.
- [ ] **AC-A2** **Given** fungsi `computePlannedMs` dengan segmen WAV sintetis dan skrip uji **Then** `planned_ms` = hitungan manual D5 persis (uji dengan 3 ujaran: 2 pembicara berbeda berurutan, satu jeda 2 detik, hening awal/akhir).
- [ ] **AC-A3** **Given** MP3 hasil gabungan fixture yang durasinya 4% lebih pendek dari `planned_ms` **Then** lulus; 6% lebih pendek (klip terpotong) **Then** `listening:build` (mesin TTS dan ffmpeg ditiru lewat stub perintah) keluar kode 3 tanpa menulis aset maupun manifest.
- [ ] **AC-A4** **Given** stub mesin TTS yang menghasilkan segmen 0,3 detik untuk ujaran 20 kata **Then** `segment_suspect`, keluar 3; stub yang gagal memuat model (keluar non-0) **Then** keluar 2 dan tidak ada berkas `assets/*.mp3`, `*.tmp`, maupun perubahan `assets.manifest.json`.
- [ ] **AC-A5** **Given** bank Listening fixture **When** `bank:validate` **Then** tanpa `listening_asset_code` dan tanpa `pending_audio` -> `listening_asset_required`; kode tak terdaftar -> `listening_asset_unregistered`; kode terdaftar di manifest paket dengan `kind: AUDIO_LISTENING` dan `rights_status: OWN_ORIGINAL` -> lulus.
- [ ] **AC-A6** **Given** aset audio fixture (nada sinus 5 detik, `tests/fixtures/content/`) dan bank Listening 10 soal **When** `content:import` lalu `--publish` dengan berkas review sah **Then** `content_assets` berisi baris (`kind='AUDIO_LISTENING'`, `rights_status='OWN_ORIGINAL'`, `duration_sec=5`, `mime_type='audio/mpeg'`), `assessment_sets.listening_asset_id` terisi, bank `PUBLISHED`.
- [ ] **AC-A7** **Given** bank Listening tanpa berkas review, atau berkas dengan `approved=false`, `clarity=3`, `answer_leak=true`, atau `audio_sha256` tidak cocok **When** `content:import --publish` **Then** bank tetap `DRAFT`, keluaran memuat `listening_review_missing`/`listening_review_stale` sesuai kasus, kode keluar 2; bank lain pada run yang sama tetap terpublikasi.
- [ ] **AC-A8** **Given** bank Listening `PENDING_AUDIO` atau `DRAFT` **Then** tidak muncul di `GET /api/v1/banks` dan tidak dipilih perakit simulasi (uji unit pemilih dari SPEC-022/023).
- [ ] **AC-A9** **Given** fixture audio nada + bank S1 terpublikasi **When** E2E Playwright membuka set Listening mode ujian, memutar audio, menjawab 10 soal, dan submit **Then** hasil muncul dengan skor benar, rewind terkunci (kontrol mundur tidak ada), `GET /attempts/{id}` memuat `listening.note = "Audio dibuat dengan suara sintetis."` dan teks itu terlihat di bawah pemutar.
- [ ] **AC-A10** **Given** soal `SHORT_ANSWER` dengan `correct_answers: ["colour","color"]` **When** dijawab `Color` dan `COLOUR` **Then** keduanya benar (tes mesin soal yang ada).
- [ ] **AC-A11** Tes unit (parser skrip, pemeriksa pembicara/kecepatan, `computePlannedMs`, anti-klip), tes integrasi (impor aset + bank + publikasi dengan gerbang review), typecheck, dan lint lulus; `npm run doctor` mencetak peringatan (bukan galat) bila `ffmpeg` tidak ada.

### Manual-manusia (AC-M) — bukan syarat CI
- [ ] **AC-M1** **Given** mesin TTS terpilih dan `ffmpeg` terpasang di mesin pemilik **When** `listening:build` dijalankan pada skrip S1 nyata **Then** keluar 0, durasi terukur dalam 5% dari `planned_ms`, dan satu bagian S1 berjalan ujung-ke-ujung (skrip -> audio -> aset -> bank 10 soal -> dikerjakan di pemutar mode ujian) — dicatat di dev_log dengan keluaran ringkasan build.
- [ ] **AC-M2** Pemilih mesin TTS memenuhi K1-K6 (D3) dengan bukti: berkas lisensi, angka RTF/RAM, skor uji dengar; keputusan dicatat di dev_log + ADR-006 dan dikonfirmasi human.
- [ ] **AC-M3** Uji dengar S1 dilakukan pemilik dan `reviews/GT-L-S1-001.review.json` sah (D6) sebelum bank S1 berstatus `PUBLISHED` di DB pemilik.

## Edge Cases & Validation
- Mesin TTS gagal memuat model, `ffmpeg`/`ffprobe` tak ditemukan, atau variabel `.env` kosong: berhenti dengan kode 2 dan pesan yang menyebut variabel/jalur yang bermasalah; tidak menulis aset setengah jadi.
- Build dibatalkan di tengah (SIGINT): folder sementara dihapus oleh `finally`; aset/manifest tidak berubah (penulisan atomik, Technical Flow langkah 3g).
- Dua pembicara dengan suara identik ditolak (`duplicate_voice`).
- Aset dengan `asset_code` yang sama dibangun ulang: MP3 dan entri manifest diganti; `sha256` baru membuat berkas review lama `listening_review_stale` (uji dengar ulang diwajibkan).
- Berkas review menyebut `part_code` berbeda dari nama berkas: dianggap tidak ada (`listening_review_missing`).
- Naskah mengandung teks di luar aksara Latin dasar/angka/tanda baca umum: diteruskan apa adanya ke mesin; tanggung jawab penulis (diuji manusia saat uji dengar).
- Ejaan UK/US: semua varian wajib ada di `correct_answers` (tanggung jawab penulis; AC-A10 membuktikan mesin menerimanya).

## Status Implementasi
| Area | Status | Catatan |
|---|---|---|
| SPIKE pemilihan mesin TTS (K1-K6) + ADR-006 | not_started | butuh mesin pemilik dan telinga pemilik |
| Parser/pemeriksa skrip (`listening:check`) | not_started | |
| `listening:build` (sintesis, gabung, normalisasi, atomik) | not_started | |
| Validator bank Listening (aturan di SPEC-022 D7) | not_started | dikerjakan di TASK-022 |
| Gerbang review di `content:import --publish` | not_started | |
| Catatan `listening.note` di DTO + `ListeningPlayer` | not_started | |
| Skrip S1 + bank `GT-LIS-S1-001` (10 soal) + berkas review | not_started | konten |
| Fixture audio nada + tes | not_started | |
| `doctor` memeriksa `ffmpeg`/`ffprobe`/TTS (opsional) + README | not_started | |

## Keputusan Analyst — perlu konfirmasi human
1. Definisi durasi (D5): AC "durasi sesuai metadata skrip ±5%" ditafsirkan sebagai konsistensi `measured_ms` MP3 akhir vs `planned_ms` (jumlah durasi segmen sintetis + jeda), karena durasi dari jumlah kata terlalu tidak akurat untuk batas 5%; `target_duration_sec` hanya peringatan (±15%).
2. Kriteria penerimaan mesin TTS K1-K6 (angka RTF <= 1,0, RAM <= 4 GB, skor uji dengar) adalah usulan Analyst.
3. Gerbang publikasi lewat berkas review yang di-hash (otomatis memaksa langkah manual), menggantikan "uji dengar tercatat" yang tidak terverifikasi mesin.
4. Format audio akhir MP3 mono 24 kHz 96 kbps, normalisasi -19 LUFS.
5. Hanya S1 yang wajib di versi ini; S2-S4 + 40 soal adalah konten lanjutan (konsekuensi untuk SPEC-023: Listening belum tersedia sampai 4 bank beraudio terbit).
6. Catatan sintetis dibawa lewat `content_assets.attribution_text` -> `listening.note`.

## Human Approval
- [x] Disetujui human (2026-11-08) — substansi produk
- [x] Konfirmasi human atas revisi teknis 2026-11-08 (butir "Keputusan Analyst"): disetujui semua default pada 2026-11-09

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-08 | Orchestrator | Draft awal |
| 2026-11-08 | Human | Draf disetujui apa adanya (build-feature, depth standard) |
| 2026-11-08 | Analyst | Revisi teknis menyelaraskan SPEC-025/ADR-005 (niat produk tidak diubah): `Depends on` SPEC-018 diganti manifest + `content:import` (SPEC-025); jalur CLI persis (`listening:check`, `listening:build`, kode keluar, penulisan atomik); format skrip D2 dengan kode galat; kriteria penerimaan mesin TTS K1-K6 (lisensi, RTF CPU, ragam suara, uji dengar); definisi durasi D5 (planned vs measured, anti-klip); gerbang uji dengar berbasis berkas review ber-hash (D6); AC dipisah otomatis (AC-A1..A11) vs manual-manusia (AC-M1..M3); cakupan wajib S1 vs konten S2-S4; catatan sintetis lewat `listening.note`; API Contract (CLI + perubahan aditif DTO), Database Changes, Status Implementasi, "Keputusan Analyst" |
| 2026-11-09 | Human | Seluruh butir 'Keputusan Analyst' disetujui sebagai default build. Gerbang code review fitur ini TETAP menunggu tinjauan human (belum disetujui). |
