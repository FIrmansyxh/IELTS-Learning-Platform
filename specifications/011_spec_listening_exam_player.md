# SPEC-011: Listening dengan Pemutar Audio Terkunci pada Mode Ujian (ASM-02, bagian Listening)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-004, SPEC-006
- **Prioritas:** P0
- **Cakupan:** Backend (endpoint audio terotorisasi dengan Range) + Frontend (`ListeningPlayer`, pra-cek audio, section)

## User Story
Sebagai Learner, saya ingin mengerjakan soal Listening dengan pemutar audio yang pada mode ujian tidak bisa di-rewind atau diulang (seperti ujian sesungguhnya) dan pada mode latihan memiliki kontrol penuh, sehingga latihan saya mencerminkan kondisi ujian IELTS.

## Non-Goals / Out of Scope
- Tidak membuat mesin attempt/soal (SPEC-006) dan konversi band (SPEC-009).
- Tidak ada transkrip audio (tidak ada kolom penyimpanan; masuk nice-to-have backlog).
- Tidak ada segmentasi otomatis audio per Section atau pengunci Section berdasarkan waktu; Section hanya pengelompokan soal (`section_no`).
- Tidak mengklaim penguncian rewind sebagai kontrol keamanan: pengguna teknis tetap dapat memutar ulang di luar aplikasi (risiko diterima, `security-standards.md` 6.3.7 dan 17.6).
- Tidak ada unduhan audio, tidak ada URL audio permanen atau publik.
- Tidak ada pembuatan atau unggah audio (SPEC-018).
- Tidak ada waktu "transfer jawaban" terpisah; waktu pemindahan jawaban adalah bagian dari `time_limit_seconds` set.
- Tidak ada pemutar audio untuk Speaking (SPEC-013).

## Technical Flow
1. Attempt dimulai (SPEC-006); respons memuat `listening: { audio_url, mime_type, duration_sec }` bila set punya `listening_asset_id`.
2. Sebelum ujian dimulai (`ExamIntro`, `requires_audio=true`), learner melakukan pra-cek: menekan "Putar nada uji" (nada 440 Hz selama 1 detik lewat WebAudio, tanpa berkas) dan mencentang "Saya dapat mendengar nada dan volume sudah sesuai". Tombol "Mulai Ujian" aktif setelah dicentang.
3. Pada `/ujian/{attempt_id}` browser memuat `<audio preload="metadata">` dengan `src = listening.audio_url`.
4. Browser meminta `GET /api/v1/attempts/{attempt_id}/audio` (dengan header `Range` oleh peramban).
5. Server memeriksa kepemilikan attempt, status `IN_PROGRESS`, dan keberadaan aset; mengalirkan berkas dari `StorageDriver` dengan dukungan `Range`.
6. Learner menekan "Putar"; `ListeningPlayer` mulai memutar dan melacak `lastPosition` (detik) setiap 500 ms.
7. Mode `EXAM`: pemutar tidak menyediakan jeda, geser, ulang; peristiwa `seeking` yang melompat > 1,5 detik dari `lastPosition` dikembalikan ke `lastPosition`.
8. Learner menjawab soal per Section; jawaban disimpan seperti SPEC-010 langkah 6 (EXAM: otomatis; PRACTICE: "Periksa").
9. Saat audio berakhir (`ended`), pemutar menampilkan "Audio selesai" dan tombol Putar nonaktif (EXAM) sedangkan waktu ujian terus berjalan.
10. Learner mengirim ujian (`POST /attempts/{id}/submit`) atau waktu habis (SPEC-006 D3).

## API Contract
Konvensi: `_api-contract.md` bagian 1. Kode umum: `UNAUTHENTICATED`, `PASSWORD_CHANGE_REQUIRED`, `NOT_FOUND`, `RATE_LIMITED` (bucket `general_user`), `INTERNAL_ERROR`.

### GET /api/v1/attempts/{attempt_id}/audio
- **Auth:** user
- **Success status:** 200 (tanpa `Range`) atau 206 (dengan `Range`)
- **Zod:** path `attempt_id` uuid (`AudioStreamParamsSchema`)
- **Request:** tanpa body; header opsional `Range: bytes=<start>-<end?>` (hanya satu rentang; multi-rentang -> abaikan header dan balas 200 penuh).
- **Query opsional:** `section` (uuid set anak Boss) HANYA untuk attempt bertipe `TIER_BOSS_EXAM` (SPEC-014): audio yang dilayani = `listening_asset_id` set anak itu, dan section harus `ACTIVE` (selain itu 409 `ATTEMPT_NOT_ACTIVE`); untuk attempt Boss tanpa `section` -> 404 `NOT_FOUND`; untuk attempt non-Boss, `section` diabaikan.

