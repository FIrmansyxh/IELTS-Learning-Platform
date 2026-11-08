/**
 * Dispatcher CLI pemeliharaan lokal (SPEC-025 D7). `runCli(argv, io)` mengembalikan kode keluar:
 * 0 sukses, 1 salah pemakaian/galat yang dipahami pengguna, 3 galat teknis. Mudah diuji (tanpa spawn).
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { BandSkill, CreateBandTableBodySchema, type BandSkillName } from '@/contracts/band';
import { ApiError } from '../http/errors';
import { activateTable, createTable, listTables } from '../band/service';
import { getSettingView, listSettings, setSetting } from '../settings/manage';
import { OFFLINE_NOTES, runDoctor } from './doctor';
import {
  CliError,
  pointsAdjust,
  pointsShow,
  profileCreate,
  profileDelete,
  profileList,
  profileRename,
  progressReset,
  progressUnlock,
} from './ops';

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}
const defaultIo: CliIo = { out: (l) => console.log(l), err: (l) => console.error(l) };

export const USAGE = `Pemakaian: npm run cli -- <area> <perintah> [argumen]

Profil
  profile list                          daftar profil
  profile create <nama>                 buat profil
  profile rename <profil> <nama-baru>
  profile delete <profil> --yes         hapus profil + seluruh progresnya
Progres
  progress unlock <profil> <kode>       buka kunci Tier (3), Modul (3.3), atau Sub-modul (3.3.3)
  progress reset <profil> --sub <kode> --yes     reset satu sub-modul
  progress reset <profil> --all --yes            reset seluruh progres belajar
Poin
  points show                           total poin tiap profil
  points adjust <profil> <selisih> --reason "..."
Pengaturan
  settings list | settings get <kunci> | settings set <kunci> <nilai>
Tabel band
  band list [--skill LISTENING|READING_ACADEMIC|READING_GENERAL]
  band activate <id-tabel>
  band import <berkas.json> [--activate]
Lainnya
  doctor                                periksa kesiapan aplikasi

<profil> = nama (tanpa memedulikan huruf besar/kecil) atau id.`;

function table(io: CliIo, header: string[], rows: string[][]): void {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const fmtRow = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join('  ').trimEnd();
  io.out(fmtRow(header));
  io.out(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) io.out(fmtRow(r));
}

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Bilangan negatif (mis. -80) bukan opsi: lindungi dari parseArgs lalu kembalikan. */
const NEG = '';
const protectNegatives = (args: string[]) => args.map((a) => (/^-\d+\.?\d*$/.test(a) ? NEG + a : a));

