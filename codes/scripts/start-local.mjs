#!/usr/bin/env node
/**
 * Pintu masuk `npm run start:local` (SPEC-025 Fase 4). Sengaja memakai sintaks lama: file ini hanya memeriksa
 * versi Node, lalu memuat logika di scripts/lib/start-local.mjs (yang memakai sintaks modern) lewat import() dinamis,
 * agar Node lama mendapat pesan yang jelas, bukan SyntaxError.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

var parts = process.versions.node.split('.');
var major = Number(parts[0]);
var minor = Number(parts[1]);
if (major < 22 || (major === 22 && minor < 20)) {
  console.error('[start-local] Node.js v' + process.versions.node + ' terlalu lama. Aplikasi butuh Node.js 22.20 atau lebih baru.');
  process.exit(1);
}

var here = path.dirname(fileURLToPath(import.meta.url));
var codesDir = path.resolve(here, '..');
process.chdir(codesDir);

import(pathToFileURL(path.join(here, 'lib', 'start-local.mjs')).href)
  .then(function (mod) {
    return mod.runStartLocal(process.argv.slice(2), {
      cwd: codesDir,
      env: process.env,
      nodeVersion: process.version,
      execPath: process.execPath,
      out: function (s) {
        console.log(s);
      },
      err: function (s) {
        console.error(s);
      },
    });
  })
  .then(function (code) {
    process.exit(code);
  })
  .catch(function (e) {
    console.error('[start-local] Galat: ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
