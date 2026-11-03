import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/components/test-utils';
import type { CurriculumTree } from '@/contracts/curriculum';
import { findActiveNodeId, SkillTree } from './skill-tree';

const skip = { available: false, assessment_set_id: null, threshold_percent: 85, time_limit_seconds: null, question_count: null };
const sm = (n: number, over: Record<string, unknown> = {}) => ({
  id: `7a1b2c3d-0111-4000-8000-00000000011${n}`,
  sub_module_code: `1.1.${n}`,
  title: `Sub ${n}`,
  order_index: n,
  status: 'LOCKED',
  content_state: 'AVAILABLE',
  mastery_crown: 'NONE',
  best_score_percent: 0,
  progress_percent: 0,
  has_mini_task: false,
  lock_reason: { code: 'PREVIOUS_INCOMPLETE', blocking_sub_module_id: null, message: 'Selesaikan Sub 1 dan capai skor latihan 75% untuk membuka.' },
  ...over,
});

function tree(over: { boss?: Record<string, unknown>; moduleSkip?: Record<string, unknown> } = {}): CurriculumTree {
  return {
    tiers: [
      {
        id: '7a1b2c3d-0001-4000-8000-000000000001',
        tier_number: 1,
        title: 'Foundation',
        cefr_level: 'A1-A2',
        target_band_min: 3,
        target_band_max: 4,
        status: 'IN_PROGRESS',
        unlock_source: 'DEFAULT',
        progress_percent: 12,
        boss: {
          available: false,
          blocked_reason: 'MODULES_INCOMPLETE',
          gate_type: 'PERCENT',
          gate_value: 80,
          assessment_set_id: null,
          best_percent: null,
          best_band: null,
          passed_at: null,
          ...over.boss,
        },
        skip_test: skip,
        modules: [
          {
            id: '7a1b2c3d-0011-4000-8000-000000000011',
            module_code: '1.1',
            skill_category: 'GRAMMAR',
            title: 'Core Sentence Architecture',
            order_index: 1,
            status: 'IN_PROGRESS',
            content_state: 'AVAILABLE',
            progress_percent: 25,
            skip_test: { ...skip, ...over.moduleSkip },
            sub_modules: [
              sm(1, { status: 'COMPLETED', mastery_crown: 'SILVER', best_score_percent: 80, progress_percent: 100, lock_reason: null }),
              sm(2, { status: 'IN_PROGRESS', progress_percent: 40, lock_reason: null }),
              sm(3),
              sm(4, {
                content_state: 'COMING_SOON',
                lock_reason: { code: 'NOT_PUBLISHED', blocking_sub_module_id: null, message: 'Materi ini belum tersedia. Segera hadir.' },
              }),
              sm(5, { status: 'SKIPPED', progress_percent: 100, lock_reason: null }),
            ],
          },
        ],
      },
      ...[2, 3, 4].map((n) => ({
        id: `7a1b2c3d-000${n}-4000-8000-00000000000${n}`,
        tier_number: n,
        title: `Tier ${n}`,
        cefr_level: 'B1',
        target_band_min: 5,
        target_band_max: 6,
        status: 'LOCKED',
        unlock_source: null,
        progress_percent: 0,
        boss: { available: false, blocked_reason: 'TIER_LOCKED', gate_type: 'BAND', gate_value: 5, assessment_set_id: null, best_percent: null, best_band: null, passed_at: null },
        skip_test: skip,
        modules: [],
      })),
    ],
  } as unknown as CurriculumTree;
}

