# DESIGN SYSTEM — ielts-learning-platform

**Owner Agent:** UX Designer
**Date:** 2026-11-03
**Phase:** Planning
**Status:** `Approved` (didelegasikan, lihat ADR-003)
**WORK_DEPTH:** standard (komponen kunci + states + motion; wireframe layar utama + dark mode disertakan karena kebutuhan produk)

> Acuan resmi UI/UX. Frontend Engineer WAJIB mengikuti dokumen ini; jangan menambah warna/ukuran di luar token. Perubahan lewat `_shared/change-management.md`. Stack: Tailwind CSS 4 (token = CSS variables), shadcn/ui (Radix), Lucide, Recharts, `@dnd-kit`, Embla. Seluruh teks UI berbahasa Indonesia; materi/soal berbahasa Inggris (tandai `lang="en"`).

---

## 1. Design Principles

1. **Fokus dulu, hiasan kemudian.** Satu aksi utama per layar. Belajar jam-jaman harus nyaman: hierarki jelas, whitespace lega, tanpa kebisingan visual.
2. **Status selalu terbaca tanpa warna.** Terkunci / Sedang / Selesai memakai ikon + label teks + warna (CUR-01, a11y).
3. **Dua suasana: Belajar dan Ujian.** Mode Belajar hangat dan memotivasi; Mode Ujian (Boss Stage, Skip Test, Placement, mock) minimalis, tenang, tanpa gamifikasi dan navigasi global.
4. **Gamifikasi ringan, akademik-modern.** Mahkota, poin, streak ditampilkan sebagai aksen kecil, bukan maskot kartun. Playful hanya di momen hasil (confetti halus, mahkota).
5. **Jujur soal AI.** Skor AI/band selalu disertai label "Perkiraan, bukan skor resmi" dan status proses yang jelas (antre, memproses, gagal).
6. **Mobile-first, aksesibel (WCAG 2.1 AA).** Target sentuh >= 44px, keyboard penuh, dark mode setara kualitasnya.

---

## 2. Color Palette

Semua warna dipakai lewat token semantik (`--color-*`), tidak pernah hex mentah di komponen. Nilai light / dark:

### 2.1 Inti & permukaan
| Token | Light | Dark | Usage |
|---|---|---|---|
| `primary` | `#4F46E5` | `#6366F1` | tombol utama, link, fokus, status Sedang |
| `primary-hover` | `#4338CA` | `#818CF8` | hover/active primary |
| `primary-subtle` | `#EEF2FF` | `#1E1B4B` | latar chip/kartu terpilih, badge Sedang |
| `on-primary` | `#FFFFFF` | `#FFFFFF` | teks di atas primary (6.3:1 light; 4.5:1 dark pakai `#4F46E5` utk tombol, lihat catatan) |
| `secondary` | `#14B8A6` | `#2DD4BF` | aksen: progres, highlight, grafik (hanya fill/ikon besar) |
| `secondary-text` | `#0F766E` | `#5EEAD4` | teks/ikon kecil teal (kontras AA) |
| `accent` | `#F59E0B` | `#FBBF24` | Gold, poin, streak (fill/ikon) |
| `accent-text` | `#B45309` | `#FCD34D` | teks amber (kontras AA) |
| `background` | `#F8FAFC` | `#0F172A` | latar halaman |
| `surface` | `#FFFFFF` | `#1E293B` | kartu, panel, modal |
| `surface-muted` | `#F1F5F9` | `#172033` | latar bersarang, area soal |
| `border` | `#E2E8F0` | `#334155` | garis, divider |
| `border-strong` | `#CBD5E1` | `#475569` | input, outline |
| `text-primary` | `#0F172A` | `#F1F5F9` | teks utama (>= 15:1) |
| `text-secondary` | `#475569` | `#CBD5E1` | teks pendukung |
| `text-muted` | `#64748B` | `#94A3B8` | caption, placeholder (>= 4.5:1) |

Catatan dark mode: tombol primary di dark tetap `bg #4F46E5` + teks putih (kontras teks 6.3:1) dengan border 1px `#818CF8` agar terpisah dari latar; `#6366F1` hanya untuk link/ikon/fokus. Dark mode memakai tonal desaturated, bukan inversi.

### 2.2 Status & semantik
| Token | Light (fill/ikon) | Light (teks) | Dark (fill/teks) | Usage |
|---|---|---|---|---|
| `status-locked` | `#94A3B8` | `#475569` | `#64748B` / `#94A3B8` | Terkunci (abu + ikon gembok) |
| `status-progress` | `#4F46E5` | `#4338CA` | `#6366F1` / `#A5B4FC` | Sedang dipelajari (biru) |
| `status-done` | `#16A34A` | `#15803D` | `#22C55E` / `#4ADE80` | Selesai (hijau, ikon centang) |
| `status-skipped` | `#14B8A6` | `#0F766E` | `#2DD4BF` / `#5EEAD4` | Dilewati lewat Skip Test (teal, ikon lompat) |
| `error` | `#DC2626` | `#B91C1C` | `#F87171` / `#FCA5A5` | salah, koreksi, validasi |
| `success` | `#16A34A` | `#15803D` | `#22C55E` / `#4ADE80` | jawaban benar, berhasil |
| `warning` | `#F59E0B` | `#B45309` | `#FBBF24` / `#FCD34D` | peringatan, waktu hampir habis |
| `info` | `#0EA5E9` | `#0369A1` | `#38BDF8` / `#7DD3FC` | catatan netral, callout tips |

Aturan: hijau `#16A34A` TIDAK dipakai sebagai warna teks kecil di latar putih (3.3:1); pakai `#15803D`. Teks putih di atas fill hijau memakai `#15803D`.

### 2.3 Gamifikasi
| Token | Light | Dark | Usage |
|---|---|---|---|
| `crown-gold` | `#F59E0B` (tepi `#B45309`) | `#FBBF24` | mahkota Gold (90–100%) |
| `crown-silver` | `#94A3B8` (tepi `#64748B`) | `#CBD5E1` | mahkota Silver (75–89%) |
| `crown-none` | `#E2E8F0` | `#334155` | belum ada mahkota (< 75%) |
| `streak` | `#F97316` | `#FB923C` | api streak kecepatan |

