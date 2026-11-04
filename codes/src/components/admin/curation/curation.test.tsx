import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import { AssetDetailSheet } from '@/components/admin/asset-detail-sheet';
import { blockerHref } from './blockers-list';
import { CurriculumPanel } from './curriculum-panel';
import { RevisionsPanel } from './revisions-panel';
import { SetDetail } from './set-detail';
import { SetsPanel } from './sets-panel';
import { STATUS_TRANSITIONS } from './status';
import { blockersFromDetails } from './status-dialog';
import { toLines, parseIndexes } from './question-model';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/konten/kurikulum',
  useSearchParams: () => new URLSearchParams(),
}));
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const SUB = '7a1b2c3d-0213-4000-8000-000000000213';
const SUB2 = '7a1b2c3d-0214-4000-8000-000000000214';
const MOD = '7a1b2c3d-0021-4000-8000-000000000021';
const DRILL = 'e5f6a7b8-0001-4000-8000-0000000000d1';
const SKIP = 'f0a1b2c3-0001-4000-8000-0000000000e1';
const ASSET = 'a55e7000-0001-4000-8000-000000000001';
const REV = 'aa000000-0001-4000-8000-000000000001';
const meta = (n: number) => ({ page: 1, page_size: 20, total: n });
const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({ body: { data, ...extra } });

const curriculum = {
  tiers: [
    {
      tier_number: 2,
      title: 'Bridge to Academic',
      skip_set: { id: 'f0a1b2c3-0002-4000-8000-0000000000e2', status: 'DRAFT', question_count: 20, version: 1 },
      boss: { id: 'b0551002-0000-4000-8000-000000000002', status: 'DRAFT', section_skills: ['LISTENING', 'READING'], version: 1 },
      modules: [
        {
          id: MOD,
          module_code: '2.1',
          title: 'Complex Grammar',
          order_index: 1,
          status: 'PUBLISHED',
          skip_set: { id: SKIP, status: 'PUBLISHED', question_count: 12, version: 2 },
          sub_modules: [
            {
              id: SUB,
              sub_module_code: '2.1.3',
              title: 'Passive Voice',
              order_index: 3,
              status: 'PUBLISHED',
              passing_score_percent: 75,
              content_version: 2,
              origin: 'AI_GENERATED_REVIEWED',
              has_material: true,
              drill: { id: DRILL, status: 'PUBLISHED', question_count: 10, version: 3 },
              blocker_count: 0,
            },
            {
              id: SUB2,
              sub_module_code: '2.1.4',
              title: 'Conditionals',
              order_index: 4,
              status: 'DRAFT',
              passing_score_percent: 75,
              content_version: 1,
              origin: 'ORIGINAL_AUTHORED',
              has_material: true,
              drill: null,
              blocker_count: 3,
            },
          ],
        },
      ],
    },
  ],
  placement: { id: 'd0cc0001-0001-4000-8000-000000000001', status: 'PUBLISHED', question_count: 30, version: 1 },
};

const subDetail = (over: Record<string, unknown> = {}, status = 'PUBLISHED') => ({
  sub_module: {
    id: SUB,
    sub_module_code: '2.1.3',
    title: 'Passive Voice',
    order_index: 3,
    status,
    passing_score_percent: 75,
    content_version: 2,
    module: { id: MOD, module_code: '2.1', title: 'Complex Grammar' },
  },
  material: {
    article_markdown: '## Passive\n\nThe beans **are ground**.',
    origin: 'AI_GENERATED_REVIEWED',
    attribution_text: null,
    content_version: 2,
    videos: [{ asset_id: ASSET, video_id: 'abcdefghijk', title: 'Video pasif', start_sec: 0, end_sec: 120, rights_status: 'UNVERIFIED' }],
    slides: [],
    attachments: [],
    mini_task: null,
  },
  drill: { id: DRILL, status: 'PUBLISHED', question_count: 10, version: 3 },
  blockers: [{ code: 'ASSET_UNVERIFIED', entity_type: 'SUB_MODULE', entity_id: SUB, detail: `asset ${ASSET} (tier2/video)`, asset_id: ASSET }],
  ...over,
});

function serveCurriculum(extra: (url: URL, init: RequestInit) => ReturnType<Parameters<typeof mockFetch>[0]> | undefined = () => undefined) {
  return mockFetch((url, init) => {
    const custom = extra(url, init);
    if (custom) return custom;
    if (url.pathname === '/api/v1/admin/curriculum') return ok(curriculum);
    if (url.pathname === `/api/v1/admin/sub-modules/${SUB}` && (init.method ?? 'GET') === 'GET') return ok(subDetail());
    return { status: 404, body: errorBody('NOT_FOUND', 'x') };
  });
}

beforeEach(() => {
  window.history.pushState({}, '', '/admin/konten/kurikulum');
});

