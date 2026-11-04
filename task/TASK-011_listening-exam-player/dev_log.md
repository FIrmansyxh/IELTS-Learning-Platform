# Dev Log TASK-011: Listening dengan Audio Terkunci Mode Ujian

## [BACKEND] 2026-11-03 13:15 (Backend Engineer, wave W5)

**Spec:** 011 | **Status:** Completed (sisi server)

### Audit
Endpoint #42 belum ada. Sudah ada dan dipakai ulang: `AttemptDTO.listening` (`audio_url` berbasis attempt_id), `isExpired`/deadline (`attempts/service.ts`), `StorageDriver`, tipe aset `AUDIO_LISTENING` (SPEC-018), pola `Response` mentah di `withApi`, error registry.

### Dibangun
- `src/app/api/v1/attempts/[attempt_id]/audio/route.ts`: `GET` `auth: 'user'`, params `AudioStreamParamsSchema`, query `AudioStreamQuerySchema` (`src/contracts/attempts.ts`, aditif).
- `src/server/attempts/audio.ts` (`serveAttemptAudio`): attempt milik user (bukan milik = 404); status `IN_PROGRESS` dan belum lewat deadline+5 dtk (selain itu 409 `ATTEMPT_NOT_ACTIVE`); set TIER_BOSS_EXAM: wajib `?section=` anak set induk dengan `state.sections[section].phase === 'ACTIVE'` (tanpa section/bukan anak/tanpa audio = 404, tidak aktif = 409); aset harus `AUDIO_LISTENING`, bukan EXTERNAL, MIME mpeg/ogg/wav (`x-wav`/`vnd.wave` dinormalisasi ke `audio/wav`) selain itu 404; berkas hilang = 404 + log `asset_file_missing` tanpa path.
- `src/server/attempts/audio-range.ts` (`parseAudioRange`, murni): satu rentang, ujung terbuka, sufiks `-N`, ujung dipotong; multi-rentang / satuan bukan `bytes` = 200 penuh; cacat, `start >= total`, `start > end`, `-0` = 416.
- `src/server/storage/index.ts`: `StorageDriver.size()` dan `openRange()` (aliran `createReadStream`, tanpa memuat berkas ke memori; pembatalan klien menutup fd).
- `src/server/http/errors.ts`: `RANGE_NOT_SATISFIABLE` (416); respons 416 membawa `Content-Range: bytes */<total>`.
- Header semua respons sukses: `Content-Type`, `Accept-Ranges: bytes`, `Content-Length`, `Content-Range` (206), `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin`; tanpa ETag. Rate limit `general_user` (300/menit) berlaku.

### Penegakan kunci audio mode ujian (catatan keputusan)
Spec 011 (Non-Goals) menyatakan penguncian rewind/ulang adalah kontrol UX klien, bukan kontrol keamanan. Server menegakkan yang dapat ditegakkan tanpa melanggar AC: kepemilikan, `IN_PROGRESS`, audio berhenti dilayani setelah submit/expire/deadline (kunci pasca-ujian), section Boss harus `ACTIVE`, URL hanya via attempt_id, tanpa cache/unduhan. Pembatasan "satu kali putar" di server (mis. menolak Range mundur) sengaja TIDAK dibuat: bertentangan dengan AC (Range 0-1023 berulang, Range paralel Safari, "Muat ulang audio"/resume dari `position_sec`). Bila ingin ketat, perlu keputusan produk + perubahan spec.

### Perubahan kontrak (aditif, dicatat di spec 011 + `_api-contract.md`)
409 juga untuk EXAM lewat deadline+5 dtk; `section` harus uuid (400) dan diabaikan untuk non-Boss; WAV varian dinormalisasi. Path/method/skema DB tidak berubah. Tidak ada perubahan yang memengaruhi FE selain perilaku di atas (`listening.audio_url` tetap `/api/v1/attempts/{id}/audio`; Boss: `?section=` ditambahkan SPEC-014).