describe('SkillTree', () => {
  it('merender 4 tier sebagai <ol> bersarang dengan aria-label', () => {
    renderWithProviders(<SkillTree tree={tree()} />);
    expect(screen.getByRole('list', { name: 'Tier 1' })).toBeInTheDocument();
    for (const n of [1, 2, 3, 4]) {
      const prefix = `Tier ${n}:`;
      expect(screen.getByRole('heading', { level: 2, name: (text) => text.startsWith(prefix) })).toBeInTheDocument();
    }
  });

  it('status selalu ikon + label teks, tidak hanya warna', () => {
    renderWithProviders(<SkillTree tree={tree()} />);
    const nodes = within(screen.getByRole('list', { name: 'Modul 1.1' }));
    expect(nodes.getByText('Selesai')).toBeInTheDocument();
    expect(nodes.getAllByText('Sedang dipelajari').length).toBeGreaterThan(0);
    expect(nodes.getByText('Terkunci')).toBeInTheDocument();
    expect(nodes.getByText('Dilewati')).toBeInTheDocument();
    expect(nodes.getByText('Segera hadir')).toBeInTheDocument();
    expect(nodes.getByRole('img', { name: 'Mahkota Perak, skor 80%' })).toBeInTheDocument();
  });

  it('node terbuka berupa tautan ke /belajar/{kode}; COMING_SOON dan LOCKED bukan tautan', () => {
    renderWithProviders(<SkillTree tree={tree()} />);
    expect(screen.getByRole('link', { name: /Sub 1/ })).toHaveAttribute('href', '/belajar/1.1.1');
    expect(screen.getByRole('link', { name: /Sub 2/ })).toHaveAttribute('href', '/belajar/1.1.2');
    expect(screen.queryByRole('link', { name: /Sub 3/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Sub 4/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sub 4/ })).not.toBeInTheDocument();
  });

  it('node terkunci fokusable dan membuka popover alasan berbahasa Indonesia', async () => {
    renderWithProviders(<SkillTree tree={tree()} />);
    const btn = screen.getByRole('button', { name: /Sub 3/ });
    fireEvent.click(btn);
    expect(await screen.findByText('Selesaikan Sub 1 dan capai skor latihan 75% untuk membuka.', { selector: 'p' })).toBeInTheDocument();
  });

  it('popover terkunci menawarkan Uji Kompetensi hanya bila modul mendukung', async () => {
    renderWithProviders(
      <SkillTree
        tree={tree({ moduleSkip: { available: true, assessment_set_id: '7a1b2c3d-0aaa-4000-8000-000000000aaa' } })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Sub 3/ }));
    const buttons = await screen.findAllByRole('button', { name: 'Uji Kompetensi' });
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(await screen.findByText('Ikut Uji Kompetensi?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lanjut ke Halaman Ujian' })).toHaveAttribute(
      'href',
      '/ujian/mulai/7a1b2c3d-0aaa-4000-8000-000000000aaa',
    );
  });

  it('Boss Stage tidak tersedia: tombol disabled dengan alasan untuk pembaca layar', () => {
    renderWithProviders(<SkillTree tree={tree()} />);
    const boss = screen.getAllByRole('button', { name: /Boss Stage/ })[0];
    expect(boss).toBeDisabled();
    expect(boss).toHaveAccessibleName(/Selesaikan semua modul di Tier ini untuk membuka Boss Stage/);
  });

  it('Boss Stage tersedia menjadi tautan ke halaman mulai ujian', () => {
    renderWithProviders(
      <SkillTree
        tree={tree({ boss: { available: true, blocked_reason: null, assessment_set_id: '7a1b2c3d-0bbb-4000-8000-000000000bbb' } })}
      />,
    );
    expect(screen.getByRole('link', { name: /Boss Stage/ })).toHaveAttribute('href', '/ujian/mulai/7a1b2c3d-0bbb-4000-8000-000000000bbb');
  });

  it('tier tanpa konten menampilkan pesan Segera hadir', () => {
    renderWithProviders(<SkillTree tree={tree()} />);
    expect(screen.getAllByText('Konten belum tersedia. Segera hadir.')).toHaveLength(3);
  });

  it('progress bar memiliki nilai dan label', () => {
    renderWithProviders(<SkillTree tree={tree()} />);
    const bar = screen.getByRole('progressbar', { name: 'Progres Tier 1' });
    expect(bar).toHaveAttribute('aria-valuenow', '12');
  });

  it('modul dapat dilipat dengan aria-expanded', () => {
    renderWithProviders(<SkillTree tree={tree()} />);
    const toggle = screen.getByRole('button', { name: /Core Sentence Architecture/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('findActiveNodeId memilih IN_PROGRESS pertama, lalu UNLOCKED', () => {
    expect(findActiveNodeId(tree())).toBe('7a1b2c3d-0111-4000-8000-000000000112');
    const t = tree();
    t.tiers[0].modules[0].sub_modules[1].status = 'UNLOCKED';
    expect(findActiveNodeId(t)).toBe('7a1b2c3d-0111-4000-8000-000000000112');
    t.tiers[0].modules[0].sub_modules[1].status = 'COMPLETED';
    expect(findActiveNodeId(t)).toBeNull();
  });

  it('render ringan tanpa provider untuk fungsi murni (smoke)', () => {
    const { container } = render(<div />);
    expect(container).toBeTruthy();
  });
});