Mahkota dibedakan juga lewat bentuk/label ("Emas", "Perak"), tidak hanya warna.

### 2.4 Kategori 6 keterampilan (radar & chip)
Tidak memakai warna per sumbu; radar satu seri `primary` (isi 20% opasitas) agar tidak membebani. Sumbu dibedakan lewat label teks + ikon (Headphones, BookOpen, PenLine, Mic, `Languages`, `Library`).

---

## 3. Typography

Font: **Plus Jakarta Sans** (heading), **Inter** (UI/body), **JetBrains Mono** (rumus/kode/timer opsional). Muat via `next/font` dengan `display: swap`, subset `latin`, bobot terbatas (Jakarta 600/700/800; Inter 400/500/600; Mono 500). Angka timer/skor/word-counter wajib `font-variant-numeric: tabular-nums`.

| Role | Font | Size / Line-height (mobile → desktop) | Weight |
|---|---|---|---|
| Display (hasil band) | Plus Jakarta Sans | 40/48 → 56/64 | 800 |
| Heading 1 | Plus Jakarta Sans | 28/36 → 36/44 | 700 |
| Heading 2 | Plus Jakarta Sans | 22/30 → 28/36 | 700 |
| Heading 3 | Plus Jakarta Sans | 18/26 → 20/28 | 600 |
| Body | Inter | 16/24 (UI) | 400 |
| Body artikel (Learn) | Inter | 17/29 (lh 1.7) → 18/30.6, lebar 65–75 karakter | 400 |
| Body kecil | Inter | 14/20 | 400 |
| Label / tombol | Inter | 14/20 | 500–600 |
| Caption / metadata | Inter | 12/16 (jangan lebih kecil) | 500 |
| Teks bacaan Reading (passage) | Inter | 17/28, `max-w-prose` | 400 |
| Mono (rumus, timer) | JetBrains Mono | 14–16 | 500 |

Aturan: body minimum 16px di mobile (cegah zoom iOS pada input), tidak ada body < 14px; heading berurutan tanpa lompat level; teks Inggris dalam konten ditandai `lang="en"`; hindari truncation untuk istilah soal, gunakan wrap.

---

## 4. Spacing & Layout

