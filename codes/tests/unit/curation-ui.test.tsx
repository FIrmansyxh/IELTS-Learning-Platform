/** @vitest-environment jsdom */
import * as React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockFetch, renderWithProviders } from '@/components/test-utils';
import { CurriculumPanel } from '@/components/admin/curation/curriculum-panel';
import { QuestionsPanel, QualityBadge } from '@/components/admin/curation/questions-panel';
import { RevisionsPanel } from '@/components/admin/curation/revisions-panel';

const mockCurriculumData = [
  {
    tier_number: 1,
    tier_name: 'Foundation Tier',
    modules: [
      {
        id: 'mod-1',
        title: 'Grammar Essentials',
        order_index: 1,
        status: 'PUBLISHED',
        content_version: 2,
        is_blocked: false,
        sub_modules: [
          {
            id: 'sub-1',
            title: 'Subject-Verb Agreement',
            order_index: 1,
            status: 'PUBLISHED',
            content_version: 3,
            passing_score_percent: 75,
            origin: 'AI_GENERATED_REVIEWED',
            is_blocked: false,
          },
        ],
      },
    ],
  },
];

const mockSubModuleDetail = {
  sub_module: {
    id: 'sub-1',
    module_id: 'mod-1',
    title: 'Subject-Verb Agreement',
    order_index: 1,
    status: 'PUBLISHED',
    passing_score_percent: 75,
    content_version: 3,
  },
  material: {
    id: 'mat-1',
    title: 'Materi SVA',
    article_markdown: '# Panduan SVA\n\nSubjek tunggal membutuhkan kata kerja tunggal.',
    attribution_text: 'Grammar Guidebook',
    mini_task: { task_type: 'SELF_CHECK', prompt: 'Tulis satu kalimat SVA.' },
    origin: 'AI_GENERATED_REVIEWED',
  },
};

const mockAssessmentSets = {
  data: [
    {
      id: 'set-1',
      title: 'Drill SVA Bagian 1',
      assessment_type: 'DRILL',
      status: 'PUBLISHED',
      tier_number: 1,
      version: 2,
      question_count: 5,
      has_active_attempts: false,
      created_at: new Date().toISOString(),
    },
  ],
  meta: { total: 1, page: 1, page_size: 20 },
};

const mockSetDetail = {
  set: {
    id: 'set-1',
    title: 'Drill SVA Bagian 1',
    assessment_type: 'DRILL',
    status: 'PUBLISHED',
    tier_number: 1,
    version: 2,
    content_hash: 'abcdef1234567890abcdef1234567890',
    origin: 'ORIGINAL_AUTHORED',
    time_limit_sec: 600,
  },
  questions: [
    {
      id: 'q-1',
      prompt: 'Pilihlah bentuk kata kerja yang benar: The cat ___ on the mat.',
      question_type: 'MCQ_SINGLE',
      options: ['sits', 'sit', 'sitting', 'is sit'],
      correct_option_index: 0,
      explanation: 'Cat adalah singular noun.',
      points: 1,
      order_index: 1,
    },
  ],
  quality: {
    'q-1': {
      total_attempts: 50,
      correct_attempts: 8,
      difficulty_rate: 0.16,
      quality_flag: 'TOO_HARD',
    },
  },
};

const mockRevisionsData = {
  data: [
    {
      id: 'rev-1',
      entity_type: 'sub_modules',
      entity_id: 'sub-1',
      revision_number: 2,
      change_summary: 'Perbarui passing score menjadi 75%',
      created_by: '00000000-0000-4000-8000-000000000001',
      created_at: new Date().toISOString(),
    },
  ],
  meta: { total: 1, page: 1, page_size: 20 },
};

const mockRevisionDetail = {
  id: 'rev-1',
  entity_type: 'sub_modules',
  entity_id: 'sub-1',
  revision_number: 2,
  change_summary: 'Perbarui passing score menjadi 75%',
  snapshot_payload: JSON.stringify({ title: 'Subject-Verb Agreement', passing_score_percent: 75 }),
  created_by: '00000000-0000-4000-8000-000000000001',
  created_at: new Date().toISOString(),
};

