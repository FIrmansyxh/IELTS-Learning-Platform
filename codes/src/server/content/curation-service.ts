import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { DbOrTx, Tx } from '../db';
import {
  assessmentSets,
  attemptAnswers,
  attempts,
  contentRevisions,
  learningMaterials,
  modules,
  subModules,
  tiers,
  users,
} from '@/db/schema';
import { ApiError } from '../http/errors';
import { writeAudit } from '../audit';
import { computeBlockers, PublishService, type PublishEntityType, type ReviewStatusName } from './publish';
import { parsePassages } from './passages';
import type {
  AssessmentSetsQuery,
  ChangeStatusRequest,
  ContentRevisionsQuery,
  UpdateAssessmentSetRequest,
  UpdateMaterialRequest,
  UpdateModuleRequest,
  UpdateQuestionRequest,
  UpdateSubModuleRequest,
} from '@/contracts/curation';

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

export function canonicalJson(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x !== null && typeof x === 'object') {
      return Object.fromEntries(
        Object.entries(x as Record<string, unknown>)
          .filter(([, val]) => val !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, norm(val)]),
      );
    }
    return x;
  };
  return JSON.stringify(norm(v));
}

function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '').replace(/`[^`\n]*`/g, '');
}

export function validateMarkdownArticle(md: string): void {
  const body = stripCode(md);
  if (/<[A-Za-z/!]/.test(body)) {
    throw new ApiError('VALIDATION_ERROR', {
      status: 400,
      message: 'HTML mentah tidak diizinkan di luar blok kode.',
      details: [{ path: 'article_markdown', code: 'raw_html_not_allowed', message: 'HTML mentah tidak diizinkan.' }],
    });
  }
  if (/\]\(\s*(javascript|data|vbscript):/i.test(body) || /^\s*\[[^\]]+\]:\s*(javascript|data|vbscript):/im.test(body)) {
    throw new ApiError('VALIDATION_ERROR', {
      status: 400,
      message: 'Skema tautan tidak aman.',
      details: [{ path: 'article_markdown', code: 'unsafe_link', message: 'Tautan tidak aman tidak diizinkan.' }],
    });
  }
}

/** Pohon kurikulum lengkap untuk Admin (/admin/curriculum). */
export async function getCurriculumTree(tx: DbOrTx) {
  const tierRows = await tx.select().from(tiers).orderBy(asc(tiers.tierNumber));
  const moduleRows = await tx.select().from(modules).where(sql`${modules.status} <> 'ARCHIVED'`).orderBy(asc(modules.orderIndex));
  const subRows = await tx.select().from(subModules).where(sql`${subModules.status} <> 'ARCHIVED'`).orderBy(asc(subModules.orderIndex));
  const setRows = await tx.select().from(assessmentSets);
  const materialRows = await tx
    .select({
      subModuleId: learningMaterials.subModuleId,
      origin: learningMaterials.origin,
    })
    .from(learningMaterials);

  const materialsWithContent = new Set(materialRows.map((m) => m.subModuleId));
  const materialOriginMap = new Map(materialRows.map((m) => [m.subModuleId, m.origin]));

  const resultTiers = [];

  for (const t of tierRows) {
    const tModules = moduleRows.filter((m) => m.tierId === t.id);
    const skipSet = setRows.find((s) => s.tierId === t.id && s.assessmentType === 'SKIP_TIER_TEST');
    const bossSet = setRows.find((s) => s.tierId === t.id && s.assessmentType === 'TIER_BOSS_EXAM');

    // Section skills for boss
    let sectionSkills: string[] = [];
    if (bossSet) {
      const children = setRows.filter((s) => s.parentSetId === bossSet.id && s.skillCategory !== null);
      sectionSkills = children.map((c) => c.skillCategory!);
    }

    const modulesOut = [];
    for (const m of tModules) {
      const mSubs = subRows.filter((s) => s.moduleId === m.id);
      const modSkip = setRows.find((s) => s.moduleId === m.id && s.assessmentType === 'SKIP_MODULE_TEST');

      const subsOut = [];
      for (const sm of mSubs) {
        const drill = setRows.find((s) => s.subModuleId === sm.id && s.assessmentType === 'ACTIVE_DRILL');
        let blockerCount = 0;
        try {
          const blockers = await computeBlockers(tx as Tx, 'SUB_MODULE', sm.id);
          blockerCount = blockers.length;
        } catch {
          blockerCount = 0;
        }

        subsOut.push({
          id: sm.id,
          sub_module_code: sm.subModuleCode,
          title: sm.title,
          order_index: sm.orderIndex,
          status: sm.status,
          passing_score_percent: sm.passingScorePercent,
          content_version: sm.contentVersion,
          origin: materialOriginMap.get(sm.id) ?? 'ORIGINAL_AUTHORED',
          has_material: materialsWithContent.has(sm.id),
          drill: drill
            ? {
                id: drill.id,
                status: drill.status,
                question_count: drill.questionCount,
                version: drill.version,
              }
            : null,
          blocker_count: blockerCount,
        });
      }

      modulesOut.push({
        id: m.id,
        module_code: m.moduleCode,
        title: m.title,
        order_index: m.orderIndex,
        status: m.status,
        skip_set: modSkip
          ? {
              id: modSkip.id,
              status: modSkip.status,
              question_count: modSkip.questionCount,
              version: modSkip.version,
            }
          : null,
        sub_modules: subsOut,
      });
    }

    resultTiers.push({
      tier_number: t.tierNumber,
      title: t.title,
      skip_set: skipSet
        ? {
            id: skipSet.id,
            status: skipSet.status,
            question_count: skipSet.questionCount,
            version: skipSet.version,
          }
        : null,
      boss: bossSet
        ? {
            id: bossSet.id,
            status: bossSet.status,
            section_skills: sectionSkills,
            version: bossSet.version,
          }
        : null,
      modules: modulesOut,
    });
  }

  const placementSet = setRows.find((s) => s.assessmentType === 'PLACEMENT_TEST');

  return {
    tiers: resultTiers,
    placement: placementSet
      ? {
          id: placementSet.id,
          status: placementSet.status,
          question_count: placementSet.questionCount,
          version: placementSet.version,
        }
      : null,
  };
}

/** Detail sub-modul untuk kurasi (/admin/sub-modules/{id}). */
export async function getSubModuleDetail(tx: DbOrTx, subModuleId: string) {
  const [sub] = await tx
    .select({
      id: subModules.id,
      subModuleCode: subModules.subModuleCode,
      title: subModules.title,
      orderIndex: subModules.orderIndex,
      status: subModules.status,
      passingScorePercent: subModules.passingScorePercent,
      contentVersion: subModules.contentVersion,
      moduleId: subModules.moduleId,
    })
    .from(subModules)
    .where(eq(subModules.id, subModuleId))
    .limit(1);

  if (!sub) throw new ApiError('NOT_FOUND');

  const [mod] = await tx
    .select({
      id: modules.id,
      moduleCode: modules.moduleCode,
      title: modules.title,
    })
    .from(modules)
    .where(eq(modules.id, sub.moduleId))
    .limit(1);

  const [lm] = await tx
    .select()
    .from(learningMaterials)
    .where(eq(learningMaterials.subModuleId, subModuleId))
    .limit(1);

  const [drill] = await tx
    .select({
      id: assessmentSets.id,
      status: assessmentSets.status,
      questionCount: assessmentSets.questionCount,
      version: assessmentSets.version,
    })
    .from(assessmentSets)
    .where(
      and(
        eq(assessmentSets.subModuleId, subModuleId),
        eq(assessmentSets.assessmentType, 'ACTIVE_DRILL'),
      ),
    )
    .limit(1);

  const blockers = await computeBlockers(tx as Tx, 'SUB_MODULE', subModuleId);

  return {
    sub_module: {
      id: sub.id,
      sub_module_code: sub.subModuleCode,
      title: sub.title,
      order_index: sub.orderIndex,
      status: sub.status,
      passing_score_percent: sub.passingScorePercent,
      content_version: sub.contentVersion,
      module: mod
        ? {
            id: mod.id,
            module_code: mod.moduleCode,
            title: mod.title,
          }
        : null,
    },
    material: lm
      ? {
          article_markdown: lm.articleMarkdown,
          origin: lm.origin,
          attribution_text: lm.attributionText,
          content_version: lm.contentVersion,
          videos: lm.videosJson ?? [],
          slides: lm.slidesJson ?? [],
          attachments: lm.attachmentsJson ?? [],
          mini_task: lm.miniTaskJson ?? null,
        }
      : null,
    drill: drill
      ? {
          id: drill.id,
          status: drill.status,
          question_count: drill.questionCount,
          version: drill.version,
        }
      : null,
    blockers,
  };
}

/** Sunting Modul (PATCH /admin/modules/{id}). */
export async function updateModule(
  tx: Tx,
  moduleId: string,
  body: UpdateModuleRequest,
  adminUserId: string,
) {
  const [mod] = await tx.select().from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!mod) throw new ApiError('NOT_FOUND');

  if (body.order_index !== undefined && body.order_index !== mod.orderIndex) {
    const [conflict] = await tx
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.tierId, mod.tierId), eq(modules.orderIndex, body.order_index)))
      .limit(1);
    if (conflict) {
      throw new ApiError('ORDER_INDEX_TAKEN', {
        status: 409,
        message: 'Nomor urut modul sudah digunakan pada tier ini.',
      });
    }
  }

  const now = new Date();
  const updateData: Partial<typeof modules.$inferInsert> = { updatedAt: now };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.order_index !== undefined) updateData.orderIndex = body.order_index;

  await tx.update(modules).set(updateData).where(eq(modules.id, moduleId));

  await writeAudit(tx, {
    actorUserId: adminUserId,
    action: 'CONTENT_EDITED',
    entityType: 'module',
    entityId: moduleId,
    metadata: { fields: Object.keys(body) },
  });

  const [updated] = await tx.select().from(modules).where(eq(modules.id, moduleId)).limit(1);

  return {
    id: updated!.id,
    module_code: updated!.moduleCode,
    title: updated!.title,
    order_index: updated!.orderIndex,
    status: updated!.status,
  };
}

/** Sunting Sub-Modul (PATCH /admin/sub-modules/{id}). */
export async function updateSubModule(
  tx: Tx,
  subModuleId: string,
  body: UpdateSubModuleRequest,
  adminUserId: string,
) {
  const [sub] = await tx.select().from(subModules).where(eq(subModules.id, subModuleId)).limit(1);
  if (!sub) throw new ApiError('NOT_FOUND');

  if (body.order_index !== undefined && body.order_index !== sub.orderIndex) {
    const [conflict] = await tx
      .select({ id: subModules.id })
      .from(subModules)
      .where(and(eq(subModules.moduleId, sub.moduleId), eq(subModules.orderIndex, body.order_index)))
      .limit(1);
    if (conflict) {
      throw new ApiError('ORDER_INDEX_TAKEN', {
        status: 409,
        message: 'Nomor urut sub-modul sudah digunakan pada modul ini.',
      });
    }
  }

  const now = new Date();
  const contentChanged =
    (body.title !== undefined && body.title !== sub.title) ||
    (body.passing_score_percent !== undefined &&
      body.passing_score_percent !== sub.passingScorePercent);

  let nextVersion = sub.contentVersion;
  if (contentChanged) {
    // K4: Tulis snapshot sebelum perubahan
    await tx.insert(contentRevisions).values({
      entityType: 'SUB_MODULE',
      entityId: subModuleId,
      version: sub.contentVersion,
      snapshot: {
        title: sub.title,
        order_index: sub.orderIndex,
        passing_score_percent: sub.passingScorePercent,
        content_version: sub.contentVersion,
      },
      changedBy: adminUserId,
      createdAt: now,
    });
    nextVersion = sub.contentVersion + 1;
  }

  const updateData: Partial<typeof subModules.$inferInsert> = {
    updatedAt: now,
    contentVersion: nextVersion,
  };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.order_index !== undefined) updateData.orderIndex = body.order_index;
  if (body.passing_score_percent !== undefined) {
    updateData.passingScorePercent = body.passing_score_percent;
  }

  await tx.update(subModules).set(updateData).where(eq(subModules.id, subModuleId));

  await writeAudit(tx, {
    actorUserId: adminUserId,
    action: 'CONTENT_EDITED',
    entityType: 'sub_module',
    entityId: subModuleId,
    metadata: { fields: Object.keys(body) },
  });

  const [updated] = await tx
    .select()
    .from(subModules)
    .where(eq(subModules.id, subModuleId))
    .limit(1);

  return {
    id: updated!.id,
    sub_module_code: updated!.subModuleCode,
    title: updated!.title,
    order_index: updated!.orderIndex,
    passing_score_percent: updated!.passingScorePercent,
    status: updated!.status,
    content_version: updated!.contentVersion,
  };
}

/** Sunting Materi Sub-Modul (PATCH /admin/sub-modules/{id}/material). */
export async function updateMaterial(
  tx: Tx,
  subModuleId: string,
  body: UpdateMaterialRequest,
  adminUserId: string,
) {
  const [sub] = await tx.select().from(subModules).where(eq(subModules.id, subModuleId)).limit(1);
  if (!sub) throw new ApiError('NOT_FOUND');

  const [lm] = await tx
    .select()
    .from(learningMaterials)
    .where(eq(learningMaterials.subModuleId, subModuleId))
    .limit(1);

  if (!lm) throw new ApiError('NOT_FOUND');

  if (body.article_markdown !== undefined) {
    validateMarkdownArticle(body.article_markdown);
  }

  const now = new Date();
  const nextMaterialVersion = lm.contentVersion + 1;
  const nextSubVersion = sub.contentVersion + 1;

  // K4: Tulis snapshot materi sebelum perubahan
  await tx.insert(contentRevisions).values({
    entityType: 'LEARNING_MATERIAL',
    entityId: lm.id,
    version: lm.contentVersion,
    snapshot: {
      article_markdown: lm.articleMarkdown,
      attribution_text: lm.attributionText,
      mini_task: lm.miniTaskJson,
      content_version: lm.contentVersion,
    },
    changedBy: adminUserId,
    createdAt: now,
  });

  const updateData: Partial<typeof learningMaterials.$inferInsert> = {
    updatedAt: now,
    contentVersion: nextMaterialVersion,
  };
  if (body.article_markdown !== undefined) updateData.articleMarkdown = body.article_markdown;
  if (body.attribution_text !== undefined) updateData.attributionText = body.attribution_text;
  if (body.mini_task !== undefined) updateData.miniTaskJson = body.mini_task;

  await tx.update(learningMaterials).set(updateData).where(eq(learningMaterials.id, lm.id));
  await tx
    .update(subModules)
    .set({ contentVersion: nextSubVersion, updatedAt: now })
    .where(eq(subModules.id, subModuleId));

  await writeAudit(tx, {
    actorUserId: adminUserId,
    action: 'CONTENT_EDITED',
    entityType: 'learning_material',
    entityId: lm.id,
    metadata: { fields: Object.keys(body) },
  });

  return {
    content_version: nextMaterialVersion,
    updated_at: now.toISOString(),
  };
}

/** Ambil daftar set soal (/admin/assessment-sets). */
export async function getAssessmentSetsList(tx: DbOrTx, query: AssessmentSetsQuery) {
  const { assessment_type, status, tier_number, q, page, page_size } = query;
  const offset = (page - 1) * page_size;

  const conditions = [];
  if (assessment_type) {
    conditions.push(
      eq(
        assessmentSets.assessmentType,
        assessment_type as (typeof assessmentSets.$inferSelect)['assessmentType'],
      ),
    );
  }
  if (status) conditions.push(eq(assessmentSets.status, status));
  if (tier_number) conditions.push(eq(assessmentSets.tierId, sql`(SELECT id FROM tiers WHERE tier_number = ${tier_number})`));
  if (q) conditions.push(ilike(assessmentSets.title, `%${q}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await tx
    .select({
      id: assessmentSets.id,
      assessmentType: assessmentSets.assessmentType,
      title: assessmentSets.title,
      status: assessmentSets.status,
      questionCount: assessmentSets.questionCount,
      version: assessmentSets.version,
      origin: assessmentSets.origin,
      skillCategory: assessmentSets.skillCategory,
      updatedAt: assessmentSets.updatedAt,
    })
    .from(assessmentSets)
    .where(whereClause)
    .orderBy(desc(assessmentSets.updatedAt))
    .limit(page_size)
    .offset(offset);

  const [countRow] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(assessmentSets)
    .where(whereClause);

  const data = rows.map((r) => ({
    id: r.id,
    assessment_type: r.assessmentType,
    title: r.title,
    status: r.status,
    question_count: r.questionCount,
    version: r.version,
    origin: r.origin,
    scope_label: r.skillCategory ?? 'GLOBAL',
    updated_at: r.updatedAt.toISOString(),
  }));

  return {
    data,
    meta: {
      page,
      page_size,
      total: countRow?.count ?? 0,
    },
  };
}

