# SPEC-010: Split-Screen Reading dengan Highlighter (ASM-02, bagian Reading)

## Metadata
- **Author:** Analyst Agent
- **Created:** 2026-11-03
- **Status:** approved
- **Depends on:** SPEC-004, SPEC-006
- **Prioritas:** P0
- **Cakupan:** Frontend-dominan (komponen `ReadingWorkspace`) + kontrak data BE (format teks bacaan, field DTO) dan utilitas bersama `parsePassages`

## User Story
Sebagai Learner, saya ingin mengerjakan soal Reading dalam tampilan terbelah (teks bacaan dengan penyorot di kiri, soal di kanan, masing-masing dapat digulir sendiri) dan di layar sempit berpindah antar tab Teks/Soal, sehingga saya dapat membaca dan menjawab seperti pada ujian IELTS berbasis komputer.

## Non-Goals / Out of Scope
- Tidak membuat mesin attempt, penilaian, atau API baru (SPEC-006). Spec ini hanya memakai `AttemptDTO.passage_markdown` dan `QuestionPublicDTO.passage_no`.
- Tidak menyimpan sorotan, tanda soal, atau rasio pembagi ke server (hanya `localStorage` perangkat; sengaja tidak masuk DB).
- Tidak ada catatan/anotasi teks bebas, kamus, terjemahan, atau fitur "baca keras".
- Tidak ada penyorotan lintas paragraf.
- Tidak ada pembuatan atau penyuntingan teks bacaan (SPEC-004/019/020).
- Tidak ada pencarian dalam teks (Ctrl+F peramban tetap bekerja).
- Tidak ada aturan penilaian baru; skor tetap dari SPEC-006.

## Kontrak Format Teks Bacaan (berlaku untuk `assessment_sets.reading_passage_markdown`)
1. Maksimal 3 teks dipisahkan oleh baris yang PERSIS `===PASSAGE===` (tanpa spasi lain).
2. Baris pertama tak kosong sebuah teks BOLEH berupa judul `# Judul` (disimpan sebagai `title`; tanpa judul -> `title = "Teks {n}"`).
3. Paragraf dipisahkan baris kosong. Paragraf yang diawali `[X] ` (X = satu huruf besar A-Z, lalu satu spasi) mendapat label X; token label dibuang dari teks. Label unik dalam satu teks (duplikat = galat validasi SPEC-004 `duplicate_paragraph_label`).
4. Sintaks Markdown lain mengikuti aturan render aman SPEC-005 (tanpa HTML mentah; tanpa gambar). Hanya paragraf teks, daftar, dan penekanan yang didukung di dalam teks bacaan; tabel dan blok kode dirender apa adanya tetapi tidak dapat disorot.

**`parsePassages(markdown: string): Passage[]`** (`src/lib/reading/parsePassages.ts`; fungsi murni dipakai validator SPEC-004 dan UI):
`Passage = { passage_no: number, title: string, paragraphs: Array<{ index: number, label: string \| null, text: string }> }`. Vektor uji WAJIB: masukan `"# Judul\n\n[A] Para satu.\n\n[B] Para dua.\n===PASSAGE===\n# T2\n\nTanpa label."` menghasilkan 2 teks: teks 1 `title="Judul"` dengan paragraf `{index:0,label:"A",text:"Para satu."}`, `{index:1,label:"B",text:"Para dua."}`; teks 2 `title="T2"` dengan `{index:0,label:null,text:"Tanpa label."}`. Masukan tanpa pemisah menghasilkan 1 teks. 4 pemisah -> galat `too_many_passages`.

