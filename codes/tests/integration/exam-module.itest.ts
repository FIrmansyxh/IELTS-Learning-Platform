import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { execute, closeDb, getDb } from '@/server/db';
import { resetRateLimits } from '@/server/http/rate-limit';
import { GET as treeGet } from '@/app/api/v1/curriculum/tree/route';
import { GET as detailGet } from '@/app/api/v1/sub-modules/[sub_module]/route';
import { SUB_MODULE_SEEDS } from '@/server/content/curriculum-structure';
import { call, learnerSession } from './helpers';
import { publishSub, resetLearning, seedMaterial } from './learning-fixtures';

const db = getDb();
/* eslint-disable @typescript-eslint/no-explicit-any */
afterAll(async () => {
  await resetLearning();
  await closeDb();
});
beforeEach(async () => {
  resetRateLimits();
  await resetLearning();
});
afterEach(() => {
  delete process.env.EXAM_MODULE;
});

const codesInTree = async (cookie: string): Promise<string[]> => {
  const r = await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie });
  expect(r.status).toBe(200);
  return r.json.data.tiers.flatMap((t: any) => t.modules.flatMap((m: any) => m.sub_modules.map((s: any) => s.sub_module_code as string)));
};
const publishAll = async () => {
  const rows = (await execute(db, sql`SELECT sub_module_code AS c FROM sub_modules`)).rows as Array<{ c: string }>;
  await publishSub(...rows.map((r) => r.c));
};

describe('tag exam_module (ADR-004)', () => {
  it('seed: 40 sub-modul; hanya 3.3.1 dan 4.1.1 bertag ACADEMIC; 3.3.3 dan 4.1.3 bertag GENERAL_TRAINING', async () => {
    expect(SUB_MODULE_SEEDS).toHaveLength(40);
    const rows = (await execute(db, sql`SELECT sub_module_code AS c, exam_module AS e FROM sub_modules`)).rows as Array<{ c: string; e: string }>;
    const seeded = new Map(SUB_MODULE_SEEDS.map((s) => [s.code, s.exam ?? 'COMMON']));
    const mine = rows.filter((r) => seeded.has(r.c));
    expect(mine).toHaveLength(40);
    for (const r of mine) expect(r.e, r.c).toBe(seeded.get(r.c));
    const by = (tag: string) => mine.filter((r) => r.e === tag).map((r) => r.c).sort();
    expect(by('ACADEMIC')).toEqual(['3.3.1', '4.1.1']);
    expect(by('GENERAL_TRAINING')).toEqual(['3.3.3', '4.1.3']);
    expect(by('COMMON')).toHaveLength(36);
  });

  it('default (General Training): learner tidak melihat sub-modul Academic, tetapi melihat penggantinya', async () => {
    await publishAll();
    const u = await learnerSession();
    const codes = await codesInTree(u.cookie);
    expect(codes).toContain('3.3.2');
    expect(codes).toContain('3.3.3');
    expect(codes).toContain('4.1.3');
    expect(codes).not.toContain('3.3.1');
    expect(codes).not.toContain('4.1.1');
  });

  it('EXAM_MODULE=ACADEMIC membalik tampilan', async () => {
    process.env.EXAM_MODULE = 'ACADEMIC';
    await publishAll();
    const u = await learnerSession();
    const codes = await codesInTree(u.cookie);
    expect(codes).toContain('3.3.1');
    expect(codes).toContain('4.1.1');
    expect(codes).not.toContain('3.3.3');
    expect(codes).not.toContain('4.1.3');
  });

  it('sub-modul tersaring tidak dapat dibuka lewat URL langsung (404)', async () => {
    await seedMaterial('3.3.1');
    await seedMaterial('3.3.3');
    await publishAll();
    const u = await learnerSession();
    const hidden = await call(detailGet, 'GET', '/api/v1/sub-modules/3.3.1', { cookie: u.cookie, params: { sub_module: '3.3.1' } });
    expect(hidden.status).toBe(404);
  });

  it('sub-modul tersaring tidak menahan urutan: 3.3.2 bukan terkunci oleh 3.3.1 yang tersembunyi', async () => {
    await publishAll();
    const u = await learnerSession();
    const r = await call(treeGet, 'GET', '/api/v1/curriculum/tree', { cookie: u.cookie });
    const mod33 = r.json.data.tiers.flatMap((t: any) => t.modules).find((m: any) => m.module_code === '3.3');
    expect(mod33.sub_modules.map((s: any) => s.sub_module_code)).toEqual(['3.3.2', '3.3.3']);
  });
});
