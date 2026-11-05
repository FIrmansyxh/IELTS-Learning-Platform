# Dev Log TASK-011: Listening dengan Audio Terkunci Mode Ujian

## Metadata
- **Fitur / Task:** TASK-011 (Listening dengan Audio Terkunci Mode Ujian)
- **Spesifikasi:** `specifications/011_spec_listening_exam_player.md`
- **Tanggal Mulai:** 2026-11-04 09:00 WIB
- **Tanggal Selesai:** 2026-11-04 09:25 WIB
- **Pelaksana:** Orchestrator (Fullstack: Backend Engineer + Frontend Engineer)
- **Status:** Development Complete, Tests Passing

---

## 1. Komponen & Berkas yang Dibuat / Dimodifikasi

### Backend:
1. **`codes/src/server/storage/index.ts`**
   - Menambahkan metode `stat(key: string): Promise<{ size: number } | null>` dan `readStream(key: string, range?: { start: number; end: number }): Promise<ReadableStream<Uint8Array>>` pada antarmuka `StorageDriver` dan kelas `FsStorageDriver`.
   - Menggunakan `createReadStream` dari `node:fs` yang dikonversi ke Web `ReadableStream` melalui `Readable.toWeb` untuk streaming efisien tanpa memuat seluruh berkas ke memori.
2. **`codes/src/server/http/errors.ts`**
   - Menambahkan kode `RANGE_NOT_SATISFIABLE: { status: 416, message: 'Rentang byte yang diminta tidak valid.' }` ke registri `REGISTRY`.
3. **`codes/src/lib/audio/range.ts`**
   - Parser rentang byte HTTP murni (`parseByteRange`) sesuai RFC 9110 & SPEC-011:
     - Multi-rentang (dengan koma) diabaikan dan mengembalikan `{ type: 'full' }` (status 200).
     - Rentang baku `bytes=0-1023` -> `{ type: 'partial', start: 0, end: 1023 }`.
     - Rentang terbuka `bytes=1000-` -> `{ type: 'partial', start: 1000, end: total - 1 }`.
     - Rentang sufiks `bytes=-500` -> `{ type: 'partial', start: total - 500, end: total - 1 }`.
     - Rentang invalid (`start >= totalSize`, `end < start`, `bytes=-0`) -> `{ type: 'invalid' }`.
4. **`codes/src/app/api/v1/attempts/[attempt_id]/audio/route.ts`**
   - Route handler `GET` dengan pembungkus `withApi({ auth: 'user', params: AttemptIdParamSchema, query: AudioStreamQuerySchema })`.
   - Verifikasi kepemilikan attempt oleh pengguna (`userId === user.id`). Jika bukan milik pengguna -> 404 `NOT_FOUND` (bukan 403).
   - Verifikasi status attempt: harus `IN_PROGRESS`. Jika attempt selesai/graded -> 409 `ATTEMPT_NOT_ACTIVE`.
   - Penanganan `TIER_BOSS_EXAM`: memeriksa query `section` anak, memastikan status section `ACTIVE` (selain itu 409).
   - Verifikasi `listening_asset_id` dan `kind === 'AUDIO_LISTENING'`.
   - Pengecekan keberadaan berkas fisik storage: jika hilang di disk, mencatat log `asset_file_missing` tanpa path berkas dan melempar 404 `NOT_FOUND`.
   - Header respons wajib: `Content-Type`, `Accept-Ranges: bytes`, `Content-Length`, `Content-Range` (untuk 206), `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cross-Origin-Resource-Policy: same-origin`.

### Frontend:
1. **`codes/src/i18n/id.ts`**
   - Menambahkan kamus `listening: { ... }` untuk tombol putar, banner gangguan ("Audio terhenti."), banner selesai, pra-cek nada uji, konfirmasi pra-cek, section tabs, dan teks aksesibilitas.
2. **`codes/src/components/listening/listening-player.tsx`**
   - Komponen `ListeningPlayer` dengan dukungan 2 mode:
     - **Mode EXAM (Terkunci):**
       - Wadah kartu audio dengan `role="region" aria-label="Pemutar Audio"`.
       - Tombol Putar besar 56px (`h-14 w-14`) dengan `aria-label="Putar audio"`.
       - Indikator kemajuan `role="progressbar"` dengan `aria-readonly="true"` (tidak dapat diklik/digeser).
       - Bebas dari tombol Jeda, Mundur, Ulang, dan Kecepatan pada DOM.
       - Elemen `<audio>` memiliki `tabIndex={-1}` tanpa atribut `controls`.
       - Anti-rewind seeking clamp: mendeteksi peristiwa `seeking` yang melompat $>1.5$ detik dari `lastPosition` dan mengembalikan `currentTime` ke `lastPosition`.
       - Guard `ratechange`: memastikan `playbackRate` selalu kembali ke 1.
       - Pelacakan posisi berkala setiap 500 ms ke `localStorage['audio:v1:{attempt_id}']`.
       - Pemulihan gangguan: banner `role="alert"` muncul jika peramban menjeda audio dengan tombol "Lanjutkan Audio" (melanjutkan dari `lastPosition`) dan "Muat ulang audio".
       - State audio selesai: tombol putar dinonaktifkan, status "Audio selesai" diumumkan melalui `aria-live="polite"`, dan banner info ditampilkan.
     - **Mode PRACTICE (Bebas):**
       - Kontrol lengkap: Putar / Jeda, Mundur 5 detik (`aria-label="Mundur 5 detik"`), selektor kecepatan (0.75x, 1x), progress slider seekable (`role="slider"`).
3. **`codes/src/components/exam/exam-intro.tsx`**
   - Pengecekan audio sebelum ujian (`ExamIntroView` saat `requires_audio=true`):
     - Tombol "Putar nada uji" memutar nada sinus 440 Hz selama 1 detik menggunakan Web Audio API tanpa berkas.
     - Checkbox konfirmasi: "Saya dapat mendengar nada dan volume sudah sesuai".
     - Tombol "Mulai Ujian" dinonaktifkan dengan peringatan "Lakukan pengecekan audio terlebih dahulu." sebelum dicentang.
4. **`codes/src/components/exam/exam-runner.tsx`**
   - Menampilkan `ListeningPlayer` di atas area soal ketika `attempt.listening` tersedia.
   - Menampilkan tabs Section ("Section 1..4") jika soal memiliki lebih dari satu nilai `section_no`. Berpindah section mengarahkan navigasi ke soal pertama section tersebut tanpa mereset jawaban yang tersimpan.

---

## 2. Pengujian & Verifikasi

- **Unit Test Stream & Range (`codes/tests/unit/listening-stream.test.ts`):**
  - 15 pengujian lulus (parser rentang byte, status 200 tanpa range, status 206 dengan range, status 416 range tak valid, 404 attempt asing / set tanpa audio / berkas hilang, 409 attempt non-aktif).
- **Unit Test Listening Player & Pra-cek (`codes/tests/unit/listening-player.test.tsx`):**
  - 12 pengujian lulus (EXAM player terkunci, anti-rewind clamp, guard kecepatan, alert banner gangguan, pemulihan localStorage, audio ended, PRACTICE controls 5s rewind & 0.75x speed, audio precheck tone & checkbox).
- **Hasil Verifikasi Penuh:**
  - `tsc --noEmit`: 0 error
  - `eslint . --max-warnings=0`: 0 warning
  - `npm test`: **39 test files, 563 tests passed (100% lulus)**