## Technical Flow
1. Attempt berjalan (SPEC-006) dengan `passage_markdown != null`; `ExamShell`/`ActiveDrill` merender `ReadingWorkspace`.
2. Komponen memanggil `parsePassages(passage_markdown)` sekali (memoized) dan mengelompokkan `questions` berdasarkan `passage_no` (null diperlakukan 1).
3. Pada desktop (>= 1024px lebar viewport) menampilkan dua panel; di bawah itu menampilkan tab "Teks | Soal".
4. Learner memilih teks di sorotan: komponen menghitung `{paragraph_index, start, end}` dari `Selection`/`Range` terhadap teks paragraf (offset karakter) lalu menampilkan toolbar mengambang.
5. Learner memilih warna; komponen menyimpan sorotan pada state dan `localStorage` (`hl:v1:{attempt_id}`) dan merender ulang paragraf sebagai segmen React (`<mark>`), tidak memakai `innerHTML`.
6. Learner menjawab; mode `EXAM`: perubahan jawaban disimpan otomatis lewat `PUT /attempts/{id}/answers/{question_id}` (debounce 400 ms); mode `PRACTICE`: tombol "Periksa" per soal (SPEC-006).
7. Learner menandai soal dengan tombol bendera; tanda disimpan di `localStorage` (`flag:v1:{attempt_id}`) dan tampil di `QuestionNavigatorGrid`.
8. Setiap 60 detik klien memanggil `GET /attempts/{attempt_id}` untuk menyinkronkan `remaining_seconds` (koreksi drift) tanpa mengubah jawaban lokal.
9. Learner menekan "Kirim" (Dialog konfirmasi) -> `POST /attempts/{id}/submit`.

## API Contract
Tidak ada endpoint baru. Spec ini menggunakan kontrak SPEC-006 persis. Persyaratan data yang mengikat:
- `AttemptDTO.passage_markdown`: string \| null — isi `reading_passage_markdown` apa adanya (pemurnian/penguncian tidak diperlukan; teks bacaan bukan kunci jawaban).
- `QuestionPublicDTO.passage_no`: int 1-3 \| null — dari soal; harus <= jumlah teks (divalidasi SPEC-004 `passage_out_of_range`).
- Tidak ada perubahan pada kode error. Kode umum SPEC-006 berlaku (`ATTEMPT_EXPIRED`, `ATTEMPT_NOT_ACTIVE`, `RATE_LIMITED`).

Pada kegagalan `PUT answers` di mode EXAM: klien menandai soal "Belum tersimpan" (ikon `CloudOff` + teks) dan mengulang dengan backoff 2, 4, 8 detik (maks 3 kali), lalu menampilkan Toast error dengan Button "Coba lagi". Bila `409 ATTEMPT_EXPIRED`: Dialog "Waktu habis" dan navigasi ke hasil.

## Database Changes
Tidak ada. `localStorage` (semua akses dibungkus try/catch; aplikasi tetap berfungsi tanpa penyimpanan):
| Kunci | Nilai |
|---|---|
| `hl:v1:{attempt_id}` | JSON `Highlight[]` (maks 200 elemen) |
| `flag:v1:{attempt_id}` | JSON `string[]` berisi `question_id` yang ditandai |
| `split:v1` | JSON `{ ratio: number }` rasio panel kiri 35-65 (persen), berlaku global |
`Highlight = { id: string, passage_no: number, paragraph_index: number, start: number, end: number, color: "yellow" | "green" }` dengan `0 <= start < end <= panjang teks paragraf`.

## UI/UX
Rujukan: `design-system.md` 5.13 Split-Screen Reading, 5.12 Kuis/Mesin Soal (renderer tipe soal), 5.19 Mode Ujian, 7 Accessibility, 8.5 wireframe Reading Ujian.

