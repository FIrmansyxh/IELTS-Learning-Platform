# Dev Log TASK-013: Penilaian AI Speaking (Rekam, STT)

## [BACKEND] 2026-11-03 14:20 (Backend Engineer, wave W6)

**Spec:** 013 (memakai infrastruktur SPEC-012: `LlmClient`, worker pg-boss, kuota, `async_jobs`, flags, retry, self-assessment) | **Status:** Completed (sisi server, driver mock)

### Audit awal
Yang sudah ada dan dipakai: `speaking_recordings` (kolom lengkap), `users.consent_recording_at/keep_recordings` + `UserDTO`, `StorageDriver` (+ `openRange`), `parseAudioRange`/`acquireAudioSlot` (SPEC-011), `readMultipart` (batas ukuran saat membaca aliran), bucket `upload_recording`, `userAnonymizedHooks`, `retention.audio_days`, queue `stt-transcribe`/`ai-grade-speaking`, dan seluruh pipeline/kuota/retry/self-assessment/status SPEC-012 (TIDAK digandakan; hanya perbedaan Speaking ditambah). Belum ada: `SttClient`, ffmpeg/ffprobe wrapper, rute persetujuan/unggah/rekaman, handler `stt-transcribe`/`ai-grade-speaking`, purge rekaman.

### Dibangun
- `src/server/ai/stt.ts`: `SttClient`, `WhisperCppClient` (`POST {STT_BASE_URL}/inference`, multipart `file`, `response_format=verbose_json`, `temperature=0.0`, `language=en`; confidence segmen = `exp(avg_logprob)`; `engine = "whisper.cpp " + STT_MODEL`), `MockSttClient` (transkrip tetap tepat 60 kata, `MOCK_STT_*`).
- `src/server/ai/media.ts`: `ffprobe`/`ffmpeg` hanya lewat `spawn` dengan array argumen, `shell: false`, `-nostdin`, timeout 10 dtk / 60 dtk; `probeDurationMs` (null bila kontainer tanpa Duration), `convertToWav`, `wavDurationMs`. `audio-type.ts`: deteksi magic bytes webm (EBML + doctype webm, tanpa trek video)/ogg/mp4(M4A), ekstensi dan Content-Type klien diabaikan.
- `src/server/ai/speaking.ts`: `giveRecordingConsent` (idempoten, audit `RECORDING_CONSENT_GIVEN`), `setRecordingPreferences`, `createSpeakingSubmission` (persetujuan diperiksa SEBELUM body dibaca; `readMultipart` menghentikan pembacaan pada 10 MB + 64 KB; tepat satu bagian `audio`; magic bytes; disimpan `private/recordings/{uuid}.{webm|ogg|m4a}` dir 0700; `sha256`; transaksi + kunci per-user; berkas dibersihkan bila transaksi gagal), `serveRecording` (200/206/416, header `no-store`/`nosniff`/`inline`/CORP, audit `ADMIN_PLAYED_RECORDING` untuk admin), `deleteRecording` (`RECORDING_IN_USE` saat `RECEIVED`/`TRANSCRIBING`, audit `RECORDING_DELETED_BY_USER`).
- `pipeline.ts`: `runSttTranscribe` (ffprobe -> batas 3-150 dtk -> ffmpeg WAV 16 kHz mono di tmp per job yang dibersihkan di `finally` -> STT -> potong 8000 karakter -> < 5 kata `STT_EMPTY` -> simpan transkrip/segmen/engine/confidence/durasi + buat job `GRADE_SPEAKING` dalam satu transaksi -> hapus berkas bila `keep_recordings=false`), `runGradeSpeaking` (rubrik Speaking, `speaking.v1`, aturan skor Speaking), `cleanupStaleTempDirs` (> 1 jam). Semua job AI memegang advisory lock 727001.
- `recordings.ts`: `setRetention` (pada tiap status terminal), `purgeRecordings` (audit `RECORDING_PURGED` `metadata.count`), `deleteUserRecordings` + `ai/register.ts` (daftar `userAnonymizedHooks`, diimpor oleh `hooks-register.ts` dan worker).
- Rute: `me/recording-consent` (POST 200), `me/recording-preferences` (PATCH 200), `submissions/speaking` (POST 202, bucket `upload_recording`), `submissions/[id]/recording` (GET 200/206, DELETE 204), `admin/submissions/[id]/recording` (GET 200/206 + audit). `GET /ai/status` memuat `recording_retention_days`. Storage: `private/recordings` pada `STORAGE_DIRS` (mkdir 0700 + chmod).

