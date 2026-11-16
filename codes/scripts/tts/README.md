# Mesin TTS lokal untuk Listening (Kokoro)

`npm run listening:build` memanggil `TTS_ENGINE_CMD --voice <id> --speed <n> --text <teks> --output <wav>` lalu menggabungkan segmen dengan ffmpeg. Pembungkus di folder ini memenuhi antarmuka itu memakai [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), sepenuhnya offline setelah model diunduh.

Pemasangan (Windows, sekali saja; butuh `uv` dan internet):
```powershell
winget install Gyan.FFmpeg
$root = "$env:LOCALAPPDATA\ielts-tts"
uv venv --python 3.12 "$root\venv"
uv pip install --python "$root\venv\Scripts\python.exe" .\scripts\tts
mkdir "$root\models"
curl.exe -L -o "$root\models\kokoro-v1.0.onnx" https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl.exe -L -o "$root\models\voices-v1.0.bin"  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```
Lalu di `.env`: `TTS_ENGINE_CMD=<root>/venv/Scripts/kokoro-tts.exe`, `FFMPEG_PATH` dan `FFPROBE_PATH` (bila ffmpeg belum ada di PATH). Folder model bisa diganti dengan `KOKORO_MODEL_DIR`.

Suara `bf_*`/`bm_*` dilafalkan Inggris UK, `af_*`/`am_*` Inggris US.

Setelah audio dibangun, setiap bagian wajib didengar dan disetujui manusia di `content/gt-listening/reviews/<part_code>.review.json` (`approved: true`) sebelum bisa diimpor.