### Tes
- `tests/unit/audio-range.test.ts` (5).
- `tests/integration/audio.itest.ts` (19): AC1 (206 + semua header + isi byte), AC2 (200 penuh 4.812.344 byte), AC3 (416), AC4 (milik user lain 404, tanpa sesi 401, id bukan uuid 400), AC5 (GRADED/ABANDONED 409), EXAM deadline (toleransi 5 dtk, 409 tanpa efek samping), AC6 (tanpa audio / bukan AUDIO_LISTENING / MIME tak diizinkan 404), AC7 (berkas hilang 404 + log tanpa path), AC8 (tanpa attachment, tanpa URL asset_id, WAV/OGG), sufiks/ujung terbuka/dipotong/multi-rentang, Range paralel, putus koneksi, `section` non-Boss diabaikan, rate limit 429, Boss (ACTIVE 206, tanpa section 404, PENDING/DONE/hilang 409, bukan anak/tanpa audio 404, user lain 404), `listening` pada DTO.

### Verifikasi (codes/, 2026-11-03)
| Perintah | Hasil |
|---|---|
| `npx tsc --noEmit` | lulus |
| `npx vitest run` | 38 berkas, 540 tes lulus |
| `npm run test:integration` | 15 berkas, 316 tes lulus (Postgres 16 lokal) |
| `npx eslint src tests scripts --max-warnings=0` | 1 peringatan di berkas FE `src/components/listening/listening-player.tsx:304` (`aria-readonly` pada `role="progressbar"` tidak didukung rule `jsx-a11y`); kode Backend bersih |
Tidak diverifikasi: AC UI (ListeningPlayer, pra-cek, Tabs section), E2E Playwright, CSP produksi `media-src`, pemutaran audio nyata di peramban (Safari), penyajian lewat `next start` (tes memanggil handler langsung), Boss end-to-end (SPEC-014 belum ada; state section disimulasikan di DB).

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 13:15 | Backend W5: endpoint audio Range + tes; kontrak aditif dicatat |


---

## [FRONTEND] 2026-11-03 13:20 (Frontend Engineer, wave W5)

