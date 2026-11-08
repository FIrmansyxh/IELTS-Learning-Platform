import { inArray } from 'drizzle-orm';
import { contentAssets } from '@/db/schema';
import type { DbOrTx } from '../db';
import { logger } from '../logger';
import { VIDEO_ID_RE } from './rules';

export interface VideoItem {
  asset_id: string;
  video_id: string;
  title: string;
  instructor_channel: string | null;
  language: string;
  start_sec: number;
  end_sec: number;
}
export interface SlideItem {
  asset_id: string;
  order: number;
  caption: string;
  alt: string;
  url: string;
}
export interface AttachmentItem {
  asset_id: string;
  title: string;
  file_type: 'PDF' | 'DOCX';
  size_bytes: number;
  url: string;
}
export interface MiniTaskItem {
  task_type: 'AI_SHORT_WRITING' | 'AI_SHORT_SPEAKING' | 'SELF_CHECK';
  prompt: string;
  success_criteria: string;
}
export interface Material {
  articleMarkdown: string;
  videos: VideoItem[];
  slides: SlideItem[];
  attachments: AttachmentItem[];
  miniTask: MiniTaskItem | null;
  attributionText: string | null;
}

type J = Record<string, unknown>;
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as J[]) : []);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const int = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : d);
export const assetFileUrl = (assetId: string) => `/api/v1/assets/${assetId}/file`;

const TASK_TYPES = ['AI_SHORT_WRITING', 'AI_SHORT_SPEAKING', 'SELF_CHECK'] as const;

/**
 * Muat materi sub-modul dan petakan JSON aset ke bentuk DTO. TIDAK pernah membawa `storage_key`, `sha256`,
 * `external_url`, atau `ai_rubric_criteria` (hanya `success_criteria` = isi `ai_rubric_criteria`).
 * Entri yang asetnya hilang/korup dibuang dengan log `warn` (konsisten antara tampilan dan syarat belajar).
 */
export async function loadMaterial(
  db: DbOrTx,
  subModuleId: string,
  style: 'LEARN_FIRST' | 'PRACTICE_FIRST' | 'CASE_BASED' = 'LEARN_FIRST',
): Promise<Material | null> {
  const { getSubModuleMaterials } = await import('../tracks/service');
  const lm = await getSubModuleMaterials(subModuleId, style, db);
  if (!lm) return null;
  const videosJson = arr(lm.videosJson);
  const slidesJson = arr(lm.slidesJson);
  const attJson = arr(lm.attachmentsJson);
  const ids = [...videosJson, ...slidesJson, ...attJson].map((x) => str(x.asset_id)).filter((x): x is string => !!x);
  const assets = ids.length
    ? await db
        .select({ id: contentAssets.id, kind: contentAssets.kind, externalRef: contentAssets.externalRef, sizeBytes: contentAssets.sizeBytes })
        .from(contentAssets)
        .where(inArray(contentAssets.id, ids))
    : [];
  const byId = new Map(assets.map((a) => [a.id, a]));

  const videos: VideoItem[] = [];
  for (const v of videosJson) {
    const assetId = str(v.asset_id);
    const asset = assetId ? byId.get(assetId) : undefined;
    const videoId = asset?.externalRef ?? str(v.video_id);
    if (!assetId || !asset || asset.kind !== 'VIDEO_EMBED' || !videoId || !VIDEO_ID_RE.test(videoId)) {
      logger.warn({ subModuleId, assetId }, 'video_material_invalid');
      continue;
    }
    const start = int(v.start_sec);
    const end = int(v.end_sec);
    if (end < start) logger.warn({ subModuleId, assetId }, 'video_end_before_start');
    videos.push({
      asset_id: assetId,
      video_id: videoId,
      title: str(v.title) ?? '',
      instructor_channel: str(v.instructor_channel),
      language: str(v.language) ?? 'ID',
      start_sec: start,
      end_sec: end,
    });
  }

  const slides: SlideItem[] = [];
  for (const s of slidesJson) {
    const assetId = str(s.asset_id);
    const asset = assetId ? byId.get(assetId) : undefined;
    if (!assetId || !asset || (asset.kind !== 'SLIDE_IMAGE' && asset.kind !== 'IMAGE')) {
      logger.warn({ subModuleId, assetId }, 'slide_material_invalid');
      continue;
    }
    const caption = str(s.caption) ?? '';
    slides.push({ asset_id: assetId, order: int(s.order, 1), caption, alt: str(s.alt) || caption, url: assetFileUrl(assetId) });
  }
  slides.sort((a, b) => a.order - b.order);

  const attachments: AttachmentItem[] = [];
  for (const a of attJson) {
    const assetId = str(a.asset_id);
    const asset = assetId ? byId.get(assetId) : undefined;
    const fileType = a.file_type === 'DOCX' ? 'DOCX' : a.file_type === 'PDF' ? 'PDF' : null;
    if (!assetId || !asset || asset.kind !== 'DOCUMENT' || !fileType) {
      logger.warn({ subModuleId, assetId }, 'attachment_material_invalid');
      continue;
    }
    attachments.push({ asset_id: assetId, title: str(a.title) ?? '', file_type: fileType, size_bytes: asset.sizeBytes ?? 0, url: assetFileUrl(assetId) });
  }

  const mt = (lm.miniTaskJson ?? {}) as J;
  const taskType = TASK_TYPES.find((t) => t === mt.task_type);
  const miniTask: MiniTaskItem | null = taskType
    ? { task_type: taskType, prompt: str(mt.prompt) ?? '', success_criteria: str(mt.ai_rubric_criteria) ?? '' }
    : null;

  return { articleMarkdown: lm.articleMarkdown, videos, slides, attachments, miniTask, attributionText: lm.attributionText };
}