/** Detail set soal untuk admin (/admin/assessment-sets/{id}). */
export async function getAssessmentSetDetail(tx: DbOrTx, setId: string) {
  const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, setId)).limit(1);
  if (!set) throw new ApiError('NOT_FOUND');

  const blockers = await computeBlockers(tx as Tx, 'ASSESSMENT_SET', setId);

  return {
    id: set.id,
    assessment_type: set.assessmentType,
    title: set.title,
    status: set.status,
    question_count: set.questionCount,
    version: set.version,
    origin: set.origin,
    scope_label: set.skillCategory ?? (set.subModuleId ? 'SUB_MODULE' : set.moduleId ? 'MODULE' : set.tierId ? 'TIER' : 'GLOBAL'),
    updated_at: set.updatedAt.toISOString(),
    time_limit_seconds: set.timeLimitSeconds,
    pass_percent: set.passPercent,
    reading_passage_markdown: set.readingPassageMarkdown,
    listening_asset_id: set.listeningAssetId,
    attribution_text: set.attributionText,
    reviewed_at: set.reviewedAt?.toISOString() ?? null,
    questions: set.questionsJson ?? [],
    blockers,
  };
}

/** Sunting metadata set soal (PATCH /admin/assessment-sets/{id}). */
export async function updateAssessmentSet(
  tx: Tx,
  setId: string,
  body: UpdateAssessmentSetRequest,
  adminUserId: string,
) {
  const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, setId)).limit(1);
  if (!set) throw new ApiError('NOT_FOUND');

  // K3: periksa attempt berjalan
  const activeAttempts = await tx
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        or(
          eq(attempts.assessmentSetId, setId),
          sql`${attempts.assessmentSetId} IN (SELECT id FROM assessment_sets WHERE parent_set_id = ${setId}::uuid)`,
        ),
        eq(attempts.status, 'IN_PROGRESS'),
      ),
    )
    .limit(1);

  if (activeAttempts.length > 0) {
    throw new ApiError('SET_HAS_ACTIVE_ATTEMPTS', {
      status: 409,
      message: 'Set memiliki attempt berjalan. Penyuntingan dinonaktifkan.',
    });
  }

  if (body.reading_passage_markdown !== undefined && body.reading_passage_markdown !== null) {
    const parts = body.reading_passage_markdown.split(/\r?\n===PASSAGE===\r?\n/);
    if (parts.length > 3) {
      throw new ApiError('VALIDATION_ERROR', {
        status: 400,
        message: 'Maksimal 3 bagian passage.',
        details: [{ path: 'reading_passage_markdown', code: 'too_many_passages', message: 'Maksimal 3 bagian.' }],
      });
    }

    const parsed = parsePassages(body.reading_passage_markdown);
    const qs = (set.questionsJson as Array<{ passage_no?: number }>) ?? [];
    for (const q of qs) {
      if (q.passage_no && q.passage_no > parsed.length) {
        throw new ApiError('VALIDATION_ERROR', {
          status: 400,
          message: 'Soal merujuk nomor passage yang tidak ada.',
          details: [{ path: 'reading_passage_markdown', code: 'passage_out_of_range', message: 'passage_out_of_range' }],
        });
      }
    }
  }

  const now = new Date();
  const nextVersion = set.version + 1;

  // K4: simpan snapshot sebelum perubahan
  await tx.insert(contentRevisions).values({
    entityType: 'ASSESSMENT_SET',
    entityId: setId,
    version: set.version,
    snapshot: {
      title: set.title,
      time_limit_seconds: set.timeLimitSeconds,
      pass_percent: set.passPercent,
      reading_passage_markdown: set.readingPassageMarkdown,
      version: set.version,
      content_hash: set.contentHash,
      questions: set.questionsJson,
    },
    changedBy: adminUserId,
    createdAt: now,
  });

  const nextHash = sha256Hex(
    canonicalJson({
      title: body.title ?? set.title,
      time_limit_seconds: body.time_limit_seconds ?? set.timeLimitSeconds,
      pass_percent: body.pass_percent !== undefined ? body.pass_percent : set.passPercent,
      reading_passage_markdown:
        body.reading_passage_markdown !== undefined
          ? body.reading_passage_markdown
          : set.readingPassageMarkdown,
      questions: set.questionsJson,
    }),
  );

  const updateData: Partial<typeof assessmentSets.$inferInsert> = {
    updatedAt: now,
    version: nextVersion,
    contentHash: nextHash,
  };
  if (body.title !== undefined) updateData.title = body.title;
  if (body.time_limit_seconds !== undefined) updateData.timeLimitSeconds = body.time_limit_seconds;
  if (body.pass_percent !== undefined) updateData.passPercent = body.pass_percent;
  if (body.reading_passage_markdown !== undefined) {
    updateData.readingPassageMarkdown = body.reading_passage_markdown;
  }

  await tx.update(assessmentSets).set(updateData).where(eq(assessmentSets.id, setId));

  await writeAudit(tx, {
    actorUserId: adminUserId,
    action: 'CONTENT_EDITED',
    entityType: 'assessment_set',
    entityId: setId,
    metadata: { fields: Object.keys(body) },
  });

  return {
    id: setId,
    title: body.title ?? set.title,
    time_limit_seconds: body.time_limit_seconds ?? set.timeLimitSeconds,
    pass_percent: body.pass_percent !== undefined ? body.pass_percent : set.passPercent,
    version: nextVersion,
    content_hash: nextHash,
  };
}

/** Sunting satu butir soal dalam set (PATCH /admin/assessment-sets/{id}/questions/{qId}). */
export async function updateQuestionInSet(
  tx: Tx,
  setId: string,
  questionId: string,
  body: UpdateQuestionRequest,
  adminUserId: string,
) {
  const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, setId)).limit(1);
  if (!set) throw new ApiError('NOT_FOUND');

  // K3: periksa attempt berjalan
  const activeAttempts = await tx
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        or(
          eq(attempts.assessmentSetId, setId),
          sql`${attempts.assessmentSetId} IN (SELECT id FROM assessment_sets WHERE parent_set_id = ${setId}::uuid)`,
        ),
        eq(attempts.status, 'IN_PROGRESS'),
      ),
    )
    .limit(1);

  if (activeAttempts.length > 0) {
    throw new ApiError('SET_HAS_ACTIVE_ATTEMPTS', {
      status: 409,
      message: 'Set memiliki attempt berjalan. Penyuntingan dinonaktifkan.',
    });
  }

  const questions = (set.questionsJson as Array<Record<string, unknown>>) ?? [];
  const qIndex = questions.findIndex((q) => q.question_id === questionId);
  if (qIndex === -1) throw new ApiError('NOT_FOUND');

  const oldQ = questions[qIndex]!;
  const mergedQ = { ...oldQ, ...body };

  // Validasi tipe soal spesifik
  const qType = (mergedQ as Record<string, unknown>).question_type;
  if (qType === 'MCQ_SINGLE' || qType === 'MCQ_MULTI') {
    if (body.correct_answers) {
      const opts = ((mergedQ as Record<string, unknown>).options as Array<{ option_id: string }>) ?? [];
      const optionIds = new Set(opts.map((o) => o.option_id));
      for (const ans of body.correct_answers) {
        if (!optionIds.has(ans)) {
          throw new ApiError('VALIDATION_ERROR', {
            status: 400,
            message: 'Jawaban benar harus berupa option_id yang terdaftar pada opsi.',
            details: [{ path: 'correct_answers', code: 'answer_not_in_options', message: 'Jawaban tidak ada di opsi.' }],
          });
        }
      }
    }
  } else {
    // Non-MCQ tidak boleh menyertakan options
    if (body.options) {
      throw new ApiError('VALIDATION_ERROR', {
        status: 400,
        message: 'Field options tidak diizinkan untuk tipe soal ini.',
        details: [{ path: 'options', code: 'field_not_allowed_for_type', message: 'field_not_allowed_for_type' }],
      });
    }
  }

  const now = new Date();
  const nextVersion = set.version + 1;

  // K4: simpan snapshot sebelum perubahan
  await tx.insert(contentRevisions).values({
    entityType: 'ASSESSMENT_SET',
    entityId: setId,
    version: set.version,
    snapshot: {
      title: set.title,
      version: set.version,
      content_hash: set.contentHash,
      questions: set.questionsJson,
    },
    changedBy: adminUserId,
    createdAt: now,
  });

  const nextQuestions = [...questions];
  nextQuestions[qIndex] = mergedQ;

  const nextHash = sha256Hex(
    canonicalJson({
      title: set.title,
      time_limit_seconds: set.timeLimitSeconds,
      pass_percent: set.passPercent,
      reading_passage_markdown: set.readingPassageMarkdown,
      questions: nextQuestions,
    }),
  );

  await tx
    .update(assessmentSets)
    .set({
      questionsJson: nextQuestions,
      version: nextVersion,
      contentHash: nextHash,
      updatedAt: now,
    })
    .where(eq(assessmentSets.id, setId));

  await writeAudit(tx, {
    actorUserId: adminUserId,
    action: 'CONTENT_EDITED',
    entityType: 'assessment_set',
    entityId: setId,
    metadata: { question_id: questionId, fields: Object.keys(body) },
  });

  return {
    question: mergedQ,
    set: {
      id: setId,
      version: nextVersion,
      content_hash: nextHash,
    },
  };
}