- **Skala:** basis 4px; token `1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 16=64`. Ritme: komponen 8/12/16, antar-section 24/32/48.
- **Breakpoints (mobile-first):** `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Desain dasar 375px.
- **Container:** halaman umum `max-w-6xl` (1152px), gutter 16 (mobile) / 24 (md) / 32 (lg). Konten bacaan/artikel `max-w-[72ch]`. Split-screen Reading lebar penuh `max-w-[1440px]`.
- **Radius:** `sm 0.5rem` (chip, input kecil), `md 0.75rem` (tombol, input, kartu biasa), `lg 1rem` (kartu besar, modal), `full` (badge, avatar).
- **Elevasi (soft):** `shadow-1: 0 1px 2px rgb(15 23 42/.06)`; `shadow-2: 0 4px 12px rgb(15 23 42/.08)` (kartu hover, popover); `shadow-3: 0 12px 32px rgb(15 23 42/.14)` (modal). Dark mode: kurangi shadow, andalkan `border` + perbedaan surface.
- **Z-index:** base 0, sticky 10, dropdown 20, bottom-bar 30, modal-scrim 40, modal 50, toast 60.
- **Navigasi global:** mobile = bottom nav 4 item (Beranda, Peta Belajar, Latihan/Riwayat, Profil), tinggi 64px + safe-area; desktop (>= lg) = sidebar kiri 256px (bisa collapse 72px). Admin: sidebar terpisah ("Konten", "Impor", "Sumber & Lisensi"). Mode Ujian menyembunyikan navigasi global.
- **Sentuh:** target interaktif min 44x44px, jarak antar target min 8px. Gunakan `min-h-dvh`, bukan `100vh`. Sediakan padding bawah untuk bar tetap.

---

## 5. Component Specs

Semua komponen dibangun di atas shadcn/ui (Radix); token di atas menggantikan default. States umum: default, hover, active (pressed), focus-visible, disabled, loading, error.

### 5.1 Button
- **Variants:** `primary` (bg primary, teks putih), `secondary` (surface + border-strong), `ghost`, `destructive` (bg error), `success` (khusus "Periksa/Lanjut" setelah benar; bg status-done teks putih), `link`.
- **Ukuran:** `sm` 36px, `md` 44px (default), `lg` 52px (CTA kartu Lanjutkan Belajar, tombol ujian). Padding-x 16/20/24, radius `md`, ikon Lucide 18/20px di kiri teks.
- **States:** hover = `primary-hover`; active = scale 0.98 (tanpa layout shift); focus-visible = ring 2px `primary` + offset 2px; disabled = opasitas 0.5 + `cursor-not-allowed` + `aria-disabled`; loading = spinner menggantikan ikon, tombol `disabled`, label berubah ("Memeriksa...").
- Satu tombol primary per layar. Icon-only wajib `aria-label` dan area 44px.

### 5.2 Input / Form
- Label selalu terlihat di atas field (bukan placeholder saja); tanda wajib `*` + teks "wajib diisi" untuk SR. Tinggi 44px, radius `md`, border `border-strong`, fokus ring `primary`.
- Helper text 12–14px di bawah; error di bawah field dengan ikon + teks `error` dan `aria-describedby`, `aria-invalid`. Validasi saat blur; setelah submit gagal fokus pindah ke field pertama yang salah; ringkasan error di atas form bila > 1.
- Varian: text, email, password (toggle tampil/sembunyi), textarea, select, checkbox, radio, switch, file (dropzone untuk importer).
- Pesan error dalam bahasa Indonesia berisi penyebab + cara memperbaiki ("Kata sandi minimal 8 karakter.").

### 5.3 Card
- Permukaan `surface`, border `border`, radius `md` (besar `lg`), padding 16/24, `shadow-1`. Varian: `default`, `interactive` (hover `shadow-2`, translateY tidak dipakai, border berubah ke `primary`), `highlight` (latar `primary-subtle`, untuk Lanjutkan Belajar), `locked` (opasitas teks 0.7, ikon gembok, tanpa hover).
- Seluruh kartu klikabel memakai satu elemen `<a>`/`<button>` stretched; fokus ring mengelilingi kartu.

### 5.4 Modal / Dialog / Sheet
- Radix Dialog. Mobile = bottom sheet (radius atas `lg`, handle, geser-bawah untuk menutup); desktop = dialog tengah max-w 480 (konfirmasi) / 640 (konten).
- Scrim hitam 50%. Selalu ada tombol tutup (X, `aria-label="Tutup"`) dan Esc; fokus terjebak di dalam, kembali ke pemicu saat tutup.
- Dialog konfirmasi: judul pertanyaan, 1 kalimat dampak, tombol destruktif terpisah dari "Batal". Dialog dengan perubahan belum tersimpan meminta konfirmasi sebelum ditutup.
- Jangan memakai modal untuk navigasi utama. Pada Mode Ujian, dialog "Akhiri ujian?" wajib konfirmasi.

### 5.5 Navbar / Navigation
- Mobile bottom nav (4 item, ikon + label, aktif = ikon terisi + warna primary + indikator garis atas 2px); top bar kecil dengan judul layar, tombol kembali, dan streak/poin. Desktop sidebar dengan breadcrumb di atas konten untuk hierarki >= 3 level (Tier > Modul > Sub-Modul).
- Item aktif memakai `aria-current="page"`. Lokasi navigasi konsisten di semua halaman (kecuali Mode Ujian). Toggle tema (Terang / Gelap / Ikuti sistem) di menu Profil.

### 5.6 Table (Admin & Riwayat)
- Header sticky, baris tinggi 48px, zebra halus (`surface-muted`), hover baris. Kolom sortable memakai `aria-sort`. Angka rata kanan `tabular-nums`. Kolom status memakai Badge (ikon + teks).
- Mobile: tabel berubah menjadi daftar kartu bertumpuk (label:nilai) tanpa scroll horizontal. Sediakan empty state ("Belum ada riwayat. Mulai latihan pertama Anda.") dan skeleton saat loading.
- Paginasi atau virtualisasi untuk > 50 baris.

### 5.7 Badge, Chip, Progress, Toast, Tabs, Tooltip
- **Badge status:** pil `radius full`, tinggi 24px, ikon 14px + teks 12px/600. Tiga status utama di 5.8.
- **Progress bar:** tinggi 8px, track `border`, isi `primary` (belajar) / `status-done` (selesai); label persen di teks; `role="progressbar"` dengan `aria-valuenow`.
- **Toast:** muncul bawah (mobile) / kanan-bawah, auto-hilang 4 dtk, `aria-live="polite"`, tidak mencuri fokus; toast error tidak auto-hilang dan menyertakan aksi "Coba lagi".
- **Tabs (Learn/Drill/Apply):** segmented di atas pemutar, `role=tablist`, panah kiri/kanan berpindah tab.
- **Callout:** "Tips Examiner" (ikon Lightbulb, latar `info` subtle), "Kesalahan Umum" (ikon AlertTriangle, latar warning subtle), border-kiri 4px, teks selalu berlabel.
- **Skeleton:** blok `surface-muted` dengan shimmer halus untuk > 300 ms; dihentikan saat reduced-motion.

### 5.8 Status Skill Tree: Terkunci / Sedang / Selesai (CUR-01)

| Status | Ikon (Lucide) | Warna | Label | Perilaku |
|---|---|---|---|---|
| Terkunci | `Lock` | abu `status-locked` | "Terkunci" | tidak bisa dibuka; fokusable agar SR mendengar alasan: "Selesaikan {sub-modul sebelumnya} dan capai drill 75% untuk membuka" ; tombol sekunder "Uji Kompetensi" bila modul/Tier mendukung Skip Test |
| Sedang | `PlayCircle` / `CircleDot` | biru `status-progress`, cincin progres | "Sedang dipelajari" | klik membuka; menampilkan persen |
| Selesai | `CheckCircle2` | hijau `status-done` | "Selesai" + mahkota bila ada | dapat diulang |
| Dilewati | `FastForward` | teal `status-skipped` | "Dilewati (Skip Test)" + skor | dapat dibuka untuk ditinjau |

Tiap node: ikon + label teks (bisa disembunyikan visual pada mode kompak tetapi tetap ada untuk SR). Jangan mengandalkan warna.

### 5.9 Skill Tree (peta Tier > Modul > Sub-Modul)
- **Struktur:** 4 Tier sebagai section vertikal bertingkat. Header Tier: nama + rentang target band (mis. "Tier 3, Target Band 5.5–6.0"), progres total, status, tombol "Boss Stage" (terkunci sampai semua modul selesai). Di dalam: Modul sebagai kartu yang dapat di-expand; di dalam Modul: Sub-Modul sebagai daftar node bergaris penghubung vertikal.
- **Mobile:** satu kolom; jalur penghubung garis vertikal 2px di kiri node (24px). Desktop (>= lg): grid 2 kolom Modul per Tier dan panel detail Sub-Modul di kanan (sticky).
- **Node Sub-Modul:** lingkaran 40px (ikon status) + judul + meta (durasi, jumlah soal) + mahkota kecil. Garis penghubung: solid hijau (selesai), solid biru (aktif), putus-putus abu (terkunci).
- **Aksi:** klik node terbuka -> pemutar; node terkunci -> popover alasan + tombol "Uji Kompetensi". Skip Test dipicu dari header Modul/Tier.
- **Tidak memakai peta bebas koordinat/zig-zag** (sulit di mobile & a11y); semantik `<ol>` bersarang, `aria-label` per Tier.
- Auto-scroll ke node aktif saat peta dibuka; node aktif diberi cincin denyut halus (dinonaktifkan pada reduced-motion).

### 5.10 Kartu "Lanjutkan Belajar" (TRK-01)
- Posisi: paling atas dashboard, lebar penuh, varian `highlight` (gradasi sangat halus `primary-subtle` -> `surface`), radius `lg`.
- Isi: label kecil "Lanjutkan Belajar"; judul sub-modul; jalur breadcrumb ("Tier 2 > Modul Grammar > Past Tense"); baris posisi ("Tab Drill, Soal 4 dari 10" atau "Video 03:42"); progress bar sub-modul; tombol `lg` primary **"Lanjutkan Belajar"** (satu-satunya CTA primer di layar), tautan sekunder "Ganti sub-modul".
- Satu klik langsung ke `active_tab`, posisi video (`video_progress_sec`), dan soal terakhir (`last_question_index`) tanpa langkah perantara (target < 10 dtk).
- Empty state (pengguna baru): "Mulai perjalanan Anda" dengan dua tombol: "Mulai dari Tier 1" dan "Ikut Placement Test".

### 5.11 Pemutar Multimodal "Learn - Drill - Apply" (MAT)
- **Kerangka:** header ringkas (kembali, judul sub-modul, simpan otomatis ikon awan), tab 3 segmen **Pelajari / Latihan / Terapkan** dengan indikator selesai; konten area di bawah; bar bawah tetap (mobile) berisi "Sebelumnya" / "Selanjutnya".
- **Artikel Markdown:** `max-w-[72ch]`, line-height 1.7, heading dengan anchor, tabel responsif (scroll terkurung dengan penanda), blok kode mono, callout (5.7), tombol "Unduh PDF/DOCX" sekunder dengan ikon `Download` + ukuran berkas. Daftar isi sticky di desktop.
- **Video YouTube:** rasio 16:9 (`aspect-video`, ruang dicadangkan), IFrame API dengan `start`/`end` detik; di bawah video tampil label "Bagian 03:10–07:45". Posisi disimpan tiap 5 dtk (debounce). Sediakan tautan "Buka di YouTube" bila gagal dimuat dan pesan error + coba lagi. Kontrol bawaan YouTube dipakai; tombol kecepatan tidak dibuat ulang.
- **Carousel slide (Embla):** gambar WebP/PNG `aspect-video` dengan `alt` dari metadata; kontrol Prev/Next (44px), indikator "3/12", swipe horizontal hanya di dalam area carousel, navigasi keyboard kiri/kanan, `role="region" aria-roledescription="carousel"`. Prefetch slide berikutnya.
- **Active Drill:** lihat 5.12. **Mini-Task:** kartu tugas dengan instruksi, kotak jawaban/unggah, kriteria penilaian (checklist), tombol "Tandai Selesai".
- Penyelesaian tab menampilkan centang pada tab; selesai semua -> layar ringkasan sub-modul (skor drill, mahkota, tombol "Sub-Modul Berikutnya").

### 5.12 Kuis / Mesin Soal (7 tipe) dan Active Drill
- **Kerangka soal:** nomor "Soal 4 dari 10" + progress bar tipis, timer (Active Drill: berwaktu), instruksi singkat, area soal, bar aksi bawah: "Periksa" (primary, nonaktif sampai ada jawaban) -> setelah diperiksa berubah menjadi "Lanjut".
- **Umpan balik instan (mode Belajar/Drill):** panel di bawah muncul (slide-up 200 ms): benar = latar `success` subtle + ikon centang + "Benar!" + poin; salah = latar `error` subtle + ikon silang + "Kurang tepat" + jawaban benar + pembahasan Indonesia. Warna selalu disertai ikon dan teks. Panel `role="status"` / `aria-live="polite"`.
- **Mode Ujian:** tidak ada umpan balik instan, tidak ada pembahasan; hasil di akhir.
- **Tipe soal:**
  1. **MCQ single/multi:** opsi kartu radio/checkbox 56px min, seluruh baris klikabel, huruf A–D di kiri; multi memberi teks "Pilih 2 jawaban".
  2. **T/F/NG & Y/N/NG:** tiga tombol segmented sama lebar ("True/False/Not Given" tetap bahasa Inggris, bantuan tooltip Indonesia).
  3. **Isian (batas kata):** input inline atau di bawah, helper "Maksimal 2 kata dan/atau angka", penghitung kata live; error bila melebihi.
  4. **Matching:** dua pola yang setara — (a) drag & drop `@dnd-kit` dengan *dropzone* jelas, (b) dropdown `<select>` pada tiap item. Alternatif keyboard/sentuh WAJIB: mode dropdown otomatis di mobile atau toggle "Gunakan pilihan daftar". Drag memakai ambang 8px dan pengumuman SR (`aria-live`) saat item diambil/dijatuhkan.
  5. **Reorder / error recognition:** daftar dapat diurut (drag handle + tombol Naik/Turun untuk keyboard); error recognition = ketuk kata yang salah, ditandai garis bawah bergelombang + ikon.
  6. **Writing:** lihat 5.15.
  7. **Speaking:** lihat 5.16.
- Navigasi antar-soal (ujian): grid nomor soal (ikon: terjawab, ditandai/flag, kosong) di panel/sheet.
- Hasil Drill: skor persen, ambang 75% (lulus gate) ditampilkan jelas; gagal = pesan suportif + "Ulangi Latihan" (primary) dan "Tinjau Materi" (sekunder), tanpa nada menghakimi.

### 5.13 Split-Screen Reading (ASM-02)
- **Desktop (>= lg):** dua panel setinggi viewport (`min-h-dvh` dikurangi header), pembagi dapat diseret/geser keyboard (`role="separator"`, panah kiri/kanan, rasio default 50/50, min 35%). Kiri = teks bacaan (scroll sendiri) + toolbar highlighter; kanan = soal (scroll sendiri). Hanya dua area scroll; tanpa scroll halaman.
- **Highlighter:** pilih teks -> toolbar kecil mengambang (Sorot kuning, Sorot hijau, Hapus); highlight disimpan lokal per sesi; warna highlight punya kontras 4.5:1 dengan teks dan tidak mengubah ukuran teks. Alternatif keyboard: mode "Sorot" (tombol `H`) dengan Shift+panah. Tombol "Hapus semua sorotan".
- **Tablet/Mobile (< lg):** berubah menjadi **tab "Teks | Soal"** (bukan split), tab sticky di atas; posisi scroll tiap tab dipertahankan; tombol mengambang "Lihat teks" opsional pada tampilan soal.
- Paragraf diberi label huruf (A, B, C) di margin untuk soal Matching Headings. Timer dan "Kirim" di header (Mode Ujian).

### 5.14 Listening Ujian (ASM-02)
- **Pemutar audio terkunci (Mode Ujian):** kartu audio dengan tombol Putar besar 56px, progress bar (tidak dapat diklik/digeser, `aria-readonly`), waktu `tabular-nums`, **tanpa tombol rewind/seek/ulang**, kontrol volume saja. Label tegas: "Audio hanya diputar satu kali seperti di ujian sebenarnya." Setelah audio berakhir, bagian dikunci/lanjut otomatis sesuai pengaturan Section; bila pemutaran gagal ada tombol "Muat ulang audio" (tidak mengulang posisi).
- **Mode Latihan:** kontrol penuh (putar ulang, mundur 5 dtk, kecepatan 0.75x/1x), transkrip dapat dibuka setelah menjawab.
- Soal dibagi per Section (1–4) dalam tab/stepper; waktu transfer jawaban (10 menit) ditampilkan sebagai hitung mundur. Tidak ada gerak berlebih saat audio berjalan; visualisasi gelombang opsional statis.
- Pre-flight: layar cek audio ("Pastikan volume nyala. Putar nada uji") sebelum memulai.

### 5.15 Editor Writing (ASM-01)
- Tata letak: desktop = split (kiri: prompt/tugas + grafik; kanan: editor) ; mobile = tab "Soal | Tulisan".
- Editor: `textarea` besar (font Inter 17/28, tanpa rich text), `spellcheck` mati opsional, tidak ada autokoreksi paste-bantuan. **Word counter** live `tabular-nums` ("142 / min. 150 kata") berwarna netral -> warning bila di bawah batas minimum saat waktu < 5 menit; **timer** hitung mundur di header (warning < 5 menit, `aria-live` hanya pada tonggak 10/5/1 menit, bukan tiap detik).
- Autosave draf lokal tiap 10 dtk dengan indikator "Draf tersimpan". Tombol "Kirim untuk Dinilai" (primary) -> dialog konfirmasi. 
- **Hasil penilaian AI:** kartu band keseluruhan (Display) + disclaimer "Perkiraan, bukan skor resmi"; 4 kriteria (Task Response/Achievement, Coherence & Cohesion, Lexical Resource, Grammar) sebagai baris dengan band + bar + ringkasan; teks esai dengan anotasi inline (garis bawah error + tooltip koreksi); panel "Menuju Band 7" berisi versi perbaikan berdampingan (diff ringan: hapus coret merah, tambah hijau, dengan ikon + teks). Status job: Antre -> Memproses (estimasi 10–60 dtk, progress tak-terbatas + teks) -> Selesai / Gagal (coba lagi, atau "Nilai sendiri" self-assessment fallback).

### 5.16 Perekam Speaking (ASM-01)
- Alur tiga fase berstepper: **Persiapan 1:00** (kartu topik/cue card, boleh catatan) -> **Rekam 2:00** -> **Tinjau & Kirim**.
- Izin mikrofon: layar pra-cek (minta izin, tes level suara). Tombol Rekam besar 72px (ikon `Mic`; saat merekam = `Square` + titik merah berkedip pelan + label "Merekam"), timer besar `tabular-nums`, **level meter** horizontal (10 segmen, bukan warna saja: tinggi segmen berbeda) dengan `aria-label` "Level suara" dan `aria-valuenow`.
- Peringatan: terlalu pelan ("Suara terlalu pelan, dekatkan mikrofon"), terputus. Hitung mundur 3-2-1 sebelum mulai rekam. Setelah rekam: putar ulang, "Rekam ulang" (maks. sesuai aturan), "Kirim".
- Hasil: transkrip STT + penilaian 4 kriteria Speaking (Fluency & Coherence, Lexical Resource, Grammar, Pronunciation sebagai perkiraan) + disclaimer; bila STT/LLM gagal -> kartu fallback self-assessment dengan rubrik checklist.
- Mic ditolak: pesan jelas + cara mengaktifkan + alternatif.

### 5.17 Radar 6 Sumbu + Prediksi Band (TRK-02)
- Recharts `RadarChart`, sumbu: Listening, Reading, Writing, Speaking, Grammar, Vocabulary; skala 0–9 (band) dengan cincin tiap 1.0 (garis `border`, subtle). Isi `primary` 20%, garis `primary` 2px, titik 6px; garis target (band target pengguna) putus-putus `secondary` dengan legenda.
- Samping/di bawah: kartu "Prediksi Band Keseluruhan" (Display) + rentang ("6.0–6.5") + disclaimer; legenda interaktif; **tabel alternatif** (komponen Table) tersedia lewat toggle "Lihat sebagai tabel" dan `aria-label` ringkasan ("Skor terendah: Writing 5.0; tertinggi: Reading 6.5").
- Label sumbu tidak dirotasi, font minimal 12px; di < 400px gunakan singkatan (Lis, Rea, Wri, Spk, Gra, Voc) dengan legenda/tabel sebagai pelengkap. Tooltip nilai on tap/focus. Empty state: "Selesaikan latihan pertama untuk melihat radar Anda." Animasi masuk 400 ms, mati pada reduced-motion.

### 5.18 Mahkota Silver / Gold (TRK-03)
- Ikon SVG mahkota 3 ukuran (16/24/48). **Gold** (90–100%) fill `crown-gold`, **Silver** (75–89%) fill `crown-silver`, **belum** (<75%) outline `crown-none` bergaris putus. Selalu diikuti label "Emas"/"Perak" atau `aria-label` ("Mahkota Emas, skor 92%").
- Tampil di node sub-modul, ringkasan hasil, dan profil. Momen perolehan: mahkota turun dengan skala 0.8 -> 1 (300 ms, spring ringan) + kilau satu kali; confetti halus 1x (maks. 1,2 dtk) hanya pada Gold; dilewati saat reduced-motion.
- Poin: chip amber (`Sparkles` ikon) "+120 poin". Streak: ikon `Flame` `streak` + angka; peringatan streak tidak bernada menekan.

### 5.19 Mode Ujian (Boss Stage, Skip Test, Placement, Mock)
- Tema "tenang": latar `background` polos, tanpa dekorasi, tanpa mahkota/poin/streak, tanpa navigasi global; header tipis: nama ujian, timer, tombol "Akhiri". Kontras tinggi, font sama, margin lebih lega. Tidak ada animasi dekoratif.
- Layar pra-ujian: aturan (waktu, 1x audio, tanpa pembahasan), ambang lulus/target band, checklist perangkat (audio/mikrofon), tombol "Mulai Ujian".
- Perlindungan keluar: `beforeunload` + dialog "Keluar dari ujian? Jawaban tersimpan, waktu terus berjalan." 
- Skip Test: banner informasi "Skor >= 85% membuka level berikutnya tanpa materi" dan hasil dua keadaan: Lulus (status Dilewati) / Belum lulus (kembali ke materi, tidak ada penalti).
- Hasil: Display band + rincian per keterampilan + skor mentah -> band (tabel konversi) + disclaimer; aksi: "Lanjut ke Tier berikutnya" bila lulus.

### 5.20 Admin Importer (JSON/CSV)
- Layout sidebar admin; halaman "Impor Konten" sebagai stepper 4 langkah: **1 Unggah -> 2 Validasi -> 3 Pratinjau -> 4 Publikasikan** (indikator `aria-current="step"`).
- **Unggah:** dropzone besar (klik/drag, juga tombol "Pilih berkas"), format .json/.csv, batas ukuran, tautan "Unduh templat" dan "Lihat kontrak data".
- **Validasi:** ringkasan (X valid, Y peringatan, Z error) sebagai 3 kartu angka; tabel galat (baris, kolom/path JSON, pesan Indonesia, tingkat: ikon Error/Peringatan); filter "Hanya error"; tombol "Unduh laporan galat". Tidak bisa lanjut bila ada error; peringatan boleh diabaikan dengan centang.
- **Pratinjau:** pohon Tier/Modul/Sub-Modul hasil impor + pratinjau render soal/materi memakai komponen pemutar asli (readonly), pembeda "Baru / Diubah / Tanpa perubahan" sebagai badge (ikon + teks).
- **Publikasikan:** dialog konfirmasi ringkas; hasil + tautan ke konten; opsi "Simpan sebagai draf".
- **Sumber & Lisensi:** kolom wajib `source`, `license` pada tiap aset (select: CC0, CC BY, CC BY-SA, MIT, Tautan saja, Buatan sendiri; peringatan NC); aset berhak cipta tanpa lisensi ditandai merah dan memblokir publikasi.
- Edit modul/soal: tabel + panel edit samping (sheet), konfirmasi sebelum buang perubahan.

### 5.21 Placement Test (CUR-04)
Memakai Mode Ujian (5.19): 25 soal berwaktu, progres "Soal 7 dari 25", hasil berupa rekomendasi Tier ("Mulai di Tier 2") dengan tombol "Mulai di Tier 2" (primary) dan "Mulai dari Tier 1" (sekunder).

---

## 6. Interaction & Motion

**Token gerak:** `motion-fast 120ms` (hover, ripple), `motion-base 200ms` (transisi state, panel feedback), `motion-slow 300ms` (modal, mahkota, tab), maksimum 400ms (radar masuk). Easing: masuk `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out), keluar `cubic-bezier(0.4, 0, 1, 1)` (ease-in, durasi ~65% dari masuk). Hanya animasikan `transform` dan `opacity`.