### Keputusan dan klarifikasi (dicatat di spec 013 + `_api-contract.md`)
1. Bila `AI_ENABLED=false` dan `keep_recordings=false`: berkas tidak disimpan (spec hanya menyebut "berkas tetap disimpan" untuk default `true`).
2. `duration_sec` klien tidak disimpan; durasi sah = ffprobe, atau durasi WAV hasil konversi untuk webm tanpa elemen Duration (perilaku MediaRecorder; diuji dengan webm hasil pipa ffmpeg).
3. `AUDIO_*` menghapus berkas + `purged_at`; `STT_EMPTY` mempertahankan berkas (retensi berlaku) dan tidak dapat di-retry; `STT_UNREACHABLE`/kegagalan LLM dapat di-retry (STT ulang hanya bila transkrip belum ada, selain itu hanya `GRADE_SPEAKING`).
4. Setelah STT selesai `submissions.status` = `GRADING` (job `GRADE_SPEAKING` `QUEUED`), sehingga tetap dihitung "submission aktif".
5. Detail 400 field tak dikenal pada multipart: `unrecognized_key`.

### Tes
- Unit: `ai-audio-type-media` (magic bytes dari berkas ffmpeg nyata, `.exe` ditolak, timeout membunuh proses, argumen berbahaya tidak dieksekusi shell, uji statis larangan `exec`/`shell:true`/`-nostdin`/timeout), `ai-text-scoring` (kap Speaking: 25/45/90 dtk, < 15 kata, confidence), `ai-llm-stt`, injeksi Speaking di `tests/security/prompt-injection`.
- Integrasi `tests/integration/ai-speaking.itest.ts` (37): consent 409 -> ok; unggah webm 40 dtk (berkas, dir 0700, sha256, job); `.exe` 415; 11 MB 413 dengan hitungan byte yang ditarik; semua kode validasi; konteks 404/409; Mini-Task; serentak; rate limit 10/jam; ENOSPC; STT mock 60 kata -> GRADED; kap durasi; 151/2 dtk/korup; webm tanpa Duration + m4a; `STT_EMPTY`; `STT_UNREACHABLE` + retry; LLM gagal -> retry hanya `GRADE_SPEAKING`; low_audio_quality + injeksi; log tanpa transkrip; Mini-Task Speaking; non-overlap STT vs Writing; tmp > 1 jam; AI mati; `keep_recordings=false`; retensi 90/30 hari lewat `PUT /admin/settings`; purge 91 vs 89 hari; anonimisasi akun; Range/206/416/404; admin + audit; DELETE + `RECORDING_IN_USE`; `recording_retention_days`.

### Verifikasi (`codes/`, 2026-11-03; mock LLM/STT, ffmpeg/ffprobe nyata, Postgres 16 lokal)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | bersih |
| `npx eslint src tests scripts --max-warnings=0` | bersih |
| `npx vitest run` | 52 berkas, 771 tes lulus |
| `npm run test:integration` | 17 berkas, 401 tes lulus |

