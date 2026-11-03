# CAPACITY PLANNING: ielts-learning-platform

**Owner Agent:** SysArch
**Date:** 2026-11-03
**Status:** `Approved` (didelegasikan, lihat ADR-003)
**WORK_DEPTH:** standard

> Catatan metode: SOP SysArch mewajibkan bertanya ke user. Untuk proyek ini seluruh parameter beban sudah ditetapkan di requirements (NFR 5 dan 6), sehingga tidak ada ronde tanya-jawab baru; angka lain di bawah adalah ASUMSI SysArch dan ditandai. Angka kecepatan LLM/STT adalah **estimasi kasar rule of thumb**, bukan hasil benchmark; wajib diverifikasi di mesin sebenarnya (task benchmark pada spec 000).

## 1. Parameter Masukan
| Parameter | Nilai | Sumber |
|---|---|---|
| Registered users | <50 (6 bulan dan 1 sampai 2 tahun) | requirements 5 |
| Concurrent users puncak | 5 sampai 10 | ASUMSI (kenalan belajar bersamaan malam hari) |
| Job AI aktif | 1 pada satu waktu | requirements 5 |
| Submission Writing+Speaking | ~20 per user per bulan, puncak 100 per hari | ASUMSI |
| Rekaman Speaking | maks 2 menit, WebM/Opus ~0,5 MB | ASUMSI (Opus 32 kbps) |
| Target halaman materi | <2 dtk di lokal | requirements 5 |
| Target penilaian AI | 10 sampai 60 dtk dengan indikator progres | requirements 5 |
| Uptime | tidak ada target | requirements 5 |
| Budget | nol (hardware yang sudah ada) | requirements 5 |

## 2. Estimasi Sumber Daya

### 2.1 Database
Baris: user 50 + progres (50 x ~300 sub-modul = 15.000) + submission (50 x 20 x 12 = 12.000/tahun) + attempt asesmen (~50.000/tahun) + audit/job (~50.000) = ~130.000 baris/tahun. Dengan rumus SOP: 130.000 x 2 KB x 1,5 x 3 = ~1,1 GB. Konten JSONB (soal/materi) beberapa puluh MB. **Alokasi DB: 5 GB** (sangat longgar). Teks Writing disimpan di DB (kecil).

### 2.2 Penyimpanan File
| Item | Perhitungan | Perkiraan |
|---|---|---|
| Slide + dokumen | ~300 sub-modul x ~10 slide x 100 KB + unduhan PDF/DOCX | ~1 GB |
| Audio Listening | ~200 klip x ~5 MB | ~1 GB |
| Rekaman Speaking | 100/hari puncak, rata-rata ~15/hari x 0,5 MB x 365 x 1 thn x 1,3 | ~3,5 GB/tahun (batas atas puncak ~25 GB) |
| Bobot model | Ollama 7B Q4 ~4,7 GB, 3B ~2 GB, whisper small ~0,5 GB (base ~0,15 GB), image Docker ~5 GB | ~8 sampai 13 GB |
| Backup lokal | 14 harian + 8 mingguan DB (dump ~100 MB) + salinan aset | ~10 GB |

**Total: ~30 GB; rekomendasi ruang bebas SSD 60 GB** (batas bawah 40 GB). Kebijakan retensi usulan: rekaman audio mentah disimpan 90 hari lalu dihapus, transkrip dan skor tetap (mengurangi data sensitif sesuai prinsip UU PDP). Perlu konfirmasi human (OQ-6).

### 2.3 RAM (concurrent 10, SOP rule of thumb)
| Komponen | Hitungan | RAM |
|---|---|---|
| web (Next.js) | 512 MB + 10 x 2 MB | ~0,6 GB |
| worker | proses Node + ffmpeg sesaat | ~0,4 GB |
| db | 1 GB + 10 x 1,5 x 5 MB (shared_buffers dibatasi 256 MB) | ~1,1 GB |
| Redis | tidak dipakai (pg-boss di Postgres) | 0 |
| Ollama 3B Q4 | bobot ~2 GB + KV cache | ~2,5 sampai 3 GB |
| Ollama 7B/8B Q4 | bobot ~4,7 GB + KV cache 4k konteks | ~6 sampai 6,5 GB |
| STT base / small | bobot + buffer audio | ~0,4 / ~1 GB |
| OS + Docker Desktop/WSL2 overhead | | ~2 sampai 3 GB |

Karena hanya 1 job AI aktif dan job dijalankan berurutan (STT dulu, baru LLM), puncak memori model = LLM + STT bersamaan hanya bila `OLLAMA_KEEP_ALIVE` panjang. Rekomendasi: STT dimuat sesaat, LLM `keep_alive` 5 menit.