**Header respons (WAJIB):**
| Header | Nilai |
|---|---|
| `Content-Type` | `content_assets.mime_type` (hanya `audio/mpeg`, `audio/ogg`, `audio/wav`) |
| `Accept-Ranges` | `bytes` |
| `Content-Length` | panjang yang dikirim |
| `Content-Range` | `bytes <start>-<end>/<total>` (hanya 206) |
| `Cache-Control` | `private, no-store` |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Disposition` | `inline` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
Body: aliran byte berkas audio. Contoh permintaan/respons: `Range: bytes=0-1023` -> `206`, `Content-Range: bytes 0-1023/4812344`.

**Response (Error)** (body JSON error standar)
| HTTP | Error Code | Kapan terjadi |
|------|-----------|---------------|
| 404 | NOT_FOUND | Attempt tidak ada atau bukan milik user; set tidak punya `listening_asset_id`; aset bukan kind `AUDIO_LISTENING`; berkas storage hilang |
| 409 | ATTEMPT_NOT_ACTIVE | Attempt bukan `IN_PROGRESS` (audio tidak dilayani setelah selesai) |
| 416 | RANGE_NOT_SATISFIABLE | `start >= total` atau rentang tidak valid; header `Content-Range: bytes */<total>` |

Kontrak data yang dipakai (dari SPEC-006): `AttemptDTO.listening = { "audio_url": "/api/v1/attempts/9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a/audio", "mime_type": "audio/mpeg", "duration_sec": 284 }`; `QuestionPublicDTO.section_no` (1-4 atau null).

## Database Changes
Tidak ada tabel/kolom baru. Membaca `assessment_sets.listening_asset_id`, `content_assets` (`storage_key`, `mime_type`, `size_bytes`, `duration_sec`). `localStorage`: `audio:v1:{attempt_id}` = JSON `{ "position_sec": number }` (try/catch).

## UI/UX
Rujukan: `design-system.md` 5.14 Listening Ujian, 5.19 Mode Ujian, 5.12 Kuis/Mesin Soal, 7 Accessibility (kontrol ujian ber-`aria-label`), 8.6 wireframe Listening Ujian.

**Komponen `ListeningPlayer` (props: `mode: "EXAM" | "PRACTICE"`, `audioUrl`, `durationSec`):**
- **EXAM:** kartu audio; Button Putar `lg` 56px (`aria-label="Putar audio"`); Progress audio `role="progressbar"` `aria-readonly="true"` tidak dapat diklik/digeser; waktu `mm:ss / mm:ss` (`tabular-nums`); kontrol volume saja (slider `aria-label="Volume"`); TANPA tombol jeda, mundur, ulang, kecepatan. Teks tetap: "Audio hanya diputar satu kali seperti di ujian sebenarnya." Elemen `<audio>` tidak fokusable dan pintasan media (spasi, panah) tidak mengendalikan audio. Status: `Belum diputar` -> `Sedang diputar` -> `Audio selesai` (ikon + teks).
- **Gangguan EXAM:** bila pemutaran berhenti bukan oleh learner (peristiwa `pause`/`stalled`/`error`), tampil Banner `role="alert"` "Audio terhenti." dengan Button "Lanjutkan Audio" yang melanjutkan dari `lastPosition` (bukan dari awal) dan, bila galat jaringan, "Muat ulang audio" yang memuat ulang `src` lalu melanjutkan dari `lastPosition`.
- **Muat ulang halaman (EXAM):** bila `audio:v1:{attempt_id}` ada, pemutar menampilkan "Lanjutkan Audio" dan memulai dari `position_sec`; bila tidak ada, dari 0.
- **PRACTICE:** kontrol penuh: Putar/Jeda, Progress dapat digeser (`role="slider"`), "Mundur 5 detik", kecepatan 0.75x/1x, volume.
- **Section:** bila ada lebih dari satu nilai `section_no` pada soal, tampil Tabs "Section 1..4" (navigasi bebas, tanpa penguncian); selain itu satu daftar soal. Panel soal memakai `QuestionRenderer` (SPEC-006) dan perilaku simpan SPEC-010 langkah 6.
- **Pra-cek (`ExamIntro` bagian audio):** Button "Putar nada uji" + Checkbox konfirmasi; tanpanya "Mulai Ujian" disabled dengan teks "Lakukan pengecekan audio terlebih dahulu."
- **Setelah audio berakhir (EXAM):** Banner info "Audio selesai. Periksa jawaban Anda sebelum waktu habis."
- **State:** loading metadata = Skeleton kartu audio; galat 404/409 = kartu "Audio tidak tersedia" + Button "Coba lagi"; autoplay tidak pernah dilakukan (selalu butuh klik).
- Aksesibilitas: status audio diumumkan via `aria-live="polite"` (Sedang diputar/Audio selesai); Button Putar punya fokus ring; tidak ada animasi berlebih saat audio berjalan (gelombang statis opsional).

## Acceptance Criteria
- [ ] **Given** attempt `IN_PROGRESS` milik user pada set ber-audio berukuran 4.812.344 byte **When** `GET /attempts/{id}/audio` dengan `Range: bytes=0-1023` **Then** 206, `Content-Range: bytes 0-1023/4812344`, `Content-Length: 1024`, `Accept-Ranges: bytes`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Type: audio/mpeg`.
- [ ] **Given** tanpa header `Range` **When** dipanggil **Then** 200 dengan seluruh berkas dan `Content-Length: 4812344`.
- [ ] **Given** `Range: bytes=9999999-` **When** dipanggil **Then** 416 `RANGE_NOT_SATISFIABLE` dengan `Content-Range: bytes */4812344`.
- [ ] **Given** attempt milik user lain **When** dipanggil **Then** 404 `NOT_FOUND` (bukan 403); tanpa sesi 401.
- [ ] **Given** attempt `GRADED` **When** dipanggil **Then** 409 `ATTEMPT_NOT_ACTIVE`.
- [ ] **Given** set tanpa audio **When** dipanggil **Then** 404 `NOT_FOUND`.
- [ ] **Given** berkas hilang di storage tetapi baris ada **When** dipanggil **Then** 404 `NOT_FOUND` dan log `error` `asset_file_missing` tanpa path.
- [ ] **Given** respons audio **When** headernya diperiksa **Then** tidak ada `Content-Disposition: attachment` dan tidak ada URL permanen (`audio_url` mengandung `attempt_id`, bukan `asset_id`).
- [ ] **Given** mode EXAM **When** DOM `ListeningPlayer` diperiksa **Then** tidak ada elemen dengan nama aksesibel mengandung "Jeda", "Mundur", "Ulang", "Kecepatan"; Progress audio `aria-readonly="true"`; `<audio>` tidak punya atribut `controls`.
- [ ] **Given** mode EXAM saat audio berjalan di detik 30 **When** peristiwa `seeking` memindahkan `currentTime` ke 5 **Then** `currentTime` dikembalikan ke `lastPosition` (selisih <= 1,5 detik) dan pemutaran berlanjut.
- [ ] **Given** pemutaran terhenti oleh peristiwa `pause` yang bukan dari learner **When** Banner tampil dan "Lanjutkan Audio" ditekan **Then** audio lanjut dari `lastPosition` (+/- 2 detik), bukan dari 0.
- [ ] **Given** EXAM, `lastPosition = 61` tersimpan di `localStorage` **When** halaman direfresh **Then** tombol "Lanjutkan Audio" tampil dan pemutaran dimulai di 61 +/- 2 detik.
- [ ] **Given** audio berakhir (EXAM) **When** `ended` terpicu **Then** status "Audio selesai", tombol Putar disabled, dan Banner info tampil; timer ujian tetap berjalan.
- [ ] **Given** mode PRACTICE **When** learner menekan "Mundur 5 detik" dan memilih kecepatan 0.75x **Then** `currentTime` berkurang 5 (minimum 0) dan `playbackRate = 0.75`.
- [ ] **Given** `requires_audio=true` **When** pra-cek belum dikonfirmasi **Then** "Mulai Ujian" disabled; setelah centang enabled.
- [ ] **Given** set dengan soal ber-`section_no` 1-3 **When** halaman dibuka **Then** Tabs "Section 1".."Section 3" tampil dan berpindah tidak mereset jawaban.
- [ ] **Given** viewport 375x812 **When** halaman Listening dibuka **Then** tidak ada scroll horizontal; Button Putar >= 44px (56px pada EXAM).
- [ ] **Given** CSP produksi **When** audio diputar **Then** tidak ada pelanggaran (`media-src 'self' blob:`).
- [ ] **Given** E2E Playwright (fixture audio nada 10 detik, 4 soal) **When** learner memutar, mencoba menggeser progress (klik pada bar), lalu menjawab dan mengirim **Then** klik pada bar tidak mengubah posisi, dan hasil tampil.

## Edge Cases & Validation
- [ ] Peramban yang mengirim beberapa permintaan `Range` paralel (Safari): server menjawab masing-masing independen tanpa kondisi balapan.
- [ ] `Range: bytes=-500` (sufiks): didukung (500 byte terakhir).
- [ ] Koneksi terputus saat streaming: server menghentikan alur tanpa 500 dan tanpa kebocoran deskriptor berkas.
- [ ] Tab menjadi `hidden` saat EXAM: audio tetap berjalan sesuai kebijakan peramban; jika peramban menjeda, mekanisme gangguan di atas berlaku.
- [ ] Format `audio/wav` besar (<= 50 MB): didukung lewat `Range`.
- [ ] Learner mengubah `playbackRate` lewat konsol pada EXAM: dikembalikan ke 1 pada `ratechange` (guard klien); tidak dianggap pelanggaran server.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft |
