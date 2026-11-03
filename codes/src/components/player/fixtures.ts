import type { SubModuleDetail } from '@/contracts/player';

/** Fixture uji (bukan data produksi). Bentuk persis kontrak SPEC-005. */
export function makeDetail(over: Partial<SubModuleDetail> = {}): SubModuleDetail {
  const base: SubModuleDetail = {
    sub_module: {
      id: '7a1b2c3d-0213-4000-8000-000000000213',
      sub_module_code: '2.1.3',
      title: 'Passive Voice untuk Deskripsi Proses',
      passing_score_percent: 75,
      content_version: 1,
      module: {
        id: '7a1b2c3d-0021-4000-8000-000000000021',
        module_code: '2.1',
        title: 'Complex Grammar',
        skill_category: 'GRAMMAR',
      },
      tier: { id: '7a1b2c3d-0002-4000-8000-000000000002', tier_number: 2, title: 'Bridge to Academic' },
    },
    material: {
      article_markdown:
        '## Mengapa Passive Voice?\nDalam **IELTS Writing Task 1** kalimat pasif dipakai.\n\n### Rumus\nBentuk: be + V3.\n\n:::tips-examiner\nGunakan pasif untuk proses.\n:::\n',
      videos: [
        {
          asset_id: 'c1d2e3f4-0001-4000-8000-0000000000a1',
          video_id: 'dQw4w9WgXcQ',
          title: 'Cara Cepat Passive Voice',
          instructor_channel: 'Kampung Inggris LC',
          language: 'ID',
          start_sec: 95,
          end_sec: 420,
        },
      ],
      slides: [
        {
          asset_id: 'c1d2e3f4-0002-4000-8000-0000000000a2',
          order: 1,
          caption: 'Alur perubahan objek',
          alt: 'Diagram alur pabrik',
          url: '/api/v1/assets/c1d2e3f4-0002-4000-8000-0000000000a2/file',
        },
        {
          asset_id: 'c1d2e3f4-0002-4000-8000-0000000000a4',
          order: 2,
          caption: null,
          alt: 'Diagram dua',
          url: '/api/v1/assets/c1d2e3f4-0002-4000-8000-0000000000a4/file',
        },
      ],
      attachments: [
        {
          asset_id: 'c1d2e3f4-0003-4000-8000-0000000000a3',
          title: 'Daftar 100 Verb-3',
          file_type: 'PDF',
          size_bytes: 482113,
          url: '/api/v1/assets/c1d2e3f4-0003-4000-8000-0000000000a3/file',
        },
      ],
      mini_task: { task_type: 'SELF_CHECK', prompt: 'Ubah 3 kalimat aktif menjadi pasif.', success_criteria: 'Tiga struktur akurat.' },
      attribution_text: 'Diadaptasi dari materi terbuka.',
    },
    progress: {
      status: 'IN_PROGRESS',
      progress_percent: 20,
      learn_completed_at: null,
      mini_task_completed_at: null,
      best_score_percent: 0,
      mastery_crown: 'NONE',
      learn_active_seconds: 42,
      learn_visited_subtabs: ['ARTICLE'],
      learn_ready: false,
    },
    drill: {
      assessment_set_id: 'e5f6a7b8-0001-4000-8000-0000000000d1',
      question_count: 10,
      time_limit_seconds: 300,
      pass_percent: 75,
      can_start: false,
      blocked_reason: 'LEARN_NOT_COMPLETED',
    },
    navigation: { prev_sub_module_code: '2.1.2', next_sub_module_code: '2.1.4' },
  };
  return { ...base, ...over };
}