Spec: `specifications/011_spec_listening_exam_player.md` terhadap `specifications/_api-contract.md` (FINAL, endpoint #42). `<audio>` memuat `AttemptDTO.listening.audio_url` langsung (stream media, bukan JSON); metadata attempt di-parse Zod lewat `AttemptSchema` yang sudah ada.

### Yang dibangun
- `src/components/listening/listening-player.tsx` (`ListeningPlayer`, props `mode`, `audioUrl`, `durationSec`, opsional `attemptId`, `onEnded`):
  - EXAM: Button Putar 56px, progress read-only, `mm:ss / mm:ss` `tabular-nums`, hanya volume; tanpa jeda/mundur/ulang/kecepatan; `<audio>` tanpa `controls`, `preload="metadata"`, tanpa autoplay; teks tetap "Audio hanya diputar satu kali seperti di ujian sebenarnya."; status Belum diputar / Sedang diputar / Audio selesai (ikon + teks, `aria-live="polite"`); `seeking` melompat > 1,5 detik dikembalikan ke `lastPosition` (dilacak tiap 500 ms, disimpan ke `audio:v1:{attempt_id}`); `ratechange` dikembalikan ke 1; `pause`/`stalled`/`error` saat diputar = Banner `role=alert` "Audio terhenti." dengan "Lanjutkan Audio" (dari `lastPosition`) dan, untuk galat jaringan, "Muat ulang audio"; muat ulang halaman = "Lanjutkan Audio" dari posisi tersimpan; setelah `ended` tombol Putar disabled + Banner info, timer ujian tetap berjalan.
  - PRACTICE: Putar/Jeda, slider posisi, "Mundur 5 detik" (min 0), kecepatan 0.75x/1x, volume.
  - State: Skeleton sebelum metadata, kartu "Audio tidak tersedia" + "Coba lagi" bila galat sebelum termuat.
- `src/components/exam/audio-precheck.tsx` + `ExamIntroView`: nada uji 440 Hz 1 detik lewat WebAudio (tanpa berkas) dan Checkbox konfirmasi; "Mulai Ujian" disabled dengan teks "Lakukan pengecekan audio terlebih dahulu." sampai dicentang (tidak diwajibkan untuk "Lanjutkan Ujian" pada attempt berjalan).
- `GroupedExamBody` (Listening): Tabs "Section 1..4" bila ada > 1 nilai `section_no` (navigasi bebas, jawaban tidak direset), selain itu satu daftar; pemutar sticky di >= lg; footer Soal sebelumnya/berikutnya, Daftar soal, Kirim. `ActiveDrill` menampilkan `ListeningPlayer` mode PRACTICE.
- Teks i18n: `listening.*`, `audioCheck.*`, `exam.intro.audioCheckFirst`.

### Keputusan dan deviasi (perlu keputusan Orchestrator/Analyst)
1. **`aria-readonly` pada progress audio TIDAK dipasang.** Spec meminta `role="progressbar"` + `aria-readonly="true"`, tetapi atribut itu tidak valid untuk `progressbar` (axe-core `aria-allowed-attr` = critical, terbukti saat diuji ad hoc; eslint `jsx-a11y/role-supports-aria-props` juga memperingatkan) dan bertentangan dengan WCAG AA. Diganti `role="progressbar"` valid, tanpa `tabindex` dan tanpa handler interaksi, ditandai `data-readonly="true"`. AC yang memeriksa atribut `aria-readonly` perlu diubah (usulan: periksa `data-readonly` atau tidak adanya handler), atau ganti role menjadi `slider` + `aria-readonly` bila ingin atribut itu.
2. Banner "Audio terhenti." juga muncul pada `stalled` saat buffering lambat dan hilang otomatis begitu event `playing` kembali.
3. Boss (SPEC-014, query `?section=`) belum dikerjakan di klien; `sections` pada attempt Boss belum dipakai.

### Catatan untuk Backend
- Tidak ada drift kontrak. `duration_sec` dapat bernilai 0 (`?? 0` di `dto.ts`); klien menutupinya dengan `audio.duration` setelah metadata termuat.
- Klien bergantung pada: `206` + `Accept-Ranges: bytes` (agar peramban dapat mulai dari `currentTime` tersimpan), `Cache-Control: private, no-store`, dan `Content-Type` audio yang tepat. Respons 404/409 dari `<audio src>` tampil di klien sebagai galat media (kartu "Audio tidak tersedia"); klien tidak membaca kode galat JSON-nya.

### Verifikasi (dijalankan di `codes/`, 2026-11-03)
`npx tsc --noEmit` bersih; `npx eslint src tests --max-warnings=0` bersih; `npx vitest run`: 42 berkas, 589 tes lulus. Tes: `components/listening/listening.test.tsx` (20: mode EXAM terkunci, seeking, gangguan + lanjut, muat ulang audio, resume 61 detik, ended, ratechange, PRACTICE, pra-cek ExamIntro dan WebAudio, Tabs Section, Kirim), `components/quiz/active-drill-media.test.tsx` (2). Audit axe-core ad hoc pada Listening: 0 pelanggaran setelah deviasi 1.
Belum diverifikasi: pemutaran audio nyata dan penanganan `Range` di Chrome/Safari/Firefox (jsdom tidak memutar media; peristiwa disimulasikan), CSP produksi `media-src 'self' blob:`, 375px/terang-gelap di peramban, E2E Playwright, pembaca layar.

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 13:20 | Frontend W5: ListeningPlayer terkunci, pra-cek audio, Section Tabs; deviasi aria-readonly dicatat |

## [FRONTEND] Perbaikan QA W5 (2026-11-03)
- F-11-01 (MEDIUM) selesai: `lastPosition` kini mengikuti kemajuan alami (tick 500 ms dan `timeupdate`, selama `!seeking` dan `ct >= lastPosition`); penjaga selisih 1,5 dtk hanya di `onSeeking`. Tes baru: currentTime maju 30 dtk tanpa seeking, lalu seeking ke 5 kembali ke ~31.
- F-11-04 selesai: `aria-valuemax = max(1, total)`; spec 011 (UI/UX EXAM dan AC) dan design-system 5.14 diperbarui menjadi progressbar valid tanpa `aria-readonly`, tanpa tabindex/handler. `data-readonly` dipertahankan (tidak merusak, tanpa makna ARIA).
- F-11-05(a) selesai (tes jeda pelacak). Ditunda (LOW/INFO): F-11-03, F-11-05(b-d), F-11-06, F-11-08, F-11-09, F-11-10 (backend/E2E/Tester).
- Verifikasi: tsc bersih; eslint src tests --max-warnings=0 bersih; vitest run 44 berkas, 621 tes lulus (test:integration tidak dijalankan).

## [BACKEND] Perbaikan QA W5 (2026-11-03)
- F-11-02 (MEDIUM) selesai: (1) bucket `audio_stream` 60/menit/pengguna (rute `audio`, `rateLimit` `user`); (2) maks 4 aliran serentak per pengguna (`server/attempts/audio-limits.ts`; slot dilepas saat aliran selesai/dibatalkan/galat, kedaluwarsa otomatis 15 menit bila tertinggal; 429 `RATE_LIMITED` + `Retry-After: 2`); (3) bucket `audio_full` 6/jam per attempt untuk permintaan tanpa `Range` / multi-rentang / satuan non-bytes (200 penuh); permintaan `Range` (termasuk `bytes=0-`) tidak dihitung ke bucket ini. Risiko diterima: semua penghitung in-memory per proses (sama seperti rate limit lain; host tunggal MVP); `Range: bytes=0-` tetap dapat mengalirkan penuh tetapi dibatasi 60/menit dan 4 serentak.
- F-11-03 (LOW) selesai: definisi tunggal `server/attempts/audio-asset.ts` (`servedAudioMime`) dipakai endpoint dan DTO. `AttemptDTO.listening` = `null` bila aset bukan `AUDIO_LISTENING`, EXTERNAL, tanpa `storage_key`, atau MIME di luar allow-list; `mime_type` DTO dinormalisasi (`audio/wav` untuk varian WAV). Dampak klien: aditif/kompatibel, skema Zod `listening` memang `nullable()`; `grouped-exam`/`active-drill` sudah menangani `listening === null` (pemutar tidak dirender, bukan galat di tengah ujian). Spec 011 Revision History dan `_api-contract.md` (tabel rate limit) diperbarui.
- Tes: `tests/unit/audio-limits.test.ts` (7), `audio.itest.ts` +5 (60/menit, 6 tanpa Range/attempt, 4 serentak + pelepasan slot, DTO WAV dinormalisasi, DTO null untuk IMAGE/flac).
- Ditunda (LOW/INFO): `requires_audio` di intro ujian (`exams/service.ts:44`) masih `listeningAssetId !== null` sehingga bisa true saat `listening` null (butuh query aset; konsisten bila aset sah, kasus ini seharusnya dicegah blocker publikasi); blocker publikasi untuk aset listening tak dapat dilayani (butuh kode `Blocker` baru, menyentuh kontrak admin); F-11-05(b-d), F-11-06, F-11-08, F-11-09, F-11-10 (E2E/Tester/pantau). F-11-01/04 milik FE (sudah selesai).
- Verifikasi (`codes/`): tsc bersih; eslint src tests scripts --max-warnings=0 bersih; vitest run lulus; test:integration 15 berkas / 320 tes lulus (audio.itest.ts 24).

### Revision History
| Timestamp | Changes |
|-----------|---------|
| 2026-11-03 | Backend Fix QA W5: F-11-02 batas laju/serentak/tanpa Range; F-11-03 DTO listening hanya bila dapat dilayani |
