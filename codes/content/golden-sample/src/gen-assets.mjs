// Membuat aset orisinal GS-1: 3 slide WebP (SVG -> WebP lewat sharp) dan 1 PDF cheatsheet (PDF ditulis tangan, font Helvetica).
// Jalankan dari folder codes/: node content/golden-sample/src/gen-assets.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FONT = "font-family=\"Arial, Helvetica, sans-serif\"";
const frame = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<rect width="1280" height="720" fill="#f7f9fc"/>
<rect x="0" y="0" width="1280" height="110" fill="#1f3a5f"/>
<text x="60" y="70" ${FONT} font-size="44" font-weight="700" fill="#ffffff">${esc(title)}</text>
${body}
<text x="60" y="690" ${FONT} font-size="20" fill="#5b6b82">Golden Sample 2.1.3 - Passive Voice - materi orisinal</text>
</svg>`;

const box = (x, y, w, h, fill, text, size = 30, color = '#10243e', weight = 600) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="#1f3a5f" stroke-width="2"/>` +
  `<text x="${x + w / 2}" y="${y + h / 2 + size / 3}" text-anchor="middle" ${FONT} font-size="${size}" font-weight="${weight}" fill="${color}">${esc(text)}</text>`;

// Slide 1: rumus
const rows = [
  ['Present Simple', 'am / is / are + V3', 'The milk is heated.'],
  ['Past Simple', 'was / were + V3', 'The samples were tested.'],
  ['Present Perfect', 'has / have been + V3', 'The glass has been cooled.'],
  ['Future (will)', 'will be + V3', 'The results will be published.'],
  ['Modal', 'can / must / should be + V3', 'Waste water must be treated.'],
];
let s1 = `<text x="60" y="170" ${FONT} font-size="28" fill="#10243e">Rumus inti: subjek + be (sesuai tense) + verb bentuk ketiga (V3)</text>`;
s1 += `<rect x="60" y="195" width="1160" height="52" fill="#dbe6f5"/>` +
  [['Tense', 80], ['Rumus pasif', 420], ['Contoh', 820]].map(([t, x]) => `<text x="${x}" y="230" ${FONT} font-size="26" font-weight="700" fill="#10243e">${t}</text>`).join('');
rows.forEach((r, i) => {
  const y = 255 + i * 84;
  s1 += `<rect x="60" y="${y}" width="1160" height="76" rx="8" fill="${i % 2 ? '#ffffff' : '#eef3fa'}"/>`;
  s1 += `<text x="80" y="${y + 48}" ${FONT} font-size="26" fill="#10243e">${esc(r[0])}</text>`;
  s1 += `<text x="420" y="${y + 48}" ${FONT} font-size="26" font-weight="700" fill="#b0391f">${esc(r[1])}</text>`;
  s1 += `<text x="820" y="${y + 48}" ${FONT} font-size="26" font-style="italic" fill="#10243e">${esc(r[2])}</text>`;
});

// Slide 2: transformasi
let s2 = `<text x="60" y="165" ${FONT} font-size="28" fill="#10243e">Objek aktif naik menjadi subjek pasif. Pelaku turun atau dibuang.</text>`;
s2 += `<text x="60" y="225" ${FONT} font-size="26" font-weight="700" fill="#1f3a5f">AKTIF</text>`;
s2 += box(60, 245, 300, 90, '#ffe9d6', 'The factory') + box(380, 245, 260, 90, '#e1f0e1', 'produces') + box(660, 245, 330, 90, '#dbe6f5', 'thousands of bottles');
s2 += `<text x="1010" y="300" ${FONT} font-size="26" fill="#10243e">every day.</text>`;
s2 += `<path d="M825 345 C825 420 250 400 250 470" fill="none" stroke="#b0391f" stroke-width="5"/><polygon points="238,462 262,462 250,490" fill="#b0391f"/>`;
s2 += `<text x="60" y="540" ${FONT} font-size="26" font-weight="700" fill="#1f3a5f">PASIF</text>`;
s2 += box(60, 560, 380, 90, '#dbe6f5', 'Thousands of bottles') + box(460, 560, 260, 90, '#e1f0e1', 'are produced') + box(740, 560, 280, 90, '#ffe9d6', '(by the factory)');
s2 += `<text x="1040" y="615" ${FONT} font-size="26" fill="#10243e">every day.</text>`;
s2 += `<text x="900" y="500" ${FONT} font-size="22" fill="#5b6b82">pelaku: boleh dibuang</text>`;