- **Umpan balik:** respons visual < 100 ms untuk setiap sentuh/klik; skeleton bila > 300 ms; spinner tombol saat aksi async; toast untuk sukses ringan.
- **Transisi layar:** maju = geser dari kanan/bawah, mundur = sebaliknya (kontinuitas); tab = crossfade konten 200 ms; sheet/modal skala 0.96 + fade dari pemicu.
- **Benar/Salah:** panel umpan balik slide-up 200 ms; jawaban salah memberi goyang horizontal 2px x 2 (150 ms) pada opsi, hanya bila reduced-motion tidak aktif.
- **Daftar:** stagger 30–40 ms (maks. 8 item) pada peta belajar saat pertama dibuka.
- **State kosong/error/loading** wajib untuk setiap data-driven view:
  - Loading: skeleton yang mencerminkan tata letak (tanpa CLS).
  - Kosong: ilustrasi ikon sederhana + 1 kalimat + 1 aksi.
  - Error: pesan penyebab + "Coba lagi"; offline/Ollama mati: "Penilai AI sedang tidak tersedia. Anda tetap bisa menilai sendiri."
  - Job AI: Antre (posisi) -> Memproses (progres) -> Selesai/Gagal; hasil tidak muncul sebagai layout shift (ruang dicadangkan).