- **Token baru** (ditambahkan ke `design-system.md` bagian 9 oleh Frontend): `--color-highlight-yellow` light `#FDE68A`/dark `#854D0E`, `--color-highlight-green` light `#BBF7D0`/dark `#166534`; teks di atas sorotan memakai `--color-text` (kontras >= 4.5:1 pada kedua tema, diverifikasi).
- **Desktop (>= 1024px):** dua panel setinggi `100dvh` dikurangi header; hanya dua area scroll (tanpa scroll halaman); pembagi `role="separator" aria-orientation="vertical" aria-valuemin="35" aria-valuemax="65" aria-valuenow="{ratio}" tabindex="0"`; geser mouse/sentuh atau panah kiri/kanan (langkah 5 poin persen); default 50; rasio dibatasi 35-65.
- **Panel kiri:** `Segmented` "Teks 1 / Teks 2 / Teks 3" (hanya bila > 1 teks), judul, paragraf dengan label huruf di margin (lebar 32px, `aria-label="Paragraf A"`), toolbar sorot mengambang (Button "Sorot kuning", "Sorot hijau", "Hapus sorotan" dengan ikon + teks; muncul di atas seleksi, dapat dijangkau keyboard), Button teks "Hapus semua sorotan" (Dialog konfirmasi).
- **Panel kanan:** header "Teks {n}: Soal {a}-{b}", daftar soal via `QuestionRenderer` (SPEC-006), tombol bendera per soal (`aria-pressed`, label "Tandai soal"), `QuestionNavigatorGrid` (Sheet di mobile, panel bawah di desktop): sel nomor dengan ikon/label terjawab, ditandai, kosong (tidak hanya warna).
- **< 1024px:** tab sticky "Teks | Soal" (`role="tablist"`, panah kiri/kanan berpindah); posisi scroll tiap tab dipertahankan di state; tombol "Lihat teks" di header panel Soal pindah ke tab Teks dan "Kembali ke soal" mengembalikan ke posisi scroll sebelumnya; pemilih Teks 1-3 di tab Teks; tab Soal mengelompokkan soal dengan judul "Soal Teks {n}".
- **Header (EXAM):** nama ujian, timer (aria-live hanya tonggak 10/5/1 menit), Button "Akhiri". Footer: "Soal sebelumnya"/"Soal berikutnya", Button primary "Kirim".
- **Keyboard:** `H` pada seleksi = sorot kuning, `Shift+H` = sorot hijau, `Delete`/`Backspace` pada sorotan terfokus = hapus; `Alt+Panah Kanan/Kiri` soal berikutnya/sebelumnya (dapat dimatikan di `/profil`).
- **Seleksi lintas paragraf:** toolbar tidak muncul; Toast kecil "Sorot dalam satu paragraf." (sekali per sesi).
- **State:** loading = Skeleton dua panel; passage kosong/parse gagal = Card "Teks bacaan tidak dapat ditampilkan" + tombol "Laporkan" (menyalin kode galat) dan soal tetap dapat dijawab; sorotan melebihi 200 = Toast "Batas sorotan tercapai." dan sorotan baru ditolak; `localStorage` tidak tersedia = fitur sorot tetap bekerja sementara di memori.