describe('util kurasi', () => {
  it('transisi status mengikuti K1 SPEC-020', () => {
    expect(STATUS_TRANSITIONS.DRAFT).toEqual(['IN_REVIEW', 'PUBLISHED']);
    expect(STATUS_TRANSITIONS.ARCHIVED).toEqual(['DRAFT']);
    expect(STATUS_TRANSITIONS.PUBLISHED).toContain('ARCHIVED');
    expect(STATUS_TRANSITIONS.DRAFT).not.toContain('ARCHIVED');
    expect(STATUS_TRANSITIONS.ARCHIVED).not.toContain('PUBLISHED');
  });

  it('PUBLISH_BLOCKED details -> penghalang bertaut', () => {
    const detail = `asset ${ASSET} (tier2/video)`;
    const [b] = blockersFromDetails([{ path: `SUB_MODULE:${SUB}`, code: 'ASSET_UNVERIFIED', message: detail }]);
    expect(b).toEqual({ code: 'ASSET_UNVERIFIED', entity_type: 'SUB_MODULE', entity_id: SUB, detail });
    // entity_type dari server adalah pemilik (sub-modul); asset_id terstruktur menaut ke aset, tanpa mengurai teks `detail`.
    expect(blockerHref({ ...b!, asset_id: ASSET })).toEqual({ href: `/admin/konten/aset?buka=${ASSET}`, label: 'Buka di Aset' });
    // Detail galat 409 tidak membawa asset_id: jatuh ke daftar belum diverifikasi, bukan menebak dari teks.
    expect(blockerHref(b!)).toEqual({ href: '/admin/konten/aset?belum=1', label: 'Lihat aset belum diverifikasi' });
    expect(blockerHref({ code: 'SOURCE_MISSING', entity_type: 'SUB_MODULE', entity_id: SUB, detail: 'tanpa id' })?.href).toBe('/admin/konten/aset?belum=1');
    expect(blockerHref({ code: 'NO_QUESTIONS', entity_type: 'ASSESSMENT_SET', entity_id: DRILL, detail: '-' })?.href).toBe(`/admin/konten/soal/${DRILL}`);
    expect(blockerHref({ code: 'DRILL_NOT_PUBLISHED', entity_type: 'SUB_MODULE', entity_id: SUB, detail: '-' })?.href).toBe(`/admin/konten/kurikulum?sub_modul=${SUB}`);
    expect(blockerHref({ code: 'X', entity_type: 'LAINNYA', entity_id: SUB, detail: '-' })).toBeNull();
  });

  it('parser baris dan indeks', () => {
    expect(toLines('a\n b \r\nc')).toEqual(['a', 'b', 'c']);
    expect(parseIndexes('0, 2,1')).toEqual([0, 2, 1]);
    expect(parseIndexes('0, x')).toBeNull();
    expect(parseIndexes('')).toBeNull();
    expect(parseIndexes('-1')).toBeNull();
  });
});