- **Interupsi:** animasi dapat dibatalkan; tidak memblokir input. Tidak ada gerak paralaks. Mode Ujian: tanpa animasi dekoratif.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` mematikan confetti, denyut, goyang, shimmer, radar-animasi, dan mengganti transisi dengan fade 100 ms.

---

## 7. Accessibility (WCAG 2.1 AA)

- **Kontras:** teks normal >= 4.5:1, teks besar & ikon/UI >= 3:1, diverifikasi terpisah di light dan dark. Pasangan berisiko sudah ditangani (teks hijau/teal/amber memakai varian `*-text`). Border input `#CBD5E1`/`#475569` dengan tambahan ikon/label.
- **Warna bukan satu-satunya penanda:** status (5.8), benar/salah, diff, level meter, mahkota semuanya disertai ikon/teks/bentuk.
- **Fokus:** `:focus-visible` ring 2px `primary` (offset 2px) di semua kontrol, jangan pernah dihilangkan; pada dark pakai `#818CF8`. Skip link "Lewati ke konten utama" di awal halaman. Setelah pindah rute fokus dipindahkan ke `<h1>`/`main`.
- **Keyboard:** semua fungsi dapat dioperasikan tanpa mouse. Tab order = urutan visual. Tabs/segmented memakai panah; pemisah split-screen dapat digeser panah; drag-and-drop memiliki alternatif keyboard/dropdown; Esc menutup modal/popover; pintasan: `Enter` Periksa/Lanjut, `1–4`/`A–D` pilih opsi (dapat dimatikan), `H` mode sorot, `Ctrl+Enter` kirim tulisan. Pintasan tidak boleh bentrok dengan SR/Browser.
- **ARIA & semantik:** `<ol>` untuk skill tree, `aria-current`, `aria-expanded` pada modul, `role="progressbar"` + nilai, `aria-live="polite"` untuk hasil periksa/status job AI/timer tonggak (bukan tiap detik), `role="alert"` untuk error form, `aria-sort` pada tabel, `aria-label` pada kontrol ujian & tombol ikon (mis. "Putar audio", "Mulai merekam", "Tandai soal"), grup soal memakai `fieldset/legend`. Radar & grafik: ringkasan teks + tabel alternatif.
- **Bahasa:** `<html lang="id">`; kutipan/soal Inggris `lang="en"`.
- **Sentuh & ukuran:** target >= 44px; teks dapat diperbesar hingga 200% tanpa kehilangan fungsi; tidak menonaktifkan zoom; tidak ada scroll horizontal (kecuali tabel dalam wadah terkurung); mendukung landscape.
- **Waktu:** timer ujian dapat diumumkan SR; mode Latihan menyediakan opsi "Perpanjang waktu / tanpa batas" (aksesibilitas, tidak dihitung ke Boss Stage).
- **Media:** video memakai kontrol YouTube dengan teks/keterangan bila tersedia; audio Listening menyediakan transkrip setelah selesai (mode Latihan); gambar slide ber-`alt`.
- **Multi-mode:** tema Terang/Gelap/Sistem, tersimpan; uji keduanya sebelum rilis.

