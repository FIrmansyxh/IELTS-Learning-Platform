// Dijalankan di tiap berkas integration test (proses uji), setelah globalSetup menyiapkan DB.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATABASE_PATH = process.env.TEST_DATABASE_PATH;
process.env.AUTH_SECRET = 'integration-test-secret-0123456789abcdef-xyz';
process.env.AUTH_URL = 'http://localhost:3000';
process.env.ALLOWED_HOSTS = 'localhost:3000,127.0.0.1:3000';
process.env.IP_HMAC_SECRET = 'integration-ip-hmac-secret-0123456789abcdef';
process.env.AUTH_TRUST_HOST = 'true';
process.env.LOG_LEVEL = 'silent';
process.env.ASSETS_DIR ??= mkdtempSync(path.join(tmpdir(), 'ielts-assets-'));