// K1: Validasi transisi status
export const VALID_STATUS_TRANSITIONS: Record<ReviewStatusName, readonly ReviewStatusName[]> = {
  DRAFT: ['IN_REVIEW', 'PUBLISHED'],
  IN_REVIEW: ['APPROVED', 'DRAFT', 'PUBLISHED'],
  APPROVED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['ARCHIVED', 'DRAFT'],
  ARCHIVED: ['DRAFT'],
};

export function isValidStatusTransition(from: ReviewStatusName, to: ReviewStatusName): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function computeQualityFlag(
  totalAttempts: number,
  correctAttempts: number,
): 'TOO_HARD' | 'TOO_EASY' | 'NORMAL' | 'INSUFFICIENT_DATA' {
  if (totalAttempts < 20) return 'INSUFFICIENT_DATA';
  const rate = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;
  if (rate < 0.20) return 'TOO_HARD';
  if (rate > 0.98) return 'TOO_EASY';
  return 'NORMAL';
}

/** Ubah status entitas kurikulum (POST /admin/{entity}/{id}/status). */
export async function changeEntityStatus(
  tx: Tx,
  entitySlug: string,
  id: string,
  body: ChangeStatusRequest,
  adminUserId: string,
) {
  let entityType: PublishEntityType;
  if (entitySlug === 'modules') entityType = 'MODULE';
  else if (entitySlug === 'sub-modules') entityType = 'SUB_MODULE';
  else if (entitySlug === 'assessment-sets') entityType = 'ASSESSMENT_SET';
  else throw new ApiError('NOT_FOUND');

  const target = body.status as ReviewStatusName;

  // Periksa keberadaan entitas dan status saat ini
  const table = entityType === 'MODULE' ? modules : entityType === 'SUB_MODULE' ? subModules : assessmentSets;
  const [row] = await tx.select().from(table).where(eq(table.id, id)).limit(1);
  if (!row) throw new ApiError('NOT_FOUND');

  const r = row as { status: ReviewStatusName; reviewedAt?: Date | null; origin?: string | null };
  const from = r.status;
  if (from === target) {
    return {
      id,
      entity: entitySlug,
      status: target,
      reviewed_at: r.reviewedAt?.toISOString() ?? null,
    };
  }

  if (!isValidStatusTransition(from, target)) {
    throw new ApiError('INVALID_STATUS_TRANSITION', {
      status: 409,
      message: `Transisi status dari ${from} ke ${target} tidak diizinkan.`,
    });
  }

  // K3: Set PUBLISHED tidak boleh diarsipkan / didrafkan jika ada attempt berjalan
  if (entityType === 'ASSESSMENT_SET' && from === 'PUBLISHED' && (target === 'DRAFT' || target === 'ARCHIVED')) {
    const active = await tx
      .select({ id: attempts.id })
      .from(attempts)
      .where(
        and(
          or(
            eq(attempts.assessmentSetId, id),
            sql`${attempts.assessmentSetId} IN (SELECT id FROM assessment_sets WHERE parent_set_id = ${id}::uuid)`,
          ),
          eq(attempts.status, 'IN_PROGRESS'),
        ),
      )
      .limit(1);
    if (active.length > 0) {
      throw new ApiError('SET_HAS_ACTIVE_ATTEMPTS', {
        status: 409,
        message: 'Set memiliki attempt berjalan.',
      });
    }
  }

  // K2: Konfirmasi reviu AI
  if (target === 'PUBLISHED') {
    const origin = r.origin;
    if (origin === 'AI_GENERATED_REVIEWED' && body.confirm_reviewed !== true) {
      throw new ApiError('REVIEW_CONFIRMATION_REQUIRED', {
        status: 409,
        message: 'Konfirmasi reviu AI wajib dicentang untuk memublikasikan konten ini.',
      });
    }
  }

  const now = new Date();

  // Jika target PUBLISHED, jalankan publish dengan pengecekan penghalang
  if (target === 'PUBLISHED') {
    const res = await PublishService.publish(tx, entityType, id, { userId: adminUserId });
    if (!res.published) {
      throw new ApiError('PUBLISH_BLOCKED', {
        status: 409,
        message: 'Konten memiliki penghalang publikasi.',
        details: res.blockers.map((b) => ({
          path: `${b.entity_type}:${b.entity_id}`,
          code: b.code,
          message: b.detail,
        })),
      });
    }

    if (entityType === 'ASSESSMENT_SET') {
      await tx
        .update(assessmentSets)
        .set({ reviewedBy: adminUserId, reviewedAt: now })
        .where(eq(assessmentSets.id, id));
    }

    return {
      id,
      entity: entitySlug,
      status: 'PUBLISHED',
      reviewed_at: entityType === 'ASSESSMENT_SET' ? now.toISOString() : null,
    };
  }

  // Transisi selain PUBLISHED
  if (entityType === 'MODULE') {
    await tx.update(modules).set({ status: target, updatedAt: now }).where(eq(modules.id, id));
  } else if (entityType === 'SUB_MODULE') {
    await tx.update(subModules).set({ status: target, updatedAt: now }).where(eq(subModules.id, id));
  } else {
    await tx.update(assessmentSets).set({ status: target, updatedAt: now }).where(eq(assessmentSets.id, id));
  }

  await writeAudit(tx, {
    actorUserId: adminUserId,
    action: 'CONTENT_STATUS_CHANGED',
    entityType: entityType.toLowerCase(),
    entityId: id,
    metadata: { from, to: target },
  });

  return {
    id,
    entity: entitySlug,
    status: target,
    reviewed_at: null,
  };
}

