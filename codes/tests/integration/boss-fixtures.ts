/** Fabrik Boss ringkas (hanya Listening + Reading) untuk itest lintas spec (016/017): bukan pengganti boss.itest.ts. */
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { assessmentSets, tiers } from '@/db/schema';
import { setClockForTest } from '@/server/clock';
import { getDb } from '@/server/db';
import { applyDrillResult, recomputeStatuses } from '@/server/gatekeeping/service';
import { POST as startRoute } from '@/app/api/v1/attempts/route';
import { PUT as putRoute } from '@/app/api/v1/attempts/[attempt_id]/answers/[question_id]/route';
import { POST as secStartRoute } from '@/app/api/v1/attempts/[attempt_id]/sections/[section_set_id]/start/route';
import { POST as secSubmitRoute } from '@/app/api/v1/attempts/[attempt_id]/sections/[section_set_id]/submit/route';
import { call, type Res } from './helpers';
import { addFileAsset, publishSub } from './learning-fixtures';
import { Q } from '../fixtures/content/builders';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = getDb();
type U = { cookie: string | null; user: { id: string } };

export async function makeBoss(over: { L?: number[]; R?: number[] } = {}) {
  const [t] = await db.select().from(tiers).where(eq(tiers.tierNumber, 1));
  const { asset } = await addFileAsset({ kind: 'AUDIO_LISTENING', mime: 'audio/mpeg', ext: 'mp3', data: Buffer.concat([Buffer.alloc(4088, 7), randomBytes(8)]) });
  await db.execute(sql`UPDATE assessment_sets SET status = 'ARCHIVED' WHERE assessment_type = 'TIER_BOSS_EXAM' AND tier_id = ${t!.id}::uuid AND status = 'PUBLISHED'`);
  const [parent] = await db
    .insert(assessmentSets)
    .values({ assessmentType: 'TIER_BOSS_EXAM', title: 'Boss Tier 1', tierId: t!.id, timeLimitSeconds: 600, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED' })
    .returning();
  const kid = async (skill: 'LISTENING' | 'READING', qs: unknown[], extra: Partial<typeof assessmentSets.$inferInsert>) =>
    (
      await db
        .insert(assessmentSets)
        .values({ assessmentType: 'BOSS_SECTION', title: `${skill} T1`, parentSetId: parent!.id, skillCategory: skill, timeLimitSeconds: 900, questionsJson: qs as object[], questionCount: qs.length, origin: 'ORIGINAL_AUTHORED', status: 'PUBLISHED', ...extra })
        .returning()
    )[0]!;
  const mk = (prefix: string, skill: string, pts: number[]) =>
    pts.map((p, i) => Q.mcq({ question_id: `Q-${prefix}${i + 1}`, skill, prompt: `Q-${prefix}${i + 1}`, options: [`right-Q-${prefix}${i + 1}`, 'x', 'y', 'z'], correct_answers: [`right-Q-${prefix}${i + 1}`], explanation_id: 'p', points: p }));
  const L = await kid('LISTENING', mk('L', 'LISTENING', over.L ?? [10, 10, 10, 10]), { listeningAssetId: asset.id });
  const R = await kid('READING', mk('R', 'READING', over.R ?? [10, 10, 10, 10]), { readingPassageMarkdown: '# Passage' });
  return { parent: parent!, L, R };
}

/** Tier 1 siap: sub-modul 1.1.1 selesai (modul Tier 1 yang tersedia semuanya COMPLETED). */
export async function readyTier1(userId: string) {
  await publishSub('1.1.1', '2.1.1');
  await recomputeStatuses(db, userId);
  const sid = ((await db.execute(sql`SELECT id FROM sub_modules WHERE sub_module_code = '1.1.1'`)).rows[0] as any).id as string;
  await db.transaction((tx) => applyDrillResult(tx, userId, { subModuleId: sid, scorePercent: 100 }));
}

const optionOf = (q: any, text: string) => q.options.find((o: any) => o.text === text).option_id as string;

/** Mainkan seluruh Boss; `clock` opsional dimajukan 2 dtk per jawaban. `pickRight(qid)` menentukan benar/salah. Mengembalikan id attempt. */
export async function playBoss(u: U, b: Awaited<ReturnType<typeof makeBoss>>, pickRight: (qid: string) => boolean = () => true, clock?: { now: number }): Promise<string> {
  const a = await call(startRoute, 'POST', '/api/v1/attempts', { cookie: u.cookie, body: { assessment_set_id: b.parent.id } });
  expect(a.status, JSON.stringify(a.json)).toBe(201);
  const id = a.json.data.id as string;
  for (const sec of [b.L, b.R]) {
    const s: Res = await call(secStartRoute, 'POST', `/api/v1/attempts/${id}/sections/${sec.id}/start`, { cookie: u.cookie, params: { attempt_id: id, section_set_id: sec.id } });
    expect(s.status, JSON.stringify(s.json)).toBe(200);
    for (const q of s.json.data.questions) {
      if (clock) {
        clock.now += 2000;
        setClockForTest(() => clock.now);
      }
      const r = await call(putRoute, 'PUT', `/api/v1/attempts/${id}/answers/${q.question_id}`, {
        cookie: u.cookie,
        params: { attempt_id: id, question_id: q.question_id },
        body: { response: { option_ids: [optionOf(q, pickRight(q.question_id) ? `right-${q.question_id}` : 'x')] } },
      });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
    }
    const done = await call(secSubmitRoute, 'POST', `/api/v1/attempts/${id}/sections/${sec.id}/submit`, { cookie: u.cookie, params: { attempt_id: id, section_set_id: sec.id } });
    expect(done.status, JSON.stringify(done.json)).toBe(200);
  }
  return id;
}