// Slide 3: alur proses
const steps = [
  ['1', 'The cocoa pods', 'are picked.'],
  ['2', 'The beans', 'are dried in the sun.'],
  ['3', 'The beans', 'are roasted and ground.'],
  ['4', 'The paste', 'is mixed with sugar.'],
  ['5', 'The mixture', 'is poured into moulds.'],
];
let s3 = `<text x="60" y="165" ${FONT} font-size="28" fill="#10243e">Deskripsi proses pembuatan cokelat memakai kalimat pasif</text>`;
steps.forEach((st, i) => {
  const x = 40 + i * 240;
  s3 += `<rect x="${x}" y="220" width="215" height="300" rx="16" fill="#ffffff" stroke="#1f3a5f" stroke-width="2"/>`;
  s3 += `<circle cx="${x + 107}" cy="262" r="26" fill="#1f3a5f"/><text x="${x + 107}" y="272" text-anchor="middle" ${FONT} font-size="28" font-weight="700" fill="#ffffff">${st[0]}</text>`;
  s3 += `<text x="${x + 107}" y="345" text-anchor="middle" ${FONT} font-size="24" font-weight="700" fill="#10243e">${esc(st[1])}</text>`;
  const words = st[2].split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > 14) { lines.push(cur.trim()); cur = w; } else cur = (cur + ' ' + w).trim(); }
  lines.push(cur);
  lines.forEach((ln, li) => { s3 += `<text x="${x + 107}" y="${395 + li * 34}" text-anchor="middle" ${FONT} font-size="26" fill="#b0391f" font-weight="600">${esc(ln)}</text>`; });
  if (i < steps.length - 1) s3 += `<polygon points="${x + 218},360 ${x + 238},370 ${x + 218},380" fill="#1f3a5f"/>`;
});
s3 += `<text x="60" y="590" ${FONT} font-size="26" fill="#10243e">Tambahkan kata urutan: First, Next, After that, Finally.</text>`;

const slides = [
  ['slides/passive-formula.webp', 'Rumus Passive Voice', s1],
  ['slides/passive-transform.webp', 'Aktif menjadi Pasif', s2],
  ['slides/passive-process.webp', 'Pasif pada Deskripsi Proses', s3],
];
for (const [file, title, body] of slides) {
  await sharp(Buffer.from(frame(title, body))).webp({ quality: 88 }).toFile(path.join(root, 'assets', file));
}