/** Statistik kualitas soal (K5: GET /admin/assessment-sets/{id}/quality). */
export async function getQuestionQuality(tx: DbOrTx, setId: string) {
  const [set] = await tx.select().from(assessmentSets).where(eq(assessmentSets.id, setId)).limit(1);
  if (!set) throw new ApiError('NOT_FOUND');

  const questions = (set.questionsJson as Array<{ question_id: string }>) ?? [];

  const answers = await tx
    .select({
      questionId: attemptAnswers.questionId,
      isCorrect: attemptAnswers.isCorrect,
    })
    .from(attemptAnswers)
    .innerJoin(attempts, eq(attemptAnswers.attemptId, attempts.id))
    .where(
      and(
        eq(attemptAnswers.assessmentSetId, setId),
        isNotNull(attemptAnswers.isCorrect),
        inArray(attempts.status, ['GRADED', 'EXPIRED']),
      ),
    );

  const answerMap = new Map<string, { total: number; correct: number }>();
  for (const a of answers) {
    const cur = answerMap.get(a.questionId) ?? { total: 0, correct: 0 };
    cur.total += 1;
    if (a.isCorrect === true) cur.correct += 1;
    answerMap.set(a.questionId, cur);
  }

  const questionsQuality = questions.map((q) => {
    const stats = answerMap.get(q.question_id) ?? { total: 0, correct: 0 };
    const attempts_count = stats.total;
    const correct_rate = attempts_count > 0 ? Math.round((stats.correct / attempts_count) * 100) / 100 : 0;

    let flag: 'TOO_HARD' | 'TOO_EASY' | null = null;
    if (attempts_count >= 20) {
      if (correct_rate < 0.20) flag = 'TOO_HARD';
      else if (correct_rate > 0.98) flag = 'TOO_EASY';
    }

    return {
      question_id: q.question_id,
      attempts_count,
      correct_rate,
      flag,
    };
  });

  return {
    set_id: setId,
    questions: questionsQuality,
  };
}

