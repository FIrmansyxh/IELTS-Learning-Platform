# Aset dan tinjauan yang menunggu pemilik (Golden Sample)

Paket `content/golden-sample/` valid (exit 0) TANPA item di bawah. Item ini sengaja tidak dibuat/dipalsukan.

## 1. Audio rekaman pemilik (GS-3 dan Boss Tier 1 Listening)
| Kebutuhan | Naskah | Berkas yang diharapkan | asset_code |
|---|---|---|---|
| GS-3 drill 3.1.1 (audio 3-5 menit) | `gs3-listening-script.md` | `assets/audio/gs-3-listening.mp3` (atau .ogg/.wav, <= 50 MB) | `gs/listening/course-booking` |
| GS-6 Boss Tier 1 Listening (3 section) | `boss-t1-listening-script.md` | `assets/audio/boss-t1-listening.mp3` | `gs/listening/boss-t1` |

Langkah setelah merekam:
1. Letakkan berkas di `assets/audio/`.
2. Tambahkan ke `assets.manifest.json`:
   `{ "asset_code": "gs/listening/course-booking", "kind": "AUDIO_LISTENING", "title": "GS-3 rekaman pendaftaran kursus", "source_code": "OWN", "rights_status": "OWN_ORIGINAL", "file": "audio/gs-3-listening.mp3" }`
   dan entri serupa untuk `gs/listening/boss-t1`.
3. Di `content.json` sub-modul `3.1.1`, tambahkan `"listening_asset_code": "gs/listening/course-booking"` pada `active_drill`
   (atau tambahkan di `src/build.mjs` pada objek `gs3.active_drill`, lalu jalankan `node content/golden-sample/src/build.mjs`).
4. Tambahkan isi `boss-t1-listening.section.json` ke array `assessment_sets` (atau ke `boss` di `src/build.mjs`).
5. Jalankan `npm run content:validate -- content/golden-sample`. (Varian lengkap ini telah diuji dengan audio senyap uji di luar repo: valid, 7 set, 6 aset.)
Catatan: `ffprobe` mungkin belum terpasang; durasi MP3/OGG akan kosong (peringatan), WAV terbaca dari header.

## 2. Video YouTube GS-1 (backlog C-08)
`materials.videos` GS-1 dikosongkan. Pemilik memilih video Indonesia nyata (ID 11 karakter), menambahkan
`{ "video_id": "...", "title": "...", "instructor_channel": "...", "language": "ID", "start_sec": n, "end_sec": m }`
ke `gs1.materials.videos` di `src/build.mjs`, build ulang, lalu memverifikasi aset video (UNVERIFIED menjadi EMBED_ONLY) lewat SPEC-018 sebelum publikasi.

## 3. Tinjauan manusia
Semua teks ditulis AI (`origin = AI_GENERATED_REVIEWED`, sumber `OWN`). Tinjauan pemilik BELUM dilakukan; semua entitas diimpor sebagai `DRAFT`. Jangan publikasikan sebelum pemilik membaca artikel, bacaan, soal, kunci, dan pembahasan.
