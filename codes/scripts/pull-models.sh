#!/usr/bin/env sh
# Unduh model AI secara manual di host (container runtime tidak mengunduh model).
# Pemakaian: scripts/pull-models.sh [ollama-model ...]   (STT_MODEL dan WHISPER_DIR via env)
set -eu
STT_MODEL="${STT_MODEL:-base}"
WHISPER_DIR="${WHISPER_DIR:-./models/whisper}"

if [ "$#" -gt 0 ]; then
  for m in "$@"; do
    echo "ollama pull $m"
    ollama pull "$m"
  done
else
  echo "Lewati ollama pull (tidak ada nama model). Contoh: scripts/pull-models.sh qwen2.5:3b-instruct"
fi

mkdir -p "$WHISPER_DIR"
file="$WHISPER_DIR/ggml-$STT_MODEL.bin"
if [ ! -f "$file" ]; then
  echo "Mengunduh $file dari huggingface.co/ggerganov/whisper.cpp"
  curl -fL -o "$file" "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$STT_MODEL.bin"
fi
echo "Selesai. Salin $file ke volume whisper_models (lihat README/devops_log)."