async function dispatch(rawArgs: string[], io: CliIo): Promise<number> {
  const { values, positionals: rawPositionals } = parseArgs({
    args: protectNegatives(rawArgs),
    allowPositionals: true,
    options: {
      yes: { type: 'boolean' },
      all: { type: 'boolean' },
      sub: { type: 'string' },
      reason: { type: 'string' },
      skill: { type: 'string' },
      activate: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const positionals = rawPositionals.map((p) => (p.startsWith(NEG) ? p.slice(NEG.length) : p));
  const [area, cmd, ...rest] = positionals;
  if (values.help) {
    io.out(USAGE);
    return 0;
  }
  if (!area) {
    io.out(USAGE);
    return 1;
  }

  switch (`${area} ${cmd ?? ''}`.trim()) {
    case 'profile list': {
      const ps = await profileList();
      if (ps.length === 0) io.out('Belum ada profil. Buat dengan: npm run profile:create -- "Nama"');
      else table(io, ['NAMA', 'SELESAI', 'ID'], ps.map((p) => [p.display_name, String(p.completed_sub_modules), p.id]));
      return 0;
    }
    case 'profile create': {
      if (!rest[0]) throw new CliError('Nama profil wajib diisi.');
      const p = await profileCreate(rest.join(' '));
      io.out(`Profil dibuat: ${p.displayName} (${p.id})`);
      return 0;
    }
    case 'profile rename': {
      if (!rest[0] || !rest[1]) throw new CliError('Pemakaian: profile rename <profil> <nama-baru>');
      const p = await profileRename(rest[0], rest.slice(1).join(' '));
      io.out(`Profil diganti namanya menjadi: ${p.displayName}`);
      return 0;
    }
    case 'profile delete': {
      if (!rest[0]) throw new CliError('Pemakaian: profile delete <profil> --yes');
      if (!values.yes) throw new CliError('Penghapusan permanen. Tambahkan --yes untuk melanjutkan.');
      const p = await profileDelete(rest[0]);
      io.out(`Profil dihapus beserta seluruh progresnya: ${p.displayName}`);
      return 0;
    }
    case 'progress unlock': {
      if (!rest[0] || !rest[1]) throw new CliError('Pemakaian: progress unlock <profil> <kode>');
      const r = await progressUnlock(rest[0], rest[1]);
      io.out(`Terbuka untuk ${r.profile.displayName}: ${r.label}`);
      return 0;
    }
    case 'progress reset': {
      if (!rest[0]) throw new CliError('Pemakaian: progress reset <profil> (--sub <kode> | --all) --yes');
      if (!values.yes) throw new CliError('Reset menghapus progres dan percobaan. Tambahkan --yes untuk melanjutkan.');
      const r = await progressReset(rest[0], { sub: values.sub, all: values.all });
      io.out(`Reset ${r.scope} untuk ${r.profile.displayName}. Percobaan dihapus: ${r.attemptsDeleted}.`);
      return 0;
    }
    case 'points show': {
      table(io, ['PROFIL', 'POIN', 'STREAK'], (await pointsShow()).map((p) => [p.name, String(p.total), String(p.streak)]));
      return 0;
    }
    case 'points adjust': {
      if (!rest[0] || rest[1] === undefined) throw new CliError('Pemakaian: points adjust <profil> <selisih> --reason "..."');
      const r = await pointsAdjust(rest[0], Number(rest[1]), values.reason ?? '');
      io.out(`Poin ${r.profile.displayName} kini ${r.total}.`);
      return 0;
    }
    case 'settings list': {
      table(io, ['KUNCI', 'NILAI', 'DEFAULT', 'RENTANG'], (await listSettings()).map((s) => [
        s.key,
        String(s.value),
        String(s.default),
        s.type === 'int' ? `${s.min}-${s.max}` : s.options ? s.options.join('|') : 'true|false',
      ]));
      return 0;
    }
    case 'settings get': {
      if (!rest[0]) throw new CliError('Pemakaian: settings get <kunci>');
      const s = await getSettingView(rest[0]);
      io.out(`${s.key} = ${String(s.value)} (default ${String(s.default)})\n${s.description}`);
      return 0;
    }
    case 'settings set': {
      if (!rest[0] || rest[1] === undefined) throw new CliError('Pemakaian: settings set <kunci> <nilai>');
      const s = await setSetting(rest[0], parseValue(rest[1]));
      io.out(`${s.key} = ${String(s.value)}`);
      return 0;
    }
    case 'band list': {
      let skill: BandSkillName | undefined;
      if (values.skill) {
        const parsed = BandSkill.safeParse(values.skill);
        if (!parsed.success) throw new CliError('--skill harus LISTENING, READING_ACADEMIC, atau READING_GENERAL.');
        skill = parsed.data;
      }
      const rows = await listTables(skill);
      table(io, ['AKTIF', 'SKILL', 'LABEL', 'BARIS', 'DIPAKAI', 'ID'], rows.map((t) => [t.is_active ? '*' : '', t.skill, t.version_label, String(t.row_count), String(t.used_by_attempts), t.id]));
      return 0;
    }
    case 'band activate': {
      if (!rest[0]) throw new CliError('Pemakaian: band activate <id-tabel>');
      await activateTable(null, rest[0]);
      io.out('Tabel band diaktifkan.');
      return 0;
    }
    case 'band import': {
      if (!rest[0]) throw new CliError('Pemakaian: band import <berkas.json> [--activate]');
      let json: unknown;
      try {
        // Jalur berkas diberikan operator lokal lewat argumen CLI (bukan input jaringan).
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        json = JSON.parse(await readFile(rest[0], 'utf8'));
      } catch (e) {
        throw new CliError(`Berkas tidak bisa dibaca/diparse: ${(e as Error).message}`);
      }
      const body = CreateBandTableBodySchema.safeParse(json);
      if (!body.success) throw new CliError(`Isi berkas tidak valid: ${body.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(akar)'}: ${i.message}`).join('; ')}`);
      const t = await createTable(null, body.data);
      io.out(`Tabel dibuat: ${t.skill} ${t.version_label} (${t.row_count} baris, id ${t.id})`);
      if (values.activate) {
        await activateTable(null, t.id);
        io.out('Tabel diaktifkan.');
      }
      return 0;
    }
    case 'doctor': {
      const checks = await runDoctor();
      const mark = { ok: '[OK]  ', warn: '[CATAT]', fail: '[GAGAL]' } as const;
      for (const c of checks) io.out(`${mark[c.status]} ${c.name}: ${c.detail}`);
      io.out('\nCatatan koneksi internet:');
      for (const n of OFFLINE_NOTES) io.out(`  - ${n}`);
      const failed = checks.filter((c) => c.status === 'fail').length;
      io.out(failed === 0 ? '\nSiap dipakai.' : `\n${failed} pemeriksaan gagal.`);
      return failed === 0 ? 0 : 1;
    }
    default:
      io.err(`Perintah tidak dikenal: ${area}${cmd ? ` ${cmd}` : ''}\n`);
      io.out(USAGE);
      return 1;
  }
}

function describe(err: unknown): { message: string; user: boolean } {
  if (err instanceof CliError) return { message: err.message, user: true };
  if (err instanceof ApiError) {
    const d = err.details?.[0];
    return { message: d ? `${err.message} (${d.path}: ${d.message})` : err.message, user: true };
  }
  return { message: err instanceof Error ? err.message : String(err), user: false };
}

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (err) {
    const d = describe(err);
    io.err(`${d.user ? 'Galat' : 'Galat teknis'}: ${d.message}`);
    return d.user ? 1 : 3;
  }
}
