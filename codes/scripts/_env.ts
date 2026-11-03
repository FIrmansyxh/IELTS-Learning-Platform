/** Muat codes/.env (bila ada) tanpa menimpa variabel yang sudah diset. Import paling awal di skrip CLI. */
import { existsSync } from 'node:fs';

if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* .env rusak: biarkan validasi env di skrip yang melaporkan */
  }
}