---

## 8. Wireframe Layar Utama (teks/ASCII)

### 8.1 Beranda / Dashboard (mobile 375px)
```
+------------------------------------+
| Halo, Budi            [Flame 5] [*120] |
+------------------------------------+
| LANJUTKAN BELAJAR                   |
| Past Tense - Pengenalan             |
| Tier 2 > Grammar > Sub-Modul 3      |
| Tab Latihan, Soal 4 dari 10         |
| [=======-------] 40%                |
| [      Lanjutkan Belajar      ]     |
|        Ganti sub-modul              |
+------------------------------------+
| Prediksi Band: 5.5 (5.0-6.0)        |
| [ radar 6 sumbu ]  [Lihat tabel]    |
+------------------------------------+
| Tier Anda: Tier 2 - 38% selesai     |
| [Buka Peta Belajar >]               |
+------------------------------------+
| Riwayat Mock Test                   |
|  3 Nov  Reading 6.0   Writing 5.5   |
+------------------------------------+
| [Beranda][Peta][Latihan][Profil]    |
+------------------------------------+
```
Desktop: sidebar kiri; konten 2 kolom (kiri: Lanjutkan Belajar + Tier; kanan: radar + riwayat).

### 8.2 Peta Belajar (Skill Tree)
```
Peta Belajar                      [Placement Test]
Tier 1  Dasar (A1-A2)    [Selesai]  100%   [Mahkota Emas]
Tier 2  Menengah (B1)    [Sedang]    38%   Target 5.0-5.5
  Modul 1 Grammar Dasar       [Selesai]  [Perak]
    (v) 1.1 Present Simple
    (v) 1.2 Past Tense
  Modul 2 Vocabulary          [Sedang]
    (o) 2.1 NGSL Set A   <-- cincin aktif, 60%
    (L) 2.2 NGSL Set B   Terkunci
        "Selesaikan 2.1 dan capai drill 75%"
        [Uji Kompetensi]
  Boss Stage Tier 2  [L Terkunci - selesaikan semua modul]
Tier 3  ... [Terkunci]  [Uji Kompetensi Tier]
Tier 4  ... [Terkunci]
```