| Skenario | Total sekitar | Setelah headroom 1,5x | RAM host minimum |
|---|---|---|---|
| Tier A: 3B + whisper base | ~8 GB | (batas sempit) | **8 GB (cukup ketat), ideal 12 GB** |
| Tier B: 7/8B + whisper small | ~12 GB | ~16 GB | **16 GB** |
| Tier C: GPU, 7/8B di VRAM | RAM sistem ~6 GB | | **16 GB RAM + VRAM >=8 GB** |

### 2.4 CPU
CRUD ringan: 5 sampai 10 concurrent x ~6 req/menit = <60 req/menit, jauh di bawah 1 vCPU. Beban dominan adalah inferensi:
- Tanpa GPU, LLM 7B Q4 berjalan ~3 sampai 8 token/dtk pada CPU 8 thread modern. Umpan balik Writing terstruktur ~500 sampai 800 token keluaran = **~60 sampai 250 dtk**. Ini **melebihi target 10 sampai 60 dtk** pada Tier B tanpa GPU.
- Tanpa GPU, model 3B: ~10 sampai 20 token/dtk, ~30 sampai 80 dtk (mendekati target).
- Dengan GPU >=8 GB VRAM: ~30 sampai 80 token/dtk, ~10 sampai 25 dtk (memenuhi target).
- whisper.cpp 2 menit audio: `base` ~10 sampai 25 dtk, `small` ~30 sampai 90 dtk di CPU; <15 dtk dengan GPU/CUDA build.
- Speaking total (STT + LLM) tanpa GPU 7B dapat mencapai 2 sampai 5 menit; indikator progres + antrean wajib, dan target 60 dtk hanya realistis dengan GPU atau model 3B.

Minimum host: **6 core / 12 thread (atau lebih), AVX2**. Batasi `cpus` container web/db agar inferensi tidak membuat UI membeku (mis. ollama dibatasi 75 persen core).

### 2.5 Bandwidth
LAN: tidak signifikan (~50 MB/pengguna/hari, total <3 GB/hari). Via tunnel: beban ada di uplink rumah; slide WebP dan audio perlu cache header panjang. Video lewat YouTube (tidak membebani server).

## 3. Proyeksi Pertumbuhan
| Horizon | Users | Submission AI/bln | DB | Aset+rekaman | Catatan |
|---|---|---|---|---|---|
| Sekarang (awal) | 5 | 100 | <50 MB | ~3 GB + model | Fokus golden sample |
| 6 bulan | <50 | ~1.000 | ~300 MB | ~7 GB | Semua Tier terisi bertahap |
| 1 tahun | <50 | ~1.000 | ~1 GB | ~10 GB | Retensi audio 90 hari menahan pertumbuhan |
| 2 tahun | <50 (atau 100 bila dibuka) | ~1.000 s.d. 2.000 | ~2 GB | ~15 GB | Masih satu mesin |

Pertumbuhan tidak mengubah arsitektur; yang memaksa perubahan hanya (a) antrean AI panjang, (b) pengguna aktif bersamaan >10, atau (c) dibuka publik.

## 4. Normal vs Puncak
Tidak ada musim puncak formal. Puncak = ujian/persiapan IELTS mendadak dan malam hari: kemungkinan 5 sampai 10 pengguna mengirim Writing hampir bersamaan. Karena 1 job AI aktif, antrean menumpuk: 10 submission x ~2 menit (Tier B CPU) = ~20 menit tunggu untuk yang terakhir. Mitigasi: indikator posisi antrean, prioritas job pendek (Writing) di atas Speaking, batas submission AI harian per pengguna (usulan 10), fallback self-assessment.

## 5. Spesifikasi Mesin yang Direkomendasikan
| Tier | CPU | RAM | GPU | Disk | Model | Cocok untuk |
|---|---|---|---|---|---|---|
| A (minimum) | 6 core, AVX2 | 8 sampai 12 GB | tidak ada | 40 GB SSD | LLM 3B Q4, whisper base | Uji coba, kualitas nilai rendah-menengah |
| B (standar) | 8 core | 16 GB | tidak ada | 60 GB SSD | LLM 7/8B Q4, whisper small | Kualitas baik, tetapi lambat (menit) |
| C (ideal) | 8 core | 16 sampai 32 GB | NVIDIA >=8 GB VRAM | 60 GB SSD | LLM 7/8B (atau 14B bila VRAM >=12 GB), whisper small/medium | Memenuhi target 10 sampai 60 dtk |

Pilihan model final **bergantung pada OQ-1** (RAM/GPU belum diketahui). Lihat matriks keputusan di `infrastructure.md` bagian 6 dan ADR-002.

## Revision History
| Timestamp | Agen | Perubahan |
|-----------|------|-----------|
| 2026-11-03 | SysArch | Dokumen dibuat |