// ------------------------------------------------------------------ PDF (ASCII, Helvetica)
const lines = [
  ['T', 'Cheatsheet Passive Voice (IELTS Writing Task 1 dan Reading)'],
  ['S', 'Materi orisinal Golden Sample 2.1.3. Dibuat untuk latihan; bukan salinan buku atau tes manapun.'],
  ['', ''],
  ['H', '1. Rumus inti'],
  ['', 'Subjek + be (sesuai tense) + verb bentuk ketiga (V3). Pelaku boleh dibuang atau ditulis dengan by.'],
  ['', ''],
  ['', 'Present Simple     : am / is / are + V3          The milk is heated to 72 degrees.'],
  ['', 'Past Simple        : was / were + V3             The samples were tested in 2019.'],
  ['', 'Present Continuous : am / is / are being + V3    The bridge is being repaired.'],
  ['', 'Present Perfect    : has / have been + V3        The glass has been cooled.'],
  ['', 'Past Perfect       : had been + V3               The film had been shown twice.'],
  ['', 'Future (will)      : will be + V3                The results will be published.'],
  ['', 'Modal              : can / must / should be + V3 Waste water must be treated.'],
  ['', ''],
  ['H', '2. Kapan memakai pasif'],
  ['', '- Pelaku tidak penting atau sudah jelas:  The road was closed for repairs.'],
  ['', '- Pelaku tidak diketahui:                 My bicycle was stolen last night.'],
  ['', '- Fokus pada proses atau hasil:           The bricks are baked in a kiln.'],
  ['', 'Gunakan by + pelaku hanya bila pelaku membawa informasi penting.'],
  ['', ''],
  ['H', '3. Verb-3 tidak beraturan yang sering muncul (dasar - V2 - V3)'],
  ['', 'break - broke - broken     build - built - built      burn - burnt/burned - burnt/burned'],
  ['', 'buy - bought - bought      choose - chose - chosen    cut - cut - cut'],
  ['', 'do - did - done            draw - drew - drawn        drive - drove - driven'],
  ['', 'eat - ate - eaten          find - found - found       give - gave - given'],
  ['', 'grind - ground - ground    grow - grew - grown        hold - held - held'],
  ['', 'keep - kept - kept         make - made - made         melt - melted - melted'],
  ['', 'put - put - put            read - read - read         send - sent - sent'],
  ['', 'sell - sold - sold         show - showed - shown      take - took - taken'],
  ['', 'teach - taught - taught    wear - wore - worn         write - wrote - written'],
  ['', ''],
  ['H', '4. Kata urutan untuk paragraf proses'],
  ['', 'First / Initially, ... Next / Then, ... After that, ... Once the X has been Y, ... Finally, ...'],
  ['', ''],
  ['H', '5. Tiga kesalahan umum'],
  ['', '- Lupa be:  The beans dried in the sun (salah) -> The beans are dried in the sun.'],
  ['', '- Bukan V3: The wheat is grind (salah) -> The wheat is ground.'],
  ['', '- Kata kerja intransitif tidak dipasifkan: The accident was happened (salah) -> The accident happened.'],
  ['', ''],
  ['H', '6. Daftar cek sebelum mengumpulkan'],
  ['', '[ ] Setiap pasif punya be dan V3.   [ ] be sesuai dengan subjek dan tense.'],
  ['', '[ ] Tidak semua kalimat pasif; ada variasi dengan kata urutan dan klausa waktu.'],
];

const pdfEsc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const pageH = 842;
const pages = [];
let cur = [];
let y = 790;
for (const [kind, text] of lines) {
  const size = kind === 'T' ? 17 : kind === 'H' ? 13 : kind === 'S' ? 9 : 9.5;
  const font = kind === 'T' || kind === 'H' ? 'F2' : kind === '' && text.includes('  ') && /:/.test(text) ? 'F3' : 'F1';
  const lead = kind === 'T' ? 28 : kind === 'H' ? 22 : 15;
  if (y < 60) { pages.push(cur); cur = []; y = 790; }
  if (text) cur.push(`BT /${font} ${size} Tf 50 ${y} Td (${pdfEsc(text)}) Tj ET`);
  y -= lead;
}
pages.push(cur);

const objs = [];
const add = (s) => (objs.push(s), objs.length);
add('<< /Type /Catalog /Pages 2 0 R >>');
add(''); // pages placeholder
add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
const kids = [];
for (const content of pages) {
  const stream = content.join('\n');
  const cId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  const pId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${cId} 0 R >>`);
  kids.push(`${pId} 0 R`);
}
objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
let out = '%PDF-1.4\n';
const offsets = [];
objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
const xref = Buffer.byteLength(out, 'latin1');
out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(path.join(root, 'assets', 'docs', 'passive-voice-cheatsheet.pdf'), Buffer.from(out, 'latin1'));
console.log('aset dibuat:', slides.length, 'slide +', pages.length, 'halaman PDF');
