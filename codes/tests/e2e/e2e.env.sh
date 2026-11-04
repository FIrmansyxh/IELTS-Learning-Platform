# Env untuk server+worker E2E (DB terpisah ielts_e2e, AI mock). Gunakan: set -a; . tests/e2e/e2e.env.sh; set +a
set -a; . ./.env; set +a
export DATABASE_URL="${DATABASE_URL%/ielts}/ielts_e2e"
export DATABASE_MIGRATOR_URL="${DATABASE_MIGRATOR_URL%/ielts}/ielts_e2e"
export LLM_DRIVER=mock STT_DRIVER=mock AI_ENABLED=true
export ASSETS_DIR=/tmp/e2e-assets
export AUTH_URL=http://127.0.0.1:3000
export AUTH_TRUST_HOST=true
export LOG_LEVEL=warn
# Worker: latensi LLM mock 3 dtk (SPEC-012 E2E: Antre -> Memproses -> Hasil)
export MOCK_LLM_LATENCY_MS=${MOCK_LLM_LATENCY_MS:-3000}
