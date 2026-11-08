/* eslint-disable @typescript-eslint/no-explicit-any */
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openRaw } from '@/server/db';
import { runMigrations } from '@/server/db-migrate';

const REAL = path.resolve('drizzle');
const dirs: string[] = [];
const tmp = (p: string) => {
  const d = mkdtempSync(path.join(tmpdir(), p));
  dirs.push(d);
  return d;
};
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const all = (db: ReturnType<typeof openRaw>, q: string): any[] => db.prepare(q).all() as any[];
const TABLES = ['assessment_sets', 'attempts', 'attempt_answers', 'attempt_sections', 'submissions', 'user_last_learned_state'];

describe('migrasi 0002 (SPEC-022 AC-14): pembangunan ulang tabel dengan data nyata', () => {
  it('data lama utuh, FK utuh, cadangan dibuat, assessment_type terisi dari set, indeks baru ada', () => {
    // 1) DB pada keadaan 0001
    const old = tmp('mig-old-');
    cpSync(REAL, old, { recursive: true });
    const journalPath = path.join(old, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.entries = journal.entries.slice(0, 2);
    writeFileSync(journalPath, JSON.stringify(journal));

    const dbDir = tmp('mig-db-');
    const file = path.join(dbDir, 'test.db');
    const db = openRaw(file);
    expect(runMigrations(db, old).applied).toEqual(['0000_baseline_sqlite', '0001_publish_blockers_view']);

    // 2) data nyata lintas tabel
    db.exec(`
      INSERT INTO users (id, display_name) VALUES ('u1', 'Budi');
      INSERT INTO tiers (id, tier_number, title, cefr_level, target_band_min, target_band_max, boss_gate_type, boss_gate_value) VALUES ('t1', 1, 'Tier 1', 'A2', 3, 4, 'PERCENT', 80);
      INSERT INTO modules (id, tier_id, module_code, skill_category, title, order_index) VALUES ('m1', 't1', '1.1', 'GRAMMAR', 'Modul', 1);
      INSERT INTO sub_modules (id, module_id, sub_module_code, title, order_index) VALUES ('s1', 'm1', '1.1.1', 'Sub', 1);
      INSERT INTO content_sources (id, code, name, license_type) VALUES ('src1', 'OWN', 'Own', 'OWN');
      INSERT INTO assessment_sets (id, assessment_type, title, sub_module_id, time_limit_seconds, origin, status, questions_json, question_count, version, content_hash)
        VALUES ('set1', 'ACTIVE_DRILL', 'Drill', 's1', 600, 'ORIGINAL_AUTHORED', 'PUBLISHED', '[{"question_id":"Q-1"}]', 1, 3, 'abc');
      INSERT INTO assessment_sets (id, assessment_type, title, tier_id, time_limit_seconds, origin, status) VALUES ('boss1', 'TIER_BOSS_EXAM', 'Boss', 't1', 600, 'ORIGINAL_AUTHORED', 'PUBLISHED');
      INSERT INTO assessment_sets (id, assessment_type, title, parent_set_id, skill_category, time_limit_seconds, origin) VALUES ('sec1', 'BOSS_SECTION', 'Boss R', 'boss1', 'READING', 600, 'ORIGINAL_AUTHORED');
      INSERT INTO attempts (id, user_id, assessment_set_id, assessment_version, mode, status, band_score, state) VALUES ('a1', 'u1', 'set1', 3, 'PRACTICE', 'GRADED', 6.5, '{"order":["Q-1"]}');
      INSERT INTO attempts (id, user_id, assessment_set_id, assessment_version, mode, status, state) VALUES ('a2', 'u1', 'boss1', 1, 'EXAM', 'IN_PROGRESS', '{}');
      INSERT INTO attempt_answers (id, attempt_id, assessment_set_id, question_id, question_type, skill, response, is_correct, score) VALUES ('ans1', 'a1', 'set1', 'Q-1', 'MCQ_SINGLE', 'GRAMMAR', '{"option_ids":["o1"]}', 1, 1);
      INSERT INTO attempt_sections (attempt_id, assessment_set_id, skill, raw_score, max_score, band_score, status) VALUES ('a2', 'sec1', 'READING', 5, 10, 5.5, 'IN_PROGRESS');
      INSERT INTO submissions (id, user_id, kind, attempt_id, question_id, prompt_snapshot, status) VALUES ('sub1', 'u1', 'WRITING_TASK1', 'a1', 'Q-1', 'Tulis surat', 'GRADED');
      INSERT INTO user_last_learned_state (user_id, active_attempt_id) VALUES ('u1', 'a2');
    `);
    const snapshot = () => Object.fromEntries(TABLES.map((t) => [t, all(db, `SELECT * FROM ${t} ORDER BY 1, 2`)]));
    const before = snapshot();
    const counts = Object.fromEntries(TABLES.map((t) => [t, before[t]!.length]));

    // 3) terapkan 0002 dengan migrator
    const report = runMigrations(db);
    expect(report.applied).toEqual(['0002_spec_022_question_banks']);
    expect(report.backups).toHaveLength(1);
    expect(path.basename(report.backups[0]!)).toMatch(/^pre-0002_spec_022_question_banks-\d+\.db$/);
    expect(existsSync(report.backups[0]!)).toBe(true);
    expect(report.backups[0]!.replaceAll('\\', '/')).toContain('/backups/');
    // cadangan berisi keadaan sebelum migrasi (tanpa kolom baru)
    const bk = openRaw(report.backups[0]!);
    expect(all(bk, `SELECT count(*) AS n FROM attempts`)[0].n).toBe(2);
    expect(all(bk, `PRAGMA table_info(attempts)`).some((c) => c.name === 'assessment_type')).toBe(false);
    bk.close();

    const after = snapshot();
    for (const t of TABLES) expect(after[t]).toHaveLength(counts[t]!);

    // kolom lama identik per tabel (kolom baru dikecualikan)
    const strip = (rows: any[], drop: string[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))));
    expect(strip(after.assessment_sets!, ['bank_code', 'bank_kind', 'exam_module', 'tags'])).toEqual(before.assessment_sets);
    expect(strip(after.attempts!, ['assessment_type'])).toEqual(before.attempts);
    expect(strip(after.attempt_sections!, ['id', 'time_limit_seconds', 'started_at', 'deadline_at', 'submitted_at'])).toEqual(before.attempt_sections);
    expect(after.attempt_answers).toEqual(before.attempt_answers);
    expect(after.submissions).toEqual(before.submissions);
    expect(after.user_last_learned_state).toEqual(before.user_last_learned_state);

    // backfill assessment_type = tipe set asal; id section terisi; default kolom baru
    expect(all(db, `SELECT a.id, a.assessment_type AS t, s.assessment_type AS st FROM attempts a JOIN assessment_sets s ON s.id = a.assessment_set_id ORDER BY a.id`)).toEqual([
      { id: 'a1', t: 'ACTIVE_DRILL', st: 'ACTIVE_DRILL' },
      { id: 'a2', t: 'TIER_BOSS_EXAM', st: 'TIER_BOSS_EXAM' },
    ]);
    expect(all(db, `SELECT id FROM attempt_sections`)[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(all(db, `SELECT exam_module, tags FROM assessment_sets WHERE id = 'set1'`)[0]).toEqual({ exam_module: 'GENERAL_TRAINING', tags: '[]' });

    // FK utuh, PRAGMA foreign_keys kembali ON, view dibuat ulang
    expect(all(db, 'PRAGMA foreign_key_check')).toEqual([]);
    expect(all(db, 'PRAGMA foreign_keys')[0].foreign_keys).toBe(1);
    expect(() => all(db, 'SELECT * FROM v_publish_blockers')).not.toThrow();
    expect(() => db.exec(`INSERT INTO attempt_answers (attempt_id, assessment_set_id, question_id, question_type) VALUES ('a1', 'tidak-ada', 'Q-9', 'MCQ_SINGLE')`)).toThrow(/FOREIGN KEY/);
    // anak tidak ikut terhapus oleh CASCADE: hapus attempt a2 menghapus section-nya (cascade sah), bukan sebaliknya
    expect(all(db, `SELECT count(*) AS n FROM user_last_learned_state WHERE active_attempt_id = 'a2'`)[0].n).toBe(1);

    // indeks baru
    const idx = new Set(all(db, `SELECT name FROM sqlite_master WHERE type = 'index'`).map((r) => r.name));
    for (const n of [
      'assessment_sets_bank_code_uq', 'assessment_sets_bank_idx', 'assessment_sets_sub_idx', 'assessment_sets_module_idx', 'assessment_sets_tier_idx', 'assessment_sets_parent_idx',
      'attempts_user_started_idx', 'attempts_user_set_idx', 'attempts_one_active_uq', 'attempts_one_active_mix_uq', 'attempts_one_active_mock_uq', 'attempts_one_active_checkpoint_uq',
      'attempt_sections_set_uq', 'attempt_sections_skill_uq', 'attempt_answers_uq',
    ]) expect(idx.has(n), n).toBe(true);

    // perilaku baru: attempt tanpa set hanya untuk tipe state-only; satu IN_PROGRESS per tipe; CHECK scope bank
    db.exec(`INSERT INTO attempts (user_id, assessment_type, assessment_version, state) VALUES ('u1', 'MIX_PRACTICE', 0, '{}')`);
    expect(() => db.exec(`INSERT INTO attempts (user_id, assessment_type, assessment_version, state) VALUES ('u1', 'MIX_PRACTICE', 0, '{}')`)).toThrow(/UNIQUE/);
    expect(() => db.exec(`INSERT INTO attempts (user_id, assessment_type, assessment_version, state) VALUES ('u1', 'ACTIVE_DRILL', 0, '{}')`)).toThrow(/CHECK/);
    db.exec(`INSERT INTO assessment_sets (assessment_type, title, bank_code, bank_kind, time_limit_seconds, origin) VALUES ('QUESTION_BANK', 'Bank', 'GT-X-1', 'GRAMMAR_GT_REGISTER', 0, 'ORIGINAL_AUTHORED')`);
    expect(() => db.exec(`INSERT INTO assessment_sets (assessment_type, title, time_limit_seconds, origin) VALUES ('QUESTION_BANK', 'Tanpa kode', 0, 'ORIGINAL_AUTHORED')`)).toThrow(/CHECK/);
    expect(() => db.exec(`INSERT INTO assessment_sets (assessment_type, title, bank_code, bank_kind, time_limit_seconds, origin) VALUES ('QUESTION_BANK', 'Ganda', 'GT-X-1', 'GRAMMAR_GT_REGISTER', 0, 'ORIGINAL_AUTHORED')`)).toThrow(/UNIQUE/);
    // section tanpa set: unik per (attempt, skill)
    db.exec(`INSERT INTO attempt_sections (attempt_id, assessment_set_id, skill) VALUES ('a2', NULL, 'SPEAKING')`);
    expect(() => db.exec(`INSERT INTO attempt_sections (attempt_id, assessment_set_id, skill) VALUES ('a2', NULL, 'SPEAKING')`)).toThrow(/UNIQUE/);
    db.close();
  });

  it('foreign_key_check gagal -> ROLLBACK, migrasi tidak tercatat, foreign_keys dipulihkan ON', () => {
    const d = tmp('mig-bad-');
    mkdirSync(path.join(d, 'meta'));
    writeFileSync(path.join(d, '0000_a.sql'), 'CREATE TABLE p (id TEXT PRIMARY KEY);--> statement-breakpoint\nCREATE TABLE c (id TEXT PRIMARY KEY, p TEXT REFERENCES p(id));');
    writeFileSync(path.join(d, '0001_b.sql'), `-- migrator: foreign_keys=off\nINSERT INTO c (id, p) VALUES ('1', 'yatim');`);
    writeFileSync(path.join(d, 'meta', '_journal.json'), JSON.stringify({ entries: [{ idx: 0, tag: '0000_a', when: 1 }, { idx: 1, tag: '0001_b', when: 2 }] }));
    const db = openRaw(path.join(tmp('mig-bad-db-'), 'x.db'));
    expect(() => runMigrations(db, d)).toThrow(/foreign_key_check/);
    expect(all(db, 'SELECT tag FROM _migrations').map((r) => r.tag)).toEqual(['0000_a']);
    expect(all(db, 'SELECT count(*) AS n FROM c')[0].n).toBe(0);
    expect(all(db, 'PRAGMA foreign_keys')[0].foreign_keys).toBe(1);
    db.close();
  });

  it('QA L-4: DB berisi tabel aplikasi tetapi _migrations kosong (pemulihan manual) tetap dicadangkan', () => {
    const old = tmp('mig-old2-');
    cpSync(REAL, old, { recursive: true });
    const jp = path.join(old, 'meta', '_journal.json');
    const j = JSON.parse(readFileSync(jp, 'utf8'));
    j.entries = j.entries.slice(0, 2);
    writeFileSync(jp, JSON.stringify(j));
    const file = path.join(tmp('mig-db2-'), 'restored.db');
    const db = openRaw(file);
    runMigrations(db, old);
    db.exec(`INSERT INTO users (id, display_name) VALUES ('u1', 'Budi'); DELETE FROM _migrations;`); // _migrations kosong, data ada
    // migrasi dijalankan ulang dari awal terhadap tabel yang sudah ada gagal, tetapi cadangan HARUS tetap dibuat dulu
    // untuk berkas bertanda destruktif; pakai folder yang hanya berisi 0002 agar tidak bentrok dengan 0000.
    const only = tmp('mig-only-');
    cpSync(REAL, only, { recursive: true });
    const jp2 = path.join(only, 'meta', '_journal.json');
    const j2 = JSON.parse(readFileSync(jp2, 'utf8'));
    j2.entries = j2.entries.slice(2);
    writeFileSync(jp2, JSON.stringify(j2));
    const r = runMigrations(db, only);
    expect(r.applied).toEqual(['0002_spec_022_question_banks']);
    expect(r.backups).toHaveLength(1);
    db.close();
  });

  it('QA L-5: bila ROLLBACK ikut gagal, galat asal tetap terbawa pada pesan', () => {
    const d = tmp('mig-rb-');
    mkdirSync(path.join(d, 'meta'));
    // COMMIT eksplisit di dalam berkas menutup transaksi: ROLLBACK berikutnya gagal ("no transaction is active")
    writeFileSync(path.join(d, '0000_a.sql'), `COMMIT;--> statement-breakpoint\nSELECT * FROM tabel_tidak_ada;`);
    writeFileSync(path.join(d, 'meta', '_journal.json'), JSON.stringify({ entries: [{ idx: 0, tag: '0000_a', when: 1 }] }));
    const db = openRaw(path.join(tmp('mig-rb-db-'), 'x.db'));
    let msg = '';
    try {
      runMigrations(db, d);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('tabel_tidak_ada'); // galat asal
    expect(msg).toContain('ROLLBACK juga gagal');
    db.close();
  });

  it('instalasi baru (tanpa migrasi sebelumnya) tidak membuat cadangan pra-migrasi', () => {
    const dbDir = tmp('mig-fresh-');
    const db = openRaw(path.join(dbDir, 'fresh.db'));
    const r = runMigrations(db);
    expect(r.applied).toContain('0002_spec_022_question_banks');
    expect(r.backups).toEqual([]);
    expect(existsSync(path.join(dbDir, 'backups')) ? readdirSync(path.join(dbDir, 'backups')) : []).toEqual([]);
    db.close();
  });
});