describe('CurriculumPanel', () => {
  it('pohon Tier > Modul > Sub-Modul dengan status (ikon + teks), set, dan jumlah penghalang', async () => {
    serveCurriculum();
    renderWithProviders(<CurriculumPanel />);
    expect(await screen.findByRole('heading', { name: 'Tier 2: Bridge to Academic' })).toBeInTheDocument();
    const published = screen.getByTestId('sub-2.1.3');
    expect(within(published).getAllByText('Terpublikasi').length).toBeGreaterThan(0);
    expect(within(published).getByText('Ambang lulus 75%', { exact: false })).toBeInTheDocument();
    expect(within(published).getByTestId('set-row-Drill')).toHaveTextContent('10 soal');
    const draft = screen.getByTestId('sub-2.1.4');
    expect(within(draft).getByText('Draf')).toBeInTheDocument();
    expect(within(draft).getByText('3 penghalang')).toBeInTheDocument();
    expect(within(draft).getByTestId('set-row-Drill')).toHaveTextContent('Belum ada');
    expect(screen.getByRole('heading', { name: 'Placement Test' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buka set: Drill' , hidden: false })).toBeTruthy();
  });

  it('galat memuat: kartu galat dengan Coba lagi; tiers kosong: pesan', async () => {
    mockFetch(() => ({ status: 500, body: errorBody('INTERNAL_ERROR', 'x') }));
    const { unmount } = renderWithProviders(<CurriculumPanel />);
    expect(await screen.findByText('Kurikulum gagal dimuat')).toBeInTheDocument();
    unmount();
    mockFetch(() => ok({ tiers: [], placement: null }));
    renderWithProviders(<CurriculumPanel />);
    expect(await screen.findByText('Belum ada konten. Impor konten lebih dulu.')).toBeInTheDocument();
  });

  it('respons yang menyimpang dari kontrak (status tak dikenal) menjadi galat, tidak ditambal', async () => {
    const bad = structuredClone(curriculum);
    (bad.tiers[0]!.modules[0]!.sub_modules[0] as { status: string }).status = 'LIVE';
    mockFetch(() => ok(bad));
    renderWithProviders(<CurriculumPanel />);
    expect(await screen.findByText('Kurikulum gagal dimuat')).toBeInTheDocument();
  });

  it('SetRef.origin AI pada set kurikulum langsung memunculkan konfirmasi reviu (tanpa menunggu 409)', async () => {
    const ai = structuredClone(curriculum);
    (ai.tiers[0]!.skip_set as { origin?: string }).origin = 'AI_GENERATED_REVIEWED';
    const calls = mockFetch((url, init) => {
      if (url.pathname === '/api/v1/admin/curriculum') return ok(ai);
      return { status: 404, body: errorBody('NOT_FOUND', `${init.method} ${url.pathname}`) };
    });
    renderWithProviders(<CurriculumPanel />);
    await screen.findByTestId('sub-2.1.4');
    const buttons = await screen.findAllByRole('button', { name: 'Ubah status: Uji Kompetensi' });
    fireEvent.click(buttons[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Status baru'), { target: { value: 'PUBLISHED' } });
    expect(within(dialog).getByRole('checkbox', { name: 'Saya telah meninjau konten buatan AI ini' })).toBeInTheDocument();
    expect(calls.some((c) => c.url.pathname.endsWith('/status'))).toBe(false);
  });

  it('ubah status sub-modul AI: PUBLISHED wajib centang konfirmasi reviu, body memuat confirm_reviewed', async () => {
    const calls = serveCurriculum((url, init) =>
      url.pathname === `/api/v1/admin/sub-modules/${SUB2}/status` && init.method === 'POST'
        ? ok({ id: SUB2, entity: 'sub-modules', status: 'PUBLISHED', reviewed_at: null })
        : undefined,
    );
    // SUB2 berstatus DRAFT dengan origin ORIGINAL; ubah origin jadi AI agar K2 berlaku.
    const ai = structuredClone(curriculum);
    (ai.tiers[0]!.modules[0]!.sub_modules[1] as { origin: string }).origin = 'AI_GENERATED_REVIEWED';
    mockFetch((url, init) => {
      if (url.pathname === '/api/v1/admin/curriculum') return ok(ai);
      if (url.pathname === `/api/v1/admin/sub-modules/${SUB2}/status`) {
        calls.push({ url, init, json: JSON.parse(String(init.body)) });
        return ok({ id: SUB2, entity: 'sub-modules', status: 'PUBLISHED', reviewed_at: null });
      }
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
    renderWithProviders(<CurriculumPanel />);
    const row = await screen.findByTestId('sub-2.1.4');
    fireEvent.click(within(row).getByRole('button', { name: /Ubah status: 2\.1\.4 Conditionals/ }));
    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText('Status baru');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Direviu', 'Terpublikasi']);
    fireEvent.change(select, { target: { value: 'PUBLISHED' } });
    const submit = within(dialog).getByRole('button', { name: 'Ubah status' });
    expect(submit).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Saya telah meninjau konten buatan AI ini' }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/status'))).toBe(true));
    const post = calls.find((c) => c.url.pathname.endsWith('/status'))!;
    expect(post.json).toEqual({ status: 'PUBLISHED', confirm_reviewed: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('PUBLISH_BLOCKED 409: daftar penghalang bertaut ke aset ditampilkan di dialog', async () => {
    mockFetch((url, init) => {
      if (url.pathname === '/api/v1/admin/curriculum') return ok(curriculum);
      if (url.pathname === `/api/v1/admin/sub-modules/${SUB2}/status` && init.method === 'POST') {
        return {
          status: 409,
          body: {
            error: {
              code: 'PUBLISH_BLOCKED',
              message: 'x',
              request_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a',
              details: [{ path: `SUB_MODULE:${SUB2}`, code: 'ASSET_UNVERIFIED', message: `asset ${ASSET} (tier2/video)` }],
            },
          },
        };
      }
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
    renderWithProviders(<CurriculumPanel />);
    const row = await screen.findByTestId('sub-2.1.4');
    fireEvent.click(within(row).getByRole('button', { name: /Ubah status: 2\.1\.4/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Status baru'), { target: { value: 'PUBLISHED' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ubah status' }));
    const list = await within(dialog).findByTestId('publish-blockers');
    expect(within(list).getByText('Aset belum diverifikasi lisensinya')).toBeInTheDocument();
    expect(within(list).getByText(`asset ${ASSET} (tier2/video)`)).toBeInTheDocument();
    expect(within(list).getByRole('link')).toHaveAttribute('href', '/admin/konten/aset?belum=1');
    expect(dialog).toBeInTheDocument();
  });

  it('REVIEW_CONFIRMATION_REQUIRED dari server (set tanpa origin di daftar) memunculkan kotak centang lalu berhasil', async () => {
    let attempt = 0;
    mockFetch((url, init) => {
      if (url.pathname === '/api/v1/admin/curriculum') return ok(curriculum);
      if (url.pathname === `/api/v1/admin/assessment-sets/${DRILL}/status` && init.method === 'POST') {
        attempt += 1;
        if (attempt === 1) return { status: 409, body: errorBody('REVIEW_CONFIRMATION_REQUIRED', 'x') };
        expect(JSON.parse(String(init.body))).toEqual({ status: 'DRAFT' });
        return ok({ id: DRILL, entity: 'assessment-sets', status: 'DRAFT', reviewed_at: null });
      }
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
    renderWithProviders(<CurriculumPanel />);
    const row = await screen.findByTestId('sub-2.1.3');
    fireEvent.click(within(within(row).getByTestId('set-row-Drill')).getByRole('button', { name: /Ubah status/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Status baru'), { target: { value: 'ARCHIVED' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ubah status' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Konten buatan AI wajib dikonfirmasi');
    // Sudah dikonfirmasi server: kotak centang hanya relevan untuk PUBLISHED; pindah ke Draf lalu ulangi.
    fireEvent.change(within(dialog).getByLabelText('Status baru'), { target: { value: 'DRAFT' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ubah status' }));
    await waitFor(() => expect(attempt).toBe(2));
  });

  it('INVALID_STATUS_TRANSITION dari server ditampilkan sebagai pesan Indonesia', async () => {
    mockFetch((url, init) => {
      if (url.pathname === '/api/v1/admin/curriculum') return ok(curriculum);
      if (url.pathname.endsWith('/status') && init.method === 'POST') return { status: 409, body: errorBody('INVALID_STATUS_TRANSITION', 'x') };
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
    renderWithProviders(<CurriculumPanel />);
    const row = await screen.findByTestId('module-2.1');
    fireEvent.click(within(row).getByRole('button', { name: /Ubah status: Modul 2\.1/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ubah status' }));
    expect(await within(dialog).findByText('Perpindahan status ini tidak diizinkan.')).toBeInTheDocument();
  });

  it('sheet sub-modul: hanya field yang berubah dikirim; terpublikasi meminta konfirmasi; mahkota tidak disentuh', async () => {
    const calls = serveCurriculum((url, init) => {
      if (url.pathname === `/api/v1/admin/sub-modules/${SUB}` && init.method === 'PATCH') {
        return ok({ id: SUB, sub_module_code: '2.1.3', title: 'Passive Voice', order_index: 3, passing_score_percent: 80, status: 'PUBLISHED', content_version: 3 });
      }
      return undefined;
    });
    renderWithProviders(<CurriculumPanel />);
    const row = await screen.findByTestId('sub-2.1.3');
    fireEvent.click(within(row).getByRole('button', { name: 'Sunting' }));
    const sheet = await screen.findByTestId('sub-module-sheet');
    // Penghalang, aset baca-saja, dan pratinjau artikel aman.
    expect(await within(sheet).findByText('Aset belum diverifikasi lisensinya')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Buka aset: Video pasif' })).toHaveAttribute('href', `/admin/konten/aset?buka=${ASSET}`);
    expect(within(within(sheet).getByTestId('article-preview')).getByRole('heading', { name: 'Passive' })).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('Ambang lulus (%)'), { target: { value: '80' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Simpan perubahan' }));
    const confirm = await screen.findByText('Simpan perubahan pada konten terpublikasi?');
    expect(confirm).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'PATCH')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true));
    const patches = calls.filter((c) => c.init.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0]!.url.pathname).toBe(`/api/v1/admin/sub-modules/${SUB}`);
    expect(patches[0]!.json).toEqual({ passing_score_percent: 80 });
  });

  it('sheet sub-modul: validasi klien (ambang 101) menahan permintaan dan menandai field', async () => {
    const calls = serveCurriculum();
    renderWithProviders(<CurriculumPanel />);
    const row = await screen.findByTestId('sub-2.1.3');
    fireEvent.click(within(row).getByRole('button', { name: 'Sunting' }));
    const sheet = await screen.findByTestId('sub-module-sheet');
    await within(sheet).findByLabelText('Judul');
    fireEvent.change(within(sheet).getByLabelText('Ambang lulus (%)'), { target: { value: '101' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Simpan perubahan' }));
    expect(await within(sheet).findByText('Nilai di luar rentang yang diizinkan.')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Ambang lulus (%)')).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((c) => c.init.method === 'PATCH')).toBe(false);
  });

  it('galat server per field: ORDER_INDEX_TAKEN dan raw_html_not_allowed dipetakan ke field', async () => {
    mockFetch((url, init) => {
      if (url.pathname === '/api/v1/admin/curriculum') return ok({ ...curriculum, tiers: [{ ...curriculum.tiers[0]!, modules: [{ ...curriculum.tiers[0]!.modules[0]!, sub_modules: [{ ...curriculum.tiers[0]!.modules[0]!.sub_modules[1]! }] }] }] });
      if (url.pathname === `/api/v1/admin/sub-modules/${SUB2}` && init.method === 'GET') {
        return ok(subDetail({ sub_module: { ...subDetail().sub_module, id: SUB2, sub_module_code: '2.1.4', status: 'DRAFT' } }, 'DRAFT'));
      }
      if (url.pathname === `/api/v1/admin/sub-modules/${SUB2}` && init.method === 'PATCH') return { status: 409, body: errorBody('ORDER_INDEX_TAKEN', 'x') };
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
    renderWithProviders(<CurriculumPanel />);
    fireEvent.click(within(await screen.findByTestId('sub-2.1.4')).getByRole('button', { name: 'Sunting' }));
    const sheet = await screen.findByTestId('sub-module-sheet');
    await within(sheet).findByLabelText('Nomor urut');
    fireEvent.change(within(sheet).getByLabelText('Nomor urut'), { target: { value: '1' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Simpan perubahan' }));
    expect(await within(sheet).findByText('Nomor urut sudah dipakai item lain di induk yang sama.')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Nomor urut')).toHaveAttribute('aria-invalid', 'true');
  });

  it('menutup sheet dengan perubahan belum disimpan meminta konfirmasi buang', async () => {
    serveCurriculum();
    renderWithProviders(<CurriculumPanel />);
    fireEvent.click(within(await screen.findByTestId('sub-2.1.3')).getByRole('button', { name: 'Sunting' }));
    const sheet = await screen.findByTestId('sub-module-sheet');
    fireEvent.change(await within(sheet).findByLabelText('Judul'), { target: { value: 'Judul baru' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Tutup' }));
    expect(await screen.findByText('Buang perubahan?')).toBeInTheDocument();
    expect(screen.getByTestId('sub-module-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Buang perubahan' }));
    await waitFor(() => expect(screen.queryByTestId('sub-module-sheet')).toBeNull());
  });

  it('tanpa perubahan, sheet menutup langsung tanpa konfirmasi', async () => {
    serveCurriculum();
    renderWithProviders(<CurriculumPanel />);
    fireEvent.click(within(await screen.findByTestId('sub-2.1.3')).getByRole('button', { name: 'Sunting' }));
    const sheet = await screen.findByTestId('sub-module-sheet');
    await within(sheet).findByLabelText('Judul');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Tutup' }));
    await waitFor(() => expect(screen.queryByTestId('sub-module-sheet')).toBeNull());
    expect(screen.queryByText('Buang perubahan?')).toBeNull();
  });

  it('tautan "Dipakai oleh": ?sub_modul=<id> menyorot baris dan membuka sheet sunting', async () => {
    window.history.pushState({}, '', `/admin/konten/kurikulum?sub_modul=${SUB}`);
    serveCurriculum();
    renderWithProviders(<CurriculumPanel />);
    const row = await screen.findByTestId('sub-2.1.3');
    expect(row).toHaveAttribute('data-highlighted', 'true');
    expect(await screen.findByTestId('sub-module-sheet')).toBeInTheDocument();
  });

  it('badge penghalang membuka sheet sunting sub-modul tersebut', async () => {
    serveCurriculum((url) =>
      url.pathname === `/api/v1/admin/sub-modules/${SUB2}` ? ok(subDetail({ sub_module: { ...subDetail().sub_module, id: SUB2, sub_module_code: '2.1.4' } })) : undefined,
    );
    renderWithProviders(<CurriculumPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Lihat penghalang: 3 penghalang/ }));
    expect(await screen.findByTestId('sub-module-sheet')).toBeInTheDocument();
  });

  it('sheet modul: kirim hanya field berubah; ORDER_INDEX_TAKEN ditampilkan', async () => {
    const calls = mockFetch((url, init) => {
      if (url.pathname === '/api/v1/admin/curriculum') return ok(curriculum);
      if (url.pathname === `/api/v1/admin/modules/${MOD}` && init.method === 'PATCH') return { status: 409, body: errorBody('ORDER_INDEX_TAKEN', 'x') };
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
    renderWithProviders(<CurriculumPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Sunting: Modul 2\.1/ }));
    const input = await screen.findByLabelText('Nomor urut');
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }));
    expect(await screen.findByText('Nomor urut sudah dipakai item lain di induk yang sama.')).toBeInTheDocument();
    expect(calls.find((c) => c.init.method === 'PATCH')!.json).toEqual({ order_index: 2 });
  });
});

/* ------------------------------------------------------------------ soal */

const MCQ = {
  question_id: 'Q-213-02',
  question_type: 'MCQ_SINGLE',
  skill: 'GRAMMAR',
  prompt: 'Which sentence is correct?',
  explanation_id: 'Bentuk V3 dari grind adalah ground.',
  points: 1,
  target_time_ms: 30000,
  difficulty: 2,
  options: ['The beans is ground.', 'The beans are ground.', 'The beans ground.'],
  correct_answers: ['The beans are ground.'],
};
const FILL = { question_id: 'Q-213-01', question_type: 'FILL_IN_BLANK', skill: 'GRAMMAR', prompt: 'The beans ___ (grind) daily.', explanation_id: 'Pasif.', points: 1, correct_answers: ['are ground'], max_words: 2 };
const WRITE = { question_id: 'Q-213-09', question_type: 'WRITING_TASK', skill: 'WRITING', prompt: 'Describe the process.', explanation_id: null, points: 1, task_kind: 'TASK1' };

const setDetail = (over: Record<string, unknown> = {}) => ({
  id: DRILL,
  assessment_type: 'ACTIVE_DRILL',
  title: 'Drill 2.1.3',
  status: 'DRAFT',
  question_count: 3,
  version: 3,
  origin: 'AI_GENERATED_REVIEWED',
  scope_label: 'Sub-modul 2.1.3',
  updated_at: '2026-11-03T10:00:00.000Z',
  time_limit_seconds: 600,
  pass_percent: 75,
  reading_passage_markdown: null,
  listening_asset_id: null,
  attribution_text: null,
  reviewed_at: null,
  has_active_attempts: false,
  questions: [FILL, MCQ, WRITE],
  blockers: [],
  ...over,
});

const QUALITY = {
  set_id: DRILL,
  questions: [
    { question_id: 'Q-213-01', attempts_count: 46, correct_rate: 0.17, flag: 'TOO_HARD' },
    { question_id: 'Q-213-02', attempts_count: 46, correct_rate: 0.83, flag: null },
    { question_id: 'Q-213-09', attempts_count: 0, correct_rate: 0, flag: null },
  ],
};

function serveSet(extra: (url: URL, init: RequestInit) => ReturnType<Parameters<typeof mockFetch>[0]> | undefined = () => undefined, detail = setDetail()) {
  return mockFetch((url, init) => {
    const custom = extra(url, init);
    if (custom) return custom;
    if (url.pathname === `/api/v1/admin/assessment-sets/${DRILL}` && (init.method ?? 'GET') === 'GET') return ok(detail);
    if (url.pathname === `/api/v1/admin/assessment-sets/${DRILL}/quality`) return ok(QUALITY);
    return { status: 404, body: errorBody('NOT_FOUND', 'x') };
  });
}

describe('SetsPanel', () => {
  const row = { id: DRILL, assessment_type: 'ACTIVE_DRILL', title: 'Drill 2.1.3', status: 'PUBLISHED', question_count: 10, version: 3, origin: 'ORIGINAL_AUTHORED', scope_label: 'Sub-modul 2.1.3', updated_at: '2026-11-03T10:00:00.000Z' };

  it('daftar set: judul bertaut ke halaman set, status, soal, versi; kirim filter ke query', async () => {
    const calls = mockFetch(() => ({ body: { data: [row], meta: meta(1) } }));
    renderWithProviders(<SetsPanel />);
    const link = (await screen.findAllByRole('link', { name: 'Buka set Drill 2.1.3' }))[0]!;
    expect(link).toHaveAttribute('href', `/admin/konten/soal/${DRILL}`);
    expect(screen.getAllByText('Terpublikasi').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'DRAFT' } });
    fireEvent.change(screen.getByLabelText('Tier'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Jenis'), { target: { value: 'TIER_BOSS_EXAM' } });
    await waitFor(() => {
      const last = calls[calls.length - 1]!.url.searchParams;
      expect(last.get('status')).toBe('DRAFT');
      expect(last.get('tier_number')).toBe('2');
      expect(last.get('assessment_type')).toBe('TIER_BOSS_EXAM');
    });
  });

  it('kosong tanpa filter vs kosong terfilter', async () => {
    mockFetch(() => ({ body: { data: [], meta: meta(0) } }));
    renderWithProviders(<SetsPanel />);
    expect(await screen.findByText('Belum ada set soal.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ARCHIVED' } });
    expect(await screen.findByText('Tidak ada set yang cocok dengan filter.')).toBeInTheDocument();
  });
});

describe('SetDetail', () => {
  it('daftar soal dengan badge kualitas TOO_HARD (ikon + teks), normal, dan belum cukup data', async () => {
    serveSet();
    renderWithProviders(<SetDetail setId={DRILL} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Drill 2.1.3' })).toBeInTheDocument();
    expect((await screen.findAllByText('Terlalu sulit')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('17% benar dari 46 jawaban').length).toBeGreaterThan(0);
    expect(screen.getAllByText('83% benar dari 46 jawaban').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Data belum cukup').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Which sentence is correct?').length).toBeGreaterThan(0);
  });

  it('simpan pengaturan set mengirim hanya field berubah; pass_percent kosong -> null', async () => {
    const calls = serveSet((url, init) =>
      url.pathname === `/api/v1/admin/assessment-sets/${DRILL}` && init.method === 'PATCH'
        ? ok({ id: DRILL, title: 'Drill baru', time_limit_seconds: 600, pass_percent: null, version: 4, content_hash: 'abc' })
        : undefined,
    );
    renderWithProviders(<SetDetail setId={DRILL} />);
    fireEvent.change(await screen.findByLabelText('Judul'), { target: { value: 'Drill baru' } });
    fireEvent.change(screen.getByLabelText('Ambang lulus (%)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan pengaturan set' }));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.init.method === 'PATCH')!.json).toEqual({ title: 'Drill baru', pass_percent: null });
  });

  it('teks bacaan hanya muncul untuk set yang punya reading_passage_markdown; batas 4 bagian dipetakan', async () => {
    serveSet(
      (url, init) =>
        url.pathname === `/api/v1/admin/assessment-sets/${DRILL}` && init.method === 'PATCH'
          ? { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'x', request_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a', details: [{ path: 'reading_passage_markdown', code: 'too_many_passages', message: 'x' }] } } }
          : undefined,
      setDetail({ reading_passage_markdown: '===PASSAGE===\nA' }),
    );
    renderWithProviders(<SetDetail setId={DRILL} />);
    const area = await screen.findByLabelText(/Teks bacaan/);
    fireEvent.change(area, { target: { value: '===PASSAGE===\nA\n===PASSAGE===\nB\n===PASSAGE===\nC\n===PASSAGE===\nD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan pengaturan set' }));
    expect(await screen.findByText('Teks bacaan maksimal 3 bagian.')).toBeInTheDocument();
  });

  it('set tanpa teks bacaan tidak menampilkan editor teks bacaan', async () => {
    serveSet();
    renderWithProviders(<SetDetail setId={DRILL} />);
    await screen.findByLabelText('Judul');
    expect(screen.queryByLabelText(/Teks bacaan/)).toBeNull();
  });

  it('sheet soal MCQ: hanya field berubah, jawaban benar mengikuti pilihan, pratinjau memakai QuestionRenderer baca-saja', async () => {
    const calls = serveSet((url, init) =>
      url.pathname.includes('/questions/') && init.method === 'PATCH'
        ? ok({ question: { ...MCQ, prompt: 'Baru' }, set: { id: DRILL, version: 4, content_hash: 'h' } })
        : undefined,
    );
    renderWithProviders(<SetDetail setId={DRILL} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Sunting soal Q-213-02' }))[0]!);
    const sheet = await screen.findByTestId('question-sheet');
    const preview = within(sheet).getByTestId('question-preview');
    expect(preview).toHaveAttribute('inert');
    expect(within(preview).getByText('The beans are ground.')).toBeInTheDocument();
    expect(sheet.querySelector<HTMLInputElement>('#q-correct-1')).toBeChecked();
    fireEvent.change(within(sheet).getByLabelText('Teks soal'), { target: { value: 'Baru' } });
    expect(within(preview).getAllByText('Baru').length).toBeGreaterThan(0);
    fireEvent.click(sheet.querySelector<HTMLInputElement>('#q-correct-2')!);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Simpan soal' }));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.init.method === 'PATCH')!;
    expect(patch.url.pathname).toBe(`/api/v1/admin/assessment-sets/${DRILL}/questions/Q-213-02`);
    expect(patch.json).toEqual({ prompt: 'Baru', correct_answers: ['The beans ground.'] });
    expect(Object.keys(patch.json as object)).not.toContain('question_type');
  });

  it('answer_not_in_options dari server dipetakan ke field jawaban benar, soal tidak ditutup', async () => {
    serveSet((url, init) =>
      url.pathname.includes('/questions/') && init.method === 'PATCH'
        ? { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'x', request_id: '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a', details: [{ path: 'correct_answers[0]', code: 'answer_not_in_options', message: 'x' }] } } }
        : undefined,
    );
    renderWithProviders(<SetDetail setId={DRILL} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Sunting soal Q-213-01' }))[0]!);
    const sheet = await screen.findByTestId('question-sheet');
    fireEvent.change(within(sheet).getByLabelText(/^Jawaban benar/), { target: { value: 'is ground' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Simpan soal' }));
    expect(await within(sheet).findByText('Jawaban benar harus sama persis dengan salah satu opsi.')).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/^Jawaban benar/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('question-sheet')).toBeInTheDocument();
  });

  it('validasi klien: teks soal kosong menahan permintaan', async () => {
    const calls = serveSet();
    renderWithProviders(<SetDetail setId={DRILL} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Sunting soal Q-213-01' }))[0]!);
    const sheet = await screen.findByTestId('question-sheet');
    fireEvent.change(within(sheet).getByLabelText('Teks soal'), { target: { value: '   ' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Simpan soal' }));
    expect(await within(sheet).findByText('Teks soal wajib diisi.')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'PATCH')).toBe(false);
  });

  it('soal Writing: hanya teks soal dan penjelasan yang dapat disunting', async () => {
    serveSet();
    renderWithProviders(<SetDetail setId={DRILL} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Sunting soal Q-213-09' }))[0]!);
    const sheet = await screen.findByTestId('question-sheet');
    expect(within(sheet).getByText(/Soal Writing\/Speaking hanya dapat mengubah/)).toBeInTheDocument();
    expect(within(sheet).queryByLabelText('Poin')).toBeNull();
    expect(within(sheet).getByLabelText('Teks soal')).toBeInTheDocument();
  });

  it('SET_HAS_ACTIVE_ATTEMPTS: banner terkunci, kontrol dinonaktifkan; Coba lagi membuka kembali', async () => {
    serveSet((url, init) =>
      url.pathname.includes('/questions/') && init.method === 'PATCH' ? { status: 409, body: errorBody('SET_HAS_ACTIVE_ATTEMPTS', 'x') } : undefined,
    );
    renderWithProviders(<SetDetail setId={DRILL} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Sunting soal Q-213-01' }))[0]!);
    const sheet = await screen.findByTestId('question-sheet');
    fireEvent.change(within(sheet).getByLabelText('Teks soal'), { target: { value: 'Ubah' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Simpan soal' }));
    expect(await screen.findByTestId('locked-banner')).toHaveTextContent('Set ini memiliki attempt berjalan; penyuntingan dinonaktifkan.');
    expect(within(sheet).getByRole('alert')).toHaveTextContent('penyuntingan dinonaktifkan');
    expect(within(sheet).getByLabelText('Teks soal')).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: 'Simpan soal' })).toBeDisabled();
    fireEvent.click(within(screen.getByTestId('locked-banner')).getByRole('button', { name: 'Coba lagi', hidden: true }));
    expect(screen.queryByTestId('locked-banner')).toBeNull();
  });

  it('has_active_attempts dari server mengunci penyuntingan sejak muat (tanpa menunggu 409)', async () => {
    const calls = serveSet(undefined, setDetail({ has_active_attempts: true }));
    renderWithProviders(<SetDetail setId={DRILL} />);
    expect(await screen.findByTestId('locked-banner')).toHaveTextContent('Set ini memiliki attempt berjalan');
    expect(screen.getByLabelText('Judul')).toBeDisabled();
    expect(calls.some((c) => c.init.method === 'PATCH')).toBe(false);
  });

  it('ubah status set memakai konfirmasi reviu AI bila origin AI', async () => {
    const calls = serveSet((url, init) =>
      url.pathname === `/api/v1/admin/assessment-sets/${DRILL}/status` && init.method === 'POST'
        ? ok({ id: DRILL, entity: 'assessment-sets', status: 'PUBLISHED', reviewed_at: '2026-11-03T14:10:00.000Z' })
        : undefined,
    );
    renderWithProviders(<SetDetail setId={DRILL} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ubah status' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Status baru'), { target: { value: 'PUBLISHED' } });
    expect(within(dialog).getByRole('button', { name: 'Ubah status' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ubah status' }));
    await waitFor(() => expect(calls.some((c) => c.url.pathname.endsWith('/status'))).toBe(true));
    expect(calls.find((c) => c.url.pathname.endsWith('/status'))!.json).toEqual({ status: 'PUBLISHED', confirm_reviewed: true });
  });

  it('set tidak ditemukan: kartu galat dengan tautan kembali', async () => {
    mockFetch(() => ({ status: 404, body: errorBody('NOT_FOUND', 'x') }));
    renderWithProviders(<SetDetail setId={DRILL} />);
    expect(await screen.findByText('Set soal gagal dimuat')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kembali ke daftar set/ })).toHaveAttribute('href', '/admin/konten/soal');
  });

  it('statistik kualitas gagal dimuat tidak menghalangi daftar soal', async () => {
    mockFetch((url) => {
      if (url.pathname.endsWith('/quality')) return { status: 500, body: errorBody('INTERNAL_ERROR', 'x') };
      return ok(setDetail());
    });
    renderWithProviders(<SetDetail setId={DRILL} />);
    expect(await screen.findByText('Statistik kualitas belum dapat dimuat.')).toBeInTheDocument();
    expect(screen.getAllByText('Which sentence is correct?').length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ revisi */

describe('RevisionsPanel', () => {
  const revision = { id: REV, entity_type: 'ASSESSMENT_SET', entity_id: DRILL, version: 3, changed_by_name: 'Admin Utama', import_batch_id: null, created_at: '2026-11-03T10:00:00.000Z' };

  it('?tipe & ?id memuat revisi urut versi, dan Sheet snapshot menampilkan JSON baca-saja', async () => {
    window.history.pushState({}, '', `/admin/konten/revisi?tipe=ASSESSMENT_SET&id=${DRILL}`);
    const calls = mockFetch((url) => {
      if (url.pathname === '/api/v1/admin/content-revisions') return { body: { data: [revision], meta: meta(1) } };
      if (url.pathname === `/api/v1/admin/content-revisions/${REV}`) return ok({ ...revision, snapshot: { title: 'Drill lama', version: 3 } });
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
    renderWithProviders(<RevisionsPanel />);
    expect((await screen.findAllByText('Admin Utama')).length).toBeGreaterThan(0);
    const list = calls.find((c) => c.url.pathname === '/api/v1/admin/content-revisions')!;
    expect(list.url.searchParams.get('entity_type')).toBe('ASSESSMENT_SET');
    expect(list.url.searchParams.get('entity_id')).toBe(DRILL);
    fireEvent.click(screen.getAllByRole('button', { name: 'Lihat snapshot versi 3' })[0]!);
    const pre = await screen.findByTestId('snapshot-json');
    expect(pre).toHaveTextContent('"title": "Drill lama"');
    expect(pre.tagName).toBe('PRE');
  });

  it('ID bukan UUID ditolak di klien; belum memilih menampilkan petunjuk', async () => {
    const calls = mockFetch(() => ({ body: { data: [], meta: meta(0) } }));
    renderWithProviders(<RevisionsPanel />);
    expect(screen.getByText('Pilih jenis entitas dan isi ID untuk melihat revisi.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('ID entitas'), { target: { value: 'bukan-uuid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan revisi' }));
    expect(await screen.findByText('ID harus berupa UUID yang valid.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('kosong: pesan belum ada revisi', async () => {
    mockFetch(() => ({ body: { data: [], meta: meta(0) } }));
    renderWithProviders(<RevisionsPanel />);
    fireEvent.change(screen.getByLabelText('Jenis entitas'), { target: { value: 'SUB_MODULE' } });
    fireEvent.change(screen.getByLabelText('ID entitas'), { target: { value: SUB } });
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan revisi' }));
    expect(await screen.findByText('Belum ada revisi untuk entitas ini.')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ SPEC-018 -> 020 */

describe('"Dipakai oleh" (SPEC-018) menaut ke kurasi', () => {
  it('sub-modul -> kurikulum?sub_modul=<id>; set -> halaman set', async () => {
    mockFetch(() =>
      ok({
        id: ASSET,
        asset_code: 'tier2/video',
        kind: 'VIDEO_EMBED',
        title: 'Video pasif',
        source: { id: '5a5a5a5a-0001-4000-8000-000000000001', code: 'YT', name: 'YouTube', license_type: 'EMBED_TOS' },
        rights_status: 'EMBED_ONLY',
        storage_backend: 'EXTERNAL',
        mime_type: null,
        size_bytes: null,
        duration_sec: null,
        external_url: null,
        external_ref: null,
        attribution_text: null,
        license_verified_at: null,
        license_verified_by_name: null,
        created_at: '2026-11-03T10:00:00.000Z',
        updated_at: '2026-11-03T10:00:00.000Z',
        referenced_by: [
          { entity_type: 'SUB_MODULE', entity_id: SUB, label: '2.1.3 Passive Voice', status: 'DRAFT' },
          { entity_type: 'ASSESSMENT_SET', entity_id: DRILL, label: 'Drill 2.1.3', status: 'DRAFT' },
        ],
      }),
    );
    renderWithProviders(<AssetDetailSheet assetId={ASSET} onClose={() => undefined} />);
    expect(await screen.findByRole('link', { name: 'Buka kurikulum' })).toHaveAttribute('href', `/admin/konten/kurikulum?sub_modul=${SUB}`);
    expect(screen.getByRole('link', { name: 'Buka set soal' })).toHaveAttribute('href', `/admin/konten/soal/${DRILL}`);
  });
});

describe('AssetsPanel menerima tautan dari kurasi', () => {
  it('?belum=1 mencentang filter "belum diverifikasi" dan mengirim rights_status=UNVERIFIED', async () => {
    window.history.pushState({}, '', '/admin/konten/aset?belum=1');
    const calls = mockFetch((url) => (url.pathname === '/api/v1/admin/assets' ? { body: { data: [], meta: meta(0) } } : ok([])));
    const { AssetsPanel } = await import('@/components/admin/assets-panel');
    renderWithProviders(<AssetsPanel />);
    await waitFor(() => expect(calls.some((c) => c.url.pathname === '/api/v1/admin/assets' && c.url.searchParams.get('rights_status') === 'UNVERIFIED')).toBe(true));
    expect(screen.getByRole('checkbox', { name: /belum diverifikasi/i })).toBeChecked();
  });
});