describe('Admin Curation UI Components', () => {
  beforeEach(() => {
    mockFetch((url) => {
      const p = url.pathname;
      if (p === '/api/v1/admin/curriculum') {
        return { body: { data: mockCurriculumData } };
      }
      if (p === '/api/v1/admin/sub-modules/sub-1') {
        return { body: { data: mockSubModuleDetail } };
      }
      if (p === '/api/v1/admin/assessment-sets') {
        return { body: mockAssessmentSets };
      }
      if (p === '/api/v1/admin/assessment-sets/set-1') {
        return { body: { data: mockSetDetail } };
      }
      if (p === '/api/v1/admin/content-revisions') {
        return { body: mockRevisionsData };
      }
      if (p === '/api/v1/admin/content-revisions/rev-1') {
        return { body: { data: mockRevisionDetail } };
      }
      return { body: { data: {} } };
    });
  });

  describe('CurriculumPanel', () => {
    it('merender hierarki Tier, Modul, dan Sub-modul', async () => {
      renderWithProviders(<CurriculumPanel />);

      expect(await screen.findByText('Tier 1: Foundation Tier')).toBeInTheDocument();
      const modHeader = await screen.findByText('1. Grammar Essentials');
      expect(modHeader).toBeInTheDocument();

      // Expand module untuk melihat sub-module
      fireEvent.click(modHeader);

      expect(await screen.findByText('1. Subject-Verb Agreement')).toBeInTheDocument();
      expect(screen.getAllByText('PUBLISHED').length).toBeGreaterThan(0);
      expect(screen.getByText('AI_GENERATED_REVIEWED')).toBeInTheDocument();
    });

    it('membuka dialog ubah status saat tombol diklik', async () => {
      renderWithProviders(<CurriculumPanel />);

      const changeStatusButtons = await screen.findAllByText('Ubah Status');
      fireEvent.click(changeStatusButtons[0]!);

      expect(await screen.findByText('Ubah Status Konten')).toBeInTheDocument();
      expect(screen.getByText('Status Baru')).toBeInTheDocument();
    });

    it('membuka sheet edit sub-modul saat tombol sunting diklik', async () => {
      renderWithProviders(<CurriculumPanel />);

      // Expand module terlebih dahulu
      const modHeader = await screen.findByText('1. Grammar Essentials');
      fireEvent.click(modHeader);

      const editButton = await screen.findByText('Sunting');
      fireEvent.click(editButton);

      expect(await screen.findByText('Sunting Sub-modul')).toBeInTheDocument();
      expect(await screen.findByText('Materi Pembelajaran')).toBeInTheDocument();
      expect(screen.getByText('Editor')).toBeInTheDocument();
      expect(screen.getByText('Pratinjau')).toBeInTheDocument();
    });
  });

  describe('QuestionsPanel', () => {
    it('merender daftar set soal dan detail pertanyaan saat set dipilih', async () => {
      renderWithProviders(<QuestionsPanel />);

      expect(await screen.findByText('Drill SVA Bagian 1')).toBeInTheDocument();

      // Klik set untuk menampilkan soal
      fireEvent.click(screen.getByText('Drill SVA Bagian 1'));

      expect(await screen.findByText(/The cat ___ on the mat/)).toBeInTheDocument();
      expect(await screen.findByText(/Terlalu Sulit/)).toBeInTheDocument();
    });
  });

  describe('QualityBadge', () => {
    it('merender badge sesuai flag kualitas soal', () => {
      const { rerender } = renderWithProviders(
        <QualityBadge flag="TOO_HARD" rate={0.15} count={50} />
      );
      expect(screen.getByText(/Terlalu Sulit \(15%\)/)).toBeInTheDocument();

      rerender(<QualityBadge flag="TOO_EASY" rate={0.99} count={100} />);
      expect(screen.getByText(/Terlalu Mudah \(99%\)/)).toBeInTheDocument();

      rerender(<QualityBadge flag="NORMAL" rate={0.7} count={50} />);
      expect(screen.getByText('Normal')).toBeInTheDocument();

      rerender(<QualityBadge flag="INSUFFICIENT_DATA" />);
      expect(screen.getByText('Data Belum Cukup')).toBeInTheDocument();
    });
  });

  describe('RevisionsPanel', () => {
    it('merender riwayat revisi dan menampilkan snapshot', async () => {
      renderWithProviders(
        <RevisionsPanel initialEntityType="sub_modules" initialEntityId="sub-1" />
      );

      expect(await screen.findByText('Perbarui passing score menjadi 75%')).toBeInTheDocument();
      expect(screen.getByText('r2')).toBeInTheDocument();

      const viewButton = screen.getByText('Lihat');
      fireEvent.click(viewButton);

      expect(await screen.findByText('Detail Snapshot Revisi (r2)')).toBeInTheDocument();
      expect(await screen.findByText(/passing_score_percent/)).toBeInTheDocument();
    });
  });
});
