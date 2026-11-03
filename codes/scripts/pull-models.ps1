# Unduh model AI secara manual di host Windows (container runtime tidak mengunduh model).
# Pemakaian: .\scripts\pull-models.ps1 [-OllamaModels qwen2.5:3b-instruct] [-SttModel base] [-WhisperDir .\models\whisper]
param(
  [string[]]$OllamaModels = @(),
  [string]$SttModel = $(if ($env:STT_MODEL) { $env:STT_MODEL } else { 'base' }),
  [string]$WhisperDir = '.\models\whisper'
)
$ErrorActionPreference = 'Stop'
foreach ($m in $OllamaModels) {
  Write-Host "ollama pull $m"
  ollama pull $m
}
if ($OllamaModels.Count -eq 0) { Write-Host 'Lewati ollama pull (tidak ada nama model).' }
New-Item -ItemType Directory -Force -Path $WhisperDir | Out-Null
$file = Join-Path $WhisperDir "ggml-$SttModel.bin"
if (-not (Test-Path $file)) {
  Write-Host "Mengunduh $file"
  Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$SttModel.bin" -OutFile $file
}
Write-Host "Selesai. Salin $file ke volume whisper_models."