### 8.3 Pemutar Sub-Modul
```
[<] NGSL Set A            [cloud: tersimpan]
[ Pelajari (v) | Latihan | Terapkan ]
+--------------------------------------+
| (konten: artikel / video 16:9 /      |
|  carousel 3/12)                      |
| [Unduh PDF]                          |
+--------------------------------------+
[ Sebelumnya ]            [ Selanjutnya ]
```

### 8.4 Soal Active Drill
```
Soal 4 dari 10 [======----]     (timer 08:42)
"Choose the correct form..."  (lang=en)
 ( ) A. went        ( ) B. goes
 ( ) C. gone        ( ) D. go
--------------------------------------
 (panel umpan balik: Benar! +10 poin)
 Pembahasan: ...
[            Lanjut             ]
```

### 8.5 Reading Ujian (desktop)
```
[Reading - Passage 1]          Sisa 54:12   [Akhiri]
+---------------------------+ | +--------------------------+
| Teks (scroll)             | | | Soal 1-6 (scroll)        |
| A  Paragraf...            |<->| 1. T/F/NG  [T][F][NG]    |
| B  Paragraf...  [sorot]   | | | 2. Isian (maks 2 kata)   |
+---------------------------+ | +--------------------------+
[1][2][3]...[13] navigasi soal             [Periksa & Kirim]
```
Mobile: tab "Teks | Soal".

### 8.6 Listening Ujian
```
[Listening - Section 2]            Sisa 12:30
+----------------------------------------+
| [ > Putar ]  ---------------o--- 03:12 |
| Audio diputar satu kali (tanpa ulang)  |
+----------------------------------------+
 Soal 11-20 (stepper Section 1 2 3 4)
```

### 8.7 Writing
```
[Writing Task 2]               Sisa 38:05   [Kirim]
Soal: "Some people believe..."   | [ editor ........ ]
                                 | 142 / min. 250 kata
                                 | Draf tersimpan
```
Hasil: Band 6.0 (Perkiraan, bukan skor resmi) + 4 kriteria + esai beranotasi + "Menuju Band 7".

### 8.8 Speaking
```
Persiapan  1:00 -> Rekam 2:00 -> Tinjau
Cue card: "Describe a book..."
        [ (Mic) Mulai Merekam ]
        level: |||||||...   01:23
```