/** Daftar riwayat revisi (/admin/content-revisions). */
export async function getContentRevisions(tx: DbOrTx, query: ContentRevisionsQuery) {
  const entity_type = query.entity_type;
  const entity_id = query.entity_id;
  const page = query.page ?? 1;
  const page_size = query.page_size ?? 20;
  const offset = (page - 1) * page_size;

  const rows = await tx
    .select({
      id: contentRevisions.id,
      entityType: contentRevisions.entityType,
      entityId: contentRevisions.entityId,
      version: contentRevisions.version,
      changedByName: users.displayName,
      importBatchId: contentRevisions.importBatchId,
      createdAt: contentRevisions.createdAt,
    })
    .from(contentRevisions)
    .leftJoin(users, eq(contentRevisions.changedBy, users.id))
    .where(
      and(
        eq(contentRevisions.entityType, entity_type),
        eq(contentRevisions.entityId, entity_id),
      ),
    )
    .orderBy(desc(contentRevisions.version))
    .limit(page_size)
    .offset(offset);

  const [countRow] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(contentRevisions)
    .where(
      and(
        eq(contentRevisions.entityType, entity_type),
        eq(contentRevisions.entityId, entity_id),
      ),
    );

  const data = rows.map((r) => ({
    id: r.id,
    entity_type: r.entityType,
    entity_id: r.entityId,
    version: r.version,
    changed_by_name: r.changedByName,
    import_batch_id: r.importBatchId,
    created_at: r.createdAt.toISOString(),
  }));

  return {
    data,
    meta: {
      page,
      page_size,
      total: countRow?.count ?? 0,
    },
  };
}

/** Snapshot revisi (/admin/content-revisions/{id}). */
export async function getContentRevisionDetail(tx: DbOrTx, revisionId: string) {
  const [rev] = await tx
    .select({
      id: contentRevisions.id,
      entityType: contentRevisions.entityType,
      entityId: contentRevisions.entityId,
      version: contentRevisions.version,
      changedByName: users.displayName,
      importBatchId: contentRevisions.importBatchId,
      createdAt: contentRevisions.createdAt,
      snapshot: contentRevisions.snapshot,
    })
    .from(contentRevisions)
    .leftJoin(users, eq(contentRevisions.changedBy, users.id))
    .where(eq(contentRevisions.id, revisionId))
    .limit(1);

  if (!rev) throw new ApiError('NOT_FOUND');

  return {
    id: rev.id,
    entity_type: rev.entityType,
    entity_id: rev.entityId,
    version: rev.version,
    changed_by_name: rev.changedByName,
    import_batch_id: rev.importBatchId,
    created_at: rev.createdAt.toISOString(),
    snapshot: rev.snapshot,
  };
}
