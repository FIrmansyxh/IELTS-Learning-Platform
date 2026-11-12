"""Mesin TTS lokal untuk `npm run listening:build` (SPEC-024).

Antarmuka yang dipanggil builder:
    kokoro-tts --voice <id> --speed <angka> --text <teks> --output <berkas.wav>

Model Kokoro (kokoro-v1.0.onnx dan voices-v1.0.bin) dibaca dari folder
KOKORO_MODEL_DIR (bawaan: %LOCALAPPDATA%/ielts-tts/models).
Suara berawalan b (bf_/bm_) memakai lafal Inggris UK, selainnya US.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def model_dir() -> Path:
    env = os.environ.get("KOKORO_MODEL_DIR")
    if env:
        return Path(env)
    base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(base) / "ielts-tts" / "models"


def main() -> int:
    p = argparse.ArgumentParser(prog="kokoro-tts")
    p.add_argument("--voice", required=True)
    p.add_argument("--speed", type=float, default=1.0)
    p.add_argument("--text", required=True)
    p.add_argument("--output", required=True)
    a = p.parse_args()

    import soundfile as sf
    from kokoro_onnx import Kokoro

    d = model_dir()
    onnx, voices = d / "kokoro-v1.0.onnx", d / "voices-v1.0.bin"
    if not onnx.exists() or not voices.exists():
        print(f"Model Kokoro tidak ditemukan di {d}", file=sys.stderr)
        return 2

    lang = "en-gb" if a.voice.startswith("b") else "en-us"
    samples, sr = Kokoro(str(onnx), str(voices)).create(a.text, voice=a.voice, speed=a.speed, lang=lang)
    sf.write(a.output, samples, sr, subtype="PCM_16")
    return 0


if __name__ == "__main__":
    sys.exit(main())