## Acceptance Criteria
- [ ] **Given** vektor uji `parsePassages` di atas **When** unit test dijalankan **Then** hasil persis sesuai; masukan 4 pemisah melempar `too_many_passages`; label duplikat menghasilkan galat `duplicate_paragraph_label`.
- [ ] **Given** viewport 1280x800 dan attempt dengan passage **When** halaman dibuka **Then** terdapat tepat dua elemen dengan `overflow-y: auto` (panel kiri dan kanan), `document.scrollingElement.scrollHeight <= window.innerHeight`, rasio awal 50.
- [ ] **Given** pembagi terfokus **When** `ArrowRight` ditekan 3 kali **Then** `aria-valuenow = 65` (50 -> 55 -> 60 -> 65) dan penekanan ke-4 tetap 65; `ArrowLeft` mencapai minimum 35.
- [ ] **Given** rasio diubah ke 40 **When** halaman dimuat ulang **Then** rasio tetap 40 (dari `split:v1`).
- [ ] **Given** seleksi teks di satu paragraf **When** menekan "Sorot kuning" **Then** segmen teks dibungkus `<mark>` berwarna `--color-highlight-yellow`, `localStorage['hl:v1:{id}']` berisi 1 sorotan dengan `start`/`end` benar, dan DOM tidak mengandung markup hasil `innerHTML` (uji: tidak ada pemanggilan `innerHTML`/`dangerouslySetInnerHTML` di komponen, aturan lint).
- [ ] **Given** sorotan tersimpan **When** halaman direfresh **Then** sorotan muncul kembali di rentang yang sama.
- [ ] **Given** seleksi lintas dua paragraf **When** dilepas **Then** toolbar tidak muncul.
- [ ] **Given** 200 sorotan **When** menambah ke-201 **Then** ditolak dengan Toast "Batas sorotan tercapai." dan jumlah tetap 200.
- [ ] **Given** teks `[A] ...`, `[B] ...` **When** dirender **Then** margin menampilkan label "A" dan "B" dan label tidak muncul di teks paragraf.
- [ ] **Given** 3 teks dan 13 soal tersebar **When** memilih "Teks 2" **Then** panel kanan menampilkan hanya soal dengan `passage_no=2` dan judul "Teks 2: Soal 14-26" sesuai nomor global.
- [ ] **Given** mode EXAM **When** jawaban diubah **Then** tepat satu `PUT answers` dikirim setelah 400 ms tanpa perubahan lanjutan (debounce), tanpa panel umpan balik; **When** jaringan gagal **Then** sel navigator berlabel "Belum tersimpan" dan 3 percobaan ulang dilakukan (2, 4, 8 detik).
- [ ] **Given** viewport 375x812 **When** halaman dibuka **Then** tab "Teks | Soal" tampil, tidak ada scroll horizontal, scroll di tab Teks dipertahankan setelah berpindah ke Soal dan kembali (selisih <= 2px).
- [ ] **Given** soal ditandai bendera **When** membuka navigator **Then** sel itu memiliki ikon `Flag` dan teks "Ditandai"; tanda bertahan setelah refresh.
- [ ] **Given** `localStorage` melempar error (diblokir) **When** menyorot **Then** sorotan tetap tampil selama sesi dan tidak ada error tak tertangani.
- [ ] **Given** audit aksesibilitas (axe-core) pada halaman Reading **When** dijalankan pada light dan dark **Then** 0 pelanggaran tingkat `serious`/`critical`; kontras sorotan >= 4.5:1.
- [ ] **Given** passage 60.000 karakter **When** dirender **Then** waktu render awal < 500 ms (pengukuran `performance.measure`, mesin pengembangan) dan scroll tidak patah (tanpa long task > 100 ms saat scroll).
- [ ] **Given** E2E Playwright (fixture set 1 teks, 6 soal) **When** learner menyorot, menjawab 6 soal, menandai 1, mengirim **Then** hasil tampil dan `review` mengikuti SPEC-006 D10.

## Edge Cases & Validation
- [ ] `passage_no` soal null: dikelompokkan ke Teks 1.
- [ ] Soal dengan `passage_no` yang tidak ada di teks (data korup): dikelompokkan ke Teks 1 dan `warn` dicatat di konsol.
- [ ] Teks bacaan berisi tabel: sorotan dinonaktifkan di dalam tabel (hanya paragraf).
- [ ] Zoom 200%: dua panel tetap dapat dipakai; di bawah 1024px efektif tampil tab.
- [ ] Orientasi landscape ponsel (>= 1024px): mode split aktif.
- [ ] Paragraf berubah (konten diedit admin) saat attempt berjalan: sorotan dengan `end` melebihi panjang teks dibuang tanpa error.
- [ ] `prefers-reduced-motion`: toolbar sorot muncul tanpa animasi.

---

## Human Approval

**Human Approval Status:** approved

**Human Feedback:**
> Persetujuan didelegasikan human kepada Orchestrator (ADR-003, 2026-11-03).

## Revision History
| Date | Author | Changes |
|------|--------|---------|
| 2026-11-03 | Analyst Agent | Initial draft |
| 2026-11-03 | Backend Engineer | Audit BE: tidak ada perubahan kontrak. `passage_markdown`/`passage_no` sudah dilayani SPEC-006 apa adanya; validator server (`src/server/content/passages.ts`) menegakkan `too_many_passages`, `duplicate_paragraph_label`, `passage_out_of_range`. `parsePassages` UI (`src/lib/reading/`) milik Frontend; pemisah wajib identik dengan `splitPassages` server (baris PERSIS `===PASSAGE===`). |