### Belum diverifikasi / catatan
- `WhisperCppClient` HANYA diuji dengan server HTTP palsu (bentuk `verbose_json` diasumsikan dari dokumentasi whisper.cpp server); belum terhadap whisper.cpp/model nyata (akurasi, latensi, format respons aktual).
- **Prasyarat benchmark C-09 belum dilakukan** (Ollama + whisper.cpp + GPU/CPU nyata tidak tersedia di lingkungan ini).
- Tidak diuji: perekaman peramban nyata (`MediaRecorder` per browser, iOS Safari), E2E Playwright (fake device), CSP `connect-src 'self'`, kebijakan HTTPS/secure context (sisi klien), kinerja pada ukuran 10 MB di perangkat tanpa GPU.
- Penghapusan berkas pada anonimisasi memanggil storage di dalam transaksi hook; bila transaksi dibatalkan setelahnya, berkas sudah hilang tetapi baris tetap `available` (disajikan 404). Dapat diterima untuk MVP; dicatat.

## [FRONTEND] 2026-11-03 (Frontend Engineer, wave W6; ditulis ulang setelah QA F-12-10/F-13-11, bagian asli tertimpa saat penulisan paralel)

**Spec:** 013 (API Contract #50-#55) | **Status:** Completed (sisi klien, terhadap kontrak; integrasi dengan backend nyata belum diuji)

### Dibangun
- `components/ai/`: `speaking-task` (HTTPS/dukungan -> consent -> pra-cek mikrofon -> persiapan -> rekam -> tinjau -> unggah -> status dua tahap -> hasil), `consent-dialog` (retensi dari `/ai/status`), `speaking-recorder`, `use-voice-recorder` + `lib/ai/recorder.ts` (MIME pertama yang didukung, auto-stop sebelum batas ukuran), `level-meter`, `recording-controls` (pemutar lewat endpoint rekaman milik user, hapus rekaman), `recording-prefs-card`; unggahan multipart dengan progres (`lib/api/upload.ts`).
- Rekam ulang maks 3 kali; rekaman < 3 detik ditolak; `STT_EMPTY` tanpa "Coba lagi" (ada Rekam ulang + Nilai sendiri); transkrip dirender sebagai teks.

### Deviasi yang dicatat (F-13-11): secure context diperiksa SEBELUM consent
Spec Technical Flow langkah 2-3 berurutan consent lalu secure-context. Klien memeriksa secure context/dukungan `MediaRecorder` lebih dulu: `!secure || !supported || consented` menampilkan kartu HTTPS/tidak didukung tanpa dialog consent (`speaking-task.tsx`). Alasan: tanpa secure context mikrofon tidak mungkin dipakai, jadi tidak ada rekaman yang diambil, dan meminta persetujuan untuk alur yang tak dapat berjalan menyesatkan. Server tetap menegakkan consent (409 `RECORDING_CONSENT_REQUIRED` sebelum body dibaca), sehingga bukan kontrol yang dikendurkan. QA menilai dapat diterima; keputusan dicatat juga di spec 013 (Revision History).

### Perbaikan temuan QA (2026-11-03)
- **F-12-04 (MEDIUM, mengenai Speaking)** `ai-sub:v1:{user_id}:{sub_module_id}:mini-speaking` / `{attempt}:{question}` kini terikat pengguna dan dihapus lewat `clearExamStorage` pada logout/401 (lihat dev_log TASK-012 [FRONTEND]).
- **F-13-11 / F-12-10** dicatat di atas. Janji UI penghapusan berkas segera setelah transkripsi (terkait F-13-02) TIDAK diubah: Backend memperbaiki perilakunya agar sesuai teks, jadi `id.ts` dibiarkan.
- **Ditunda (LOW/INFO):** seluruh temuan F-13-04..10, F-13-12/13 (server/tes); F-13-03 (CSP) = Hardening.

### Verifikasi (di `codes/`)
| Perintah | Hasil |
|---|---|
| `tsc --noEmit` | bersih |
| `eslint src tests --max-warnings=0` | bersih |
| `vitest run` | 53 berkas, 786 tes lulus |
| `test:integration` | tidak dijalankan (DB dibagi) |

### Belum diverifikasi
- Perekaman peramban nyata (`MediaRecorder` per browser, iOS Safari), perilaku `isSecureContext` pada `http://192.168.x.x`, E2E Playwright (fake device), CSP `connect-src 'self'`.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 14:20 | Backend W6: implementasi SPEC-013 (consent, unggah, STT, penilaian, retensi/purge, pelayanan/penghapusan/audit rekaman) + tes |
| 2026-11-03 | Frontend W6: bagian [FRONTEND] dipulihkan (F-12-10); deviasi urutan secure-context vs consent dicatat (F-13-11); kunci ai-sub per-user (F-12-04) |

## [BACKEND] Perbaikan QA W6 (2026-11-03 14:40)
Kontrak API tidak berubah; tanpa migrasi skema baru.
- **F-13-01 (HIGH)**: `media.ts` `convertToWav` kini membatasi keluaran (`-t 151`, `-fs` ~4,8 MB), memaksa demuxer menurut MIME hasil deteksi magic bytes (`-f matroska,webm|ogg|mov,...`; F-13-06a), `-protocol_whitelist file`, `-threads 1`, `-vn`. `pipeline.ts` `runSttTranscribe` tidak lagi mempercayai `ffprobe format=duration`: konversi dulu, durasi otoritatif = `wavDurationMs(ukuran WAV)`; > 150 dtk -> `AUDIO_TOO_LONG`, < 3 dtk -> `AUDIO_TOO_SHORT` (kap durasi Part 2 dan baris "Speaking duration" pada prompt memakai nilai ini). Timeout STT dibatasi sebanding durasi (`60 dtk + 2 x durasi`, maks `AI_JOB_TIMEOUT_SEC`) agar kunci global 727001 tidak ditahan lama. `docker-compose.yml` worker: tmpfs `/tmp:size=128m,uid=1000,gid=1000` (WAV <= ~5 MB + masukan <= 10 MB, jauh di bawah `mem_limit` 768m). Tes: unit (webm 200 dtk dengan Duration dipalsukan 10 dtk: ffprobe tertipu, WAV tetap > 150 dtk dan <= batas byte; masukan 600 dtk -> WAV terbatas; format salah ditolak) dan integrasi (`AUDIO_TOO_LONG` pada webm palsu, berkas terhapus). `probeDurationMs` tetap diekspor tetapi tidak lagi dipakai pipeline.
- **F-13-02 (MEDIUM)**: `discardRecordingIfOptedOut` — bila `keep_recordings=false`, berkas dihapus fisik + `purged_at` pada `STT_EMPTY`, kegagalan LLM terminal Speaking, dan kegagalan infrastruktur akhir (`STT_UNREACHABLE`, dst.); percobaan yang masih dapat diulang tidak menghapus. `keep_recordings=true` tidak berubah. Teks UI `i18n/id.ts` diselaraskan: "dihapus segera setelah selesai diproses, berhasil maupun gagal". Tes integrasi mencakup keep true/false.
- F-13-06: bagian (a) selesai (format dipaksa + protocol_whitelist); bagian (b) (pemeriksaan video 4 KB, merek MP4) ditunda.
- **F-13-03 (CSP)**: DITUNDA ke Fase 4 hardening sesuai keputusan; belum dikerjakan.
- Ditunda (dicatat): F-13-04 (berkas yatim saat remove gagal), F-13-05 (audit admin per-Range), F-13-07 (batas env `UPLOAD_MAX_MB_RECORDING`), F-13-08 (tolak driver mock di produksi), F-13-09 (celah tes lain), F-13-10 dan INFO lain.
- Temuan bersama TASK-012 (F-12-01/02/03/05) diperbaiki sekali, lihat dev_log TASK-012.

Verifikasi: `tsc --noEmit` 0; `eslint src tests scripts --max-warnings=0` 0; `vitest run` 53 berkas / 786 tes lulus; `npm run test:integration` 17 berkas / 404 tes lulus (ffmpeg/ffprobe nyata).

### Revision History (tambahan)
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 14:40 | Backend: perbaikan QA W6 (F-13-01, F-13-02, F-13-06a); CSP F-13-03 ditunda ke Fase 4 |