### 8.9 Admin Importer
```
Admin > Impor Konten      [1 Unggah][2 Validasi][3 Pratinjau][4 Publikasi]
 +-----------------------------------------+
 |  Seret berkas .json / .csv ke sini      |
 |  [Pilih berkas]   Unduh templat         |
 +-----------------------------------------+
 Validasi: 42 valid | 3 peringatan | 1 error
 Baris | Path            | Pesan
 17    | modules[2].tier | Tier harus 1-4
```

---

## 9. Design Tokens (ringkas, CSS)

```css
:root {
  --color-primary:#4F46E5; --color-primary-hover:#4338CA; --color-primary-subtle:#EEF2FF;
  --color-secondary:#14B8A6; --color-secondary-text:#0F766E;
  --color-accent:#F59E0B; --color-accent-text:#B45309;
  --color-bg:#F8FAFC; --color-surface:#FFFFFF; --color-surface-muted:#F1F5F9;
  --color-border:#E2E8F0; --color-border-strong:#CBD5E1;
  --color-text:#0F172A; --color-text-2:#475569; --color-text-muted:#64748B;
  --color-locked:#94A3B8; --color-progress:#4F46E5; --color-done:#16A34A; --color-done-text:#15803D;
  --color-error:#DC2626; --color-warning:#F59E0B; --color-info:#0EA5E9;
  --color-highlight-yellow:#FDE68A; --color-highlight-green:#BBF7D0;
  --radius-sm:.5rem; --radius-md:.75rem; --radius-lg:1rem;
  --motion-fast:120ms; --motion-base:200ms; --motion-slow:300ms;
  --font-heading:"Plus Jakarta Sans",system-ui,sans-serif; --font-body:"Inter",system-ui,sans-serif; --font-mono:"JetBrains Mono",ui-monospace,monospace;
}
:root[data-theme="dark"], @media (prefers-color-scheme:dark) { /* nilai dark sesuai Bagian 2; highlight-yellow:#854D0E, highlight-green:#166534 */ }
```
Pemetaan ke token shadcn/Tailwind 4 (`--primary`, `--background`, `--card`, `--muted`, `--destructive`, `--ring`) dilakukan Frontend dari tabel Bagian 2; jangan menambah token baru tanpa lewat change-management.

---

## 10. Catatan untuk Frontend Engineer
- Urutan implementasi disarankan: token & tema -> Button/Input/Card/Badge -> Skill Tree & Lanjutkan Belajar -> Pemutar & Kuis -> Mode Ujian (Reading, Listening, Writing, Speaking) -> Radar & Mahkota -> Admin Importer.
- Semua string UI melalui kamus `id`; jangan menanam teks Indonesia di komponen.
- Disclaimer AI/band tampil sebagai komponen bersama `<EstimasiNotice />`.
- Pengujian visual: light + dark, 375/768/1024/1440, reduced-motion, zoom 200%.

---

## 11. Visual Refresh v1.1 (2026-11-10) — Modern, ramah, dinamis

Permintaan pemilik: tampilan lebih *human friendly*, menarik, modern, dan dinamis. Palet tema Samudra yang berlaku **tidak berubah**; bagian ini hanya menambah token turunan dan melengkapi aturan yang disebut. Font tetap Plus Jakarta Sans + Inter.

### 11.1 Token baru
| Token | Light | Dark | Usage |
|---|---|---|---|
| `gradient-brand` | `linear-gradient(135deg, #1D4ED8, #0E7490)` | `linear-gradient(135deg, #3B82F6, #22D3EE)` | tombol primary, indikator nav aktif, isi progress bar. Dark memakai gradasi terang karena teks tombol primary di dark gelap (`#06142B`, >= 4.9:1) |
| `gradient-hero` | `linear-gradient(135deg, #1D4ED8, #0E7490)` | `linear-gradient(135deg, #1E40AF, #0E7490)` | hero sapaan dan logo-mark; selalu dengan teks/ikon putih (>= 5:1 di kedua ujung) |
| `glow-1` / `glow-2` | biru 10% / sian 9% | biru 16% / sian 10% | latar ambient halaman (radial, statis, di belakang konten) |
| `shadow-soft` / `shadow-lift` / `shadow-pop` / `shadow-brand` | bayangan lembut bertingkat | dikurangi | kartu, kartu hover, modal, tombol primary |
| `ease-out-expo` | `cubic-bezier(0.16,1,0.3,1)` | | easing masuk (Bagian 6) sebagai token CSS |

### 11.2 Aturan yang dilengkapi
- **Card interactive (5.3):** utilitas `card-lift`: hover/fokus = `shadow-lift` + border `primary/40` + `translateY(-2px)` (transform saja, tanpa layout shift).
- **Button primary (5.1):** latar `gradient-brand` + `shadow-brand`; hover menaikkan kecerahan; active scale 0.98. Varian lain tetap.
- **Navigasi (5.5):** sidebar menampilkan logo-mark gradasi di samping nama aplikasi; item aktif = pil `primary-subtle` + bilah kiri gradasi 3px. Bottom nav semi-transparan + `backdrop-blur`; item aktif = ikon dalam pil.
- **Beranda (5.10, 8.1):** judul sapaan menjadi hero bergradasi: sapaan sesuai waktu (pagi/siang/sore/malam) + "Halo, {nama}" + satu kalimat motivasi. Bento di bawahnya tidak berubah.
- **Motion (6):** blok beranda masuk dengan `fade-up` 400 ms (`translateY 8px -> 0`, opacity 0 -> 1) dan stagger 50 ms (maks. 6 langkah); hanya transform/opacity; mati pada reduced-motion.
- **Artikel (5.11):** daftar bernomor yang dilanjutkan (contoh Level 2 mulai dari 4) tetap melanjutkan nomornya; penanda nomor tebal; sub-daftar dirapatkan. Teks soal dan pembahasan mempertahankan ganti baris.

---

## Revision History

| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-03 | UX Designer | Initial design system (token, komponen, motion, a11y, wireframe) |
| 2026-11-04 | Frontend | SPEC-010: Menambah token highlight-yellow dan highlight-green untuk Reading Workspace |
| 2026-11-10 | Frontend | Visual Refresh v1.1 (Bagian 11): token gradasi/glow/shadow, kartu terangkat, tombol gradasi, nav & hero beranda, motion masuk, perapian daftar artikel |
