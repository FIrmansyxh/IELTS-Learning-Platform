import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function run(files: Record<string, unknown>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bankcli-'));
  dirs.push(dir);
  for (const [n, v] of Object.entries(files)) writeFileSync(path.join(dir, n), JSON.stringify(v));
  const r = spawnSync('npx', ['tsx', 'scripts/bank-validate.ts', '--dir', dir], { encoding: 'utf8', shell: true, env: { ...process.env } });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
}

const mcq = (id: string, over: Record<string, unknown> = {}) => ({
  question_id: id, question_type: 'MCQ_SINGLE', skill: 'GRAMMAR', prompt: 'Pilih salam yang tepat.',
  options: ['Dear Sir or Madam,', 'Hey,'], correct_answers: ['Dear Sir or Madam,'], explanation_id: 'Formal.', difficulty: 1, ...over,
});
const bank = (over: Record<string, unknown>) => ({
  bank_code: 'GT-CLI-1', bank_kind: 'GRAMMAR_GT_REGISTER', title: 'Uji', skill: 'GRAMMAR', exam_module: 'GENERAL_TRAINING', origin: 'ORIGINAL_AUTHORED', questions: [mcq('Q-CLI-001')], ...over,
});
const pkg = (...banks: unknown[]) => ({ bank_contract_version: '1.0', banks });
const lq = (id: string) => mcq(id, { skill: 'LISTENING' });
const lbank = (over: Record<string, unknown>) => bank({ bank_code: 'GT-L-1', bank_kind: 'LISTENING_GT_S1', skill: 'LISTENING', questions: [lq('Q-CLL-001')], ...over });

describe('berkas .json tanpa bank_contract_version (QA M-3)', () => {
  it('salah ketik kunci dilaporkan, bukan dilewati diam-diam (bank:validate exit 1)', () => {
    const typo = { bank_contract_versoin: '1.0', banks: [bank({})] };
    const only = run({ 'typo.json': typo });
    expect(only.code).toBe(1);
    expect(only.out).toContain('bank_contract_version_missing');
    expect(only.out).toContain('typo.json');
    // bank yang benar + berkas salah-ketik: sisanya tidak boleh membuat hasil "OK"
    const mixed = run({ 'ok.json': pkg(bank({})), 'typo.json': typo });
    expect(mixed.code).toBe(1);
    expect(mixed.out).toContain('bank_contract_version_missing');
  });

  it('content:validate dan content:import pada folder yang sama juga gagal (exit non-0), tanpa menulis apa pun', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bankcli-typo-'));
    dirs.push(dir);
    writeFileSync(path.join(dir, 'typo.json'), JSON.stringify({ bank_contract_versoin: '1.0', banks: [bank({})] }));
    const v = spawnSync('npx', ['tsx', 'scripts/content-import.ts', 'validate', '--dir', dir], { encoding: 'utf8', shell: true });
    expect(v.status).toBe(1);
    expect(`${v.stdout}${v.stderr}`).toContain('bank_contract_version_missing');
    const i = spawnSync('npx', ['tsx', 'scripts/content-import.ts', 'import', '--dir', dir, '--dry-run'], { encoding: 'utf8', shell: true });
    expect(i.status).toBe(1);
    expect(`${i.stdout}${i.stderr}`).toContain('bank_contract_version_missing');
  });
});

describe('npm run bank:validate (AC-1, AC-11)', () => {
  it('bank awal repo: exit 0 tanpa galat', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/bank-validate.ts', '--dir', 'content/gt-bank'], { encoding: 'utf8', shell: true });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('0 galat');
  });

  it('AC-1: fixture rusak -> exit non-0 dengan duplicate_question_id, answer_not_in_options, passage_without_text, id_reads_as_variant_slot', () => {
    const r = run({
      'bad.json': pkg(
        bank({
          questions: [
            mcq('Q-CLI-001'),
            mcq('Q-CLI-001'), // (a) ID ganda
            mcq('Q-CLI-002', { correct_answers: ['Yo,'] }), // (b) jawaban di luar opsi
            mcq('Q-CLI-003', { passage_no: 1 }), // (c) passage_no pada bank tanpa teks
            mcq('Q-CLI-P1-004'), // (d) terbaca sebagai slot variasi
          ],
        }),
      ),
    });
    expect(r.code).toBe(1);
    for (const c of ['duplicate_question_id', 'answer_not_in_options', 'passage_without_text', 'id_reads_as_variant_slot']) expect(r.out, c).toContain(c);
    // urutan kemunculan sesuai urutan soal
    const order = ['duplicate_question_id', 'answer_not_in_options', 'passage_without_text', 'id_reads_as_variant_slot'].map((c) => r.out.indexOf(c));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('AC-11: Listening tanpa field -> listening_asset_required; kode tak terdaftar -> listening_asset_unregistered; non-Listening ber-pending_audio -> listening_field_not_allowed; pending_audio valid -> exit 0', () => {
    expect(run({ 'a.json': pkg(lbank({})) }).out).toContain('listening_asset_required');
    expect(run({ 'a.json': pkg(lbank({ pending_audio: true, listening_asset_code: 'audio/ada' })) }).out).toContain('listening_asset_required'); // keduanya
    const unreg = run({ 'a.json': pkg(lbank({ listening_asset_code: 'audio/tidak-ada' })) });
    expect(unreg.code).toBe(1);
    expect(unreg.out).toContain('listening_asset_unregistered');
    const notAllowed = run({ 'a.json': pkg(bank({ pending_audio: true })) });
    expect(notAllowed.code).toBe(1);
    expect(notAllowed.out).toContain('listening_field_not_allowed');
    const ok = run({ 'a.json': pkg(lbank({ pending_audio: true })) });
    expect(ok.code, ok.out).toBe(0);
  });
});
