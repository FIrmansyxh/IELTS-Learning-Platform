import * as React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorBody, mockFetch, renderWithProviders } from '@/components/test-utils';
import { importsApi } from '@/lib/api/imports';
import { uploadMultipart } from '@/lib/api/upload';
import { parseYoutubeUrl } from '@/lib/youtube-url';
import { z } from 'zod';
import { AssetDetailSheet } from './asset-detail-sheet';
import { AssetsPanel, isPublishBlocker } from './assets-panel';
import { ImportsPanel } from './import/imports-panel';
import { Stepper, forcedStep } from './import/import-wizard';
import { buildErrorReportCsv, csvCell, flattenIssues } from './import/issues';
import { StepPublish } from './import/step-publish';
import { buildTree, StepPreview } from './import/step-preview';
import { StepUpload, detectFormat } from './import/step-upload';
import { StepValidate } from './import/step-validate';
import { LicenseBanner } from './license-banner';
import { RightsBadge } from './license-badges';
import { SourceSheet, licenseWarning, storeCopyForbidden } from './sources-panel';
import { UploadAssetSheet } from './upload-asset-sheet';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/admin',
}));

const U1 = 'c1d2e3f4-0002-4000-8000-0000000000a2';
const SRC = '5a5a5a5a-0001-4000-8000-000000000001';
const BATCH = 'ba7c0001-0000-4000-8000-000000000001';
const page = (data: unknown[]) => ({ data, meta: { page: 1, page_size: 20, total: data.length } });

const asset = (over: Record<string, unknown> = {}) => ({
  id: U1,
  asset_code: 'tier2/slides/passive',
  kind: 'SLIDE_IMAGE',
  title: 'Diagram alur pasif',
  source: { id: SRC, code: 'OWN', name: 'Konten orisinal', license_type: 'OWN' },
  rights_status: 'UNVERIFIED',
  storage_backend: 'FILESYSTEM',
  mime_type: 'image/webp',
  size_bytes: 182340,
  duration_sec: null,
  external_url: null,
  external_ref: null,
  attribution_text: null,
  license_verified_at: null,
  license_verified_by_name: null,
  created_at: '2026-11-03T09:00:00.000Z',
  updated_at: '2026-11-03T09:00:00.000Z',
  reference_count: 2,
  ...over,
});

const batch = (over: Record<string, unknown> = {}) => ({
  id: BATCH,
  format: 'JSON',
  csv_kind: null,
  contract_version: '1.1',
  file_name: 'tier2-batch1.json',
  status: 'PREVIEW_READY',
  total_items: 3,
  valid_items: 3,
  invalid_items: 0,
  created_count: 0,
  updated_count: 0,
  skipped_count: 0,
  summary: { warnings: 0, noop: 0, by_kind: {}, last_error: null },
  target_status: null,
  job: null,
  created_at: '2026-11-03T13:00:00.000Z',
  validated_at: '2026-11-03T13:01:00.000Z',
  published_at: null,
  ...over,
});

const item = (row: number, over: Record<string, unknown> = {}) => ({
  row_number: row,
  entity_kind: 'SUB_MODULE',
  entity_code: '2.1.3',
  status: 'VALID',
  action: 'CREATE',
  errors: [],
  content_hash: 'abc',
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
  push.mockReset();
});

describe('helper impor', () => {
  it('csvCell memberi awalan kutip pada sel berbahaya dan mengutip koma/kutip', () => {
    expect(csvCell('=cmd|calc')).toBe("'=cmd|calc");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('ia berkata "hai"')).toBe('"ia berkata ""hai"""');
    expect(csvCell(null)).toBe('');
  });

  it('laporan galat memuat baris, path, kode, tingkat, dan pesan Indonesia', () => {
    const issues = flattenIssues([
      item(2, {
        status: 'INVALID',
        errors: [
          { path: 'a.b', code: 'answer_not_in_options', message: 'Jawaban benar harus salah satu opsi.', severity: 'error' },
          { path: 'x', code: 'formula_injection', message: '=HYPERLINK("x")', severity: 'error' },
        ],
      }) as never,
    ]);
    const csv = buildErrorReportCsv(issues);
    expect(csv).toContain('baris,entitas,path,kode,tingkat,pesan');
    expect(csv).toContain('2,2.1.3,a.b,answer_not_in_options,error,Jawaban benar harus salah satu opsi.');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('buildTree mengelompokkan Tier > Modul > Sub-Modul dan memisahkan set/soal', () => {
    const tree = buildTree([
      item(1, { entity_kind: 'MODULE', entity_code: '2.1' }),
      item(2, { entity_code: '2.1.3' }),
      item(3, { entity_code: '1.2.1' }),
      item(4, { entity_kind: 'ASSESSMENT_SET', entity_code: 'SKIP_MODULE_TEST:2.1' }),
    ] as never);
    expect(tree.tiers.map((t) => t.tier)).toEqual(['1', '2']);
    expect(tree.tiers[1]!.modules[0]![1].module?.row_number).toBe(1);
    expect(tree.tiers[1]!.modules[0]![1].subs).toHaveLength(1);
    expect(tree.other).toHaveLength(1);
  });

  it('detectFormat, forcedStep, parseYoutubeUrl', () => {
    expect(detectFormat('Data.JSON')).toBe('JSON');
    expect(detectFormat('soal.csv')).toBe('CSV');
    expect(detectFormat('data.xlsx')).toBeNull();
    expect(forcedStep(null)).toBe(1);
    expect(forcedStep('VALIDATING')).toBe(2);
    expect(forcedStep('PREVIEW_READY')).toBeNull();
    expect(forcedStep('PUBLISHING')).toBe(4);
    expect(parseYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ hostAllowed: true, videoId: 'dQw4w9WgXcQ' });
    expect(parseYoutubeUrl('https://youtu.be/dQw4w9WgXcQ').videoId).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeUrl('https://evil.example/x').hostAllowed).toBe(false);
    expect(parseYoutubeUrl('http://www.youtube.com/watch?v=dQw4w9WgXcQ').hostAllowed).toBe(false);
  });

  it('aturan sumber: tautan-saja dan embed dilarang menyimpan salinan', () => {
    expect(storeCopyForbidden('LINK_ONLY_COPYRIGHTED')).toBe(true);
    expect(storeCopyForbidden('EMBED_TOS')).toBe(true);
    expect(storeCopyForbidden('CC_BY')).toBe(false);
    expect(licenseWarning('CC_BY_NC')).toBe('Sumber CC BY-NC hanya untuk penggunaan non-komersial.');
    expect(licenseWarning('LINK_ONLY_COPYRIGHTED')).toBe('Sumber tautan-saja tidak boleh disimpan salinannya.');
    expect(licenseWarning('OWN')).toBeNull();
  });
});

describe('uploadMultipart', () => {
  class FakeXhr {
    static last: FakeXhr;
    status = 0;
    responseText = '';
    responseType = '';
    upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    method = '';
    url = '';
    constructor() {
      FakeXhr.last = this;
    }
    open(m: string, u: string) {
      this.method = m;
      this.url = u;
    }
    setRequestHeader() {}
    getResponseHeader() {
      return null;
    }
    send() {}
    abort() {
      this.onabort?.();
    }
  }

  it('melaporkan progres dan mengurai respons sukses', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const progress: number[] = [];
    const p = uploadMultipart('/admin/assets', new FormData(), z.object({ data: z.object({ ok: z.boolean() }) }), {
      onProgress: (n) => progress.push(n),
    });
    FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
    FakeXhr.last.status = 201;
    FakeXhr.last.responseText = JSON.stringify({ data: { ok: true } });
    FakeXhr.last.onload?.();
    await expect(p).resolves.toEqual({ data: { ok: true } });
    expect(progress).toEqual([50]);
    expect(FakeXhr.last.method).toBe('POST');
    expect(FakeXhr.last.url).toBe('/api/v1/admin/assets');
    vi.unstubAllGlobals();
  });

  it('memetakan envelope galat ke ApiError', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const p = uploadMultipart('/admin/assets', new FormData(), z.object({}));
    FakeXhr.last.status = 409;
    FakeXhr.last.responseText = JSON.stringify(
      errorBody('DUPLICATE_ASSET', 'dup', [{ path: 'file', code: 'duplicate_of', message: U1 }]),
    );
    FakeXhr.last.onload?.();
    await expect(p).rejects.toMatchObject({ code: 'DUPLICATE_ASSET', status: 409 });
    vi.unstubAllGlobals();
  });
});

describe('badge dan banner lisensi', () => {
  it('RightsBadge selalu ikon + teks', () => {
    render(<RightsBadge status="UNVERIFIED" />);
    expect(screen.getByText('Belum diverifikasi')).toBeInTheDocument();
  });

  it('banner menampilkan penghalang publikasi dan sumber non-komersial', async () => {
    mockFetch(() => ({
      body: {
        data: {
          assets_by_rights_status: { UNVERIFIED: 3 },
          publish_blockers: 3,
          non_commercial_sources_in_use: ['OPENLEARN'],
          share_alike_sources_in_use: [],
        },
      },
    }));
    renderWithProviders(<LicenseBanner />);
    expect(await screen.findByText('3 aset belum diverifikasi menghalangi publikasi.')).toBeInTheDocument();
    expect(screen.getByText('Sumber non-komersial dipakai: OPENLEARN. Jangan dikomersialkan.')).toBeInTheDocument();
  });

  it('mode importer hanya menampilkan banner non-komersial', async () => {
    mockFetch(() => ({
      body: {
        data: {
          assets_by_rights_status: {},
          publish_blockers: 5,
          non_commercial_sources_in_use: ['OPENLEARN'],
          share_alike_sources_in_use: [],
        },
      },
    }));
    renderWithProviders(<LicenseBanner nonCommercialOnly />);
    expect(await screen.findByText(/Sumber non-komersial dipakai/)).toBeInTheDocument();
    expect(screen.queryByText(/menghalangi publikasi/)).not.toBeInTheDocument();
  });
});

describe('SourceSheet', () => {
  it('menampilkan peringatan lisensi dan mengirim sumber valid', async () => {
    const calls = mockFetch((url, init) => {
      if (init.method === 'POST') return { status: 201, body: { data: {} } };
      return { body: { data: [] } };
    });
    renderWithProviders(<SourceSheet open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Kode sumber'), { target: { value: 'OPENLEARN_X' } });
    fireEvent.change(screen.getByLabelText('Nama sumber'), { target: { value: 'OpenLearn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan sumber' }));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.init.method === 'POST')!;
    expect(post.url.pathname).toBe('/api/v1/admin/content-sources');
    expect(post.json).toMatchObject({ code: 'OPENLEARN_X', name: 'OpenLearn', license_type: 'OWN', may_store_copy: false });
  });

  it('kode sumber tidak valid ditolak di klien', async () => {
    const calls = mockFetch(() => ({ body: { data: [] } }));
    renderWithProviders(<SourceSheet open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Kode sumber'), { target: { value: 'kecil' } });
    fireEvent.change(screen.getByLabelText('Nama sumber'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan sumber' }));
    expect(await screen.findByText(/Kode harus huruf besar/)).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false);
  });

  it('SOURCE_CODE_TAKEN tampil pada field kode', async () => {
    mockFetch((_u, init) =>
      init.method === 'POST' ? { status: 409, body: errorBody('SOURCE_CODE_TAKEN', 'x') } : { body: { data: [] } },
    );
    renderWithProviders(<SourceSheet open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Kode sumber'), { target: { value: 'OWN' } });
    fireEvent.change(screen.getByLabelText('Nama sumber'), { target: { value: 'Dup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan sumber' }));
    expect(await screen.findByText('Kode sumber sudah dipakai. Gunakan kode lain.')).toBeInTheDocument();
  });
});

describe('AssetsPanel', () => {
  it('menandai aset UNVERIFIED yang dirujuk dengan teks "Menghalangi publikasi"', async () => {
    mockFetch((url) => {
      if (url.pathname.endsWith('/license-summary'))
        return { body: { data: { assets_by_rights_status: {}, publish_blockers: 0, non_commercial_sources_in_use: [], share_alike_sources_in_use: [] } } };
      if (url.pathname.endsWith('/content-sources')) return { body: { data: [] } };
      return {
        body: page([
          asset(),
          asset({ id: 'c1d2e3f4-0002-4000-8000-0000000000a3', title: 'Yatim', reference_count: 0 }),
          asset({ id: 'c1d2e3f4-0002-4000-8000-0000000000a4', title: 'Terverifikasi', rights_status: 'OWN_ORIGINAL', reference_count: 4 }),
        ]),
      };
    });
    renderWithProviders(<AssetsPanel />);
    expect(await screen.findAllByText('Diagram alur pasif')).not.toHaveLength(0);
    expect(screen.getAllByText('Menghalangi publikasi')).toHaveLength(2); // tabel + kartu mobile, hanya untuk satu aset
    expect(screen.getAllByText('Yatim').length).toBeGreaterThan(0);
    expect(isPublishBlocker({ rights_status: 'UNVERIFIED', reference_count: 0 })).toBe(false);
    expect(isPublishBlocker({ rights_status: 'OWN_ORIGINAL', reference_count: 3 })).toBe(false);
  });

  it('pesan kosong saat belum ada aset', async () => {
    mockFetch((url) =>
      url.pathname.endsWith('/license-summary')
        ? { body: { data: { assets_by_rights_status: {}, publish_blockers: 0, non_commercial_sources_in_use: [], share_alike_sources_in_use: [] } } }
        : url.pathname.endsWith('/content-sources')
          ? { body: { data: [] } }
          : { body: page([]) },
    );
    renderWithProviders(<AssetsPanel />);
    expect(await screen.findByText('Belum ada aset. Unggah aset pertama Anda.')).toBeInTheDocument();
  });

  it('galat memuat menampilkan Coba lagi', async () => {
    mockFetch((url) =>
      url.pathname.endsWith('/content-sources')
        ? { body: { data: [] } }
        : url.pathname.endsWith('/license-summary')
          ? { status: 500, body: errorBody('INTERNAL_ERROR', 'x') }
          : { status: 500, body: errorBody('INTERNAL_ERROR', 'x') },
    );
    renderWithProviders(<AssetsPanel />);
    expect(await screen.findByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});

describe('AssetDetailSheet', () => {
  it('mengubah atribusi mengirim PATCH tanpa dialog konfirmasi status', async () => {
    const calls = mockFetch((url, init) => {
      if (init.method === 'PATCH') return { body: { data: asset() } };
      if (url.pathname.endsWith('/license-summary')) return { body: { data: {} } };
      return { body: { data: { ...asset(), referenced_by: [] } } };
    });
    renderWithProviders(<AssetDetailSheet assetId={U1} onClose={() => {}} />);
    const attr = await screen.findByLabelText('Teks atribusi');
    fireEvent.change(attr, { target: { value: 'Sumber: Saya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan status' }));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.init.method === 'PATCH')!.json).toEqual({ attribution_text: 'Sumber: Saya' });
  });

  it('tombol Hapus disabled bila aset dirujuk, dengan alasan', async () => {
    mockFetch(() => ({
      body: {
        data: {
          ...asset(),
          referenced_by: [{ entity_type: 'SUB_MODULE', entity_id: SRC, label: '2.1.3 Passive Voice', status: 'DRAFT' }],
        },
      },
    }));
    renderWithProviders(<AssetDetailSheet assetId={U1} onClose={() => {}} />);
    expect(await screen.findByText(/2\.1\.3 Passive Voice/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hapus' })).toBeDisabled();
    expect(screen.getByText('Aset yang dirujuk konten tidak dapat dihapus.')).toBeInTheDocument();
  });

  it('galat ASSET_IN_USE saat hapus ditampilkan', async () => {
    mockFetch((_u, init) =>
      init.method === 'DELETE'
        ? { status: 409, body: errorBody('ASSET_IN_USE', 'x') }
        : { body: { data: { ...asset(), referenced_by: [] } } },
    );
    renderWithProviders(<AssetDetailSheet assetId={U1} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Hapus' }));
    const dialog = await screen.findByRole('dialog', { name: 'Hapus aset?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hapus' }));
    expect(await screen.findByText('Aset ini masih dipakai konten sehingga tidak dapat dihapus.')).toBeInTheDocument();
  });
});

describe('UploadAssetSheet', () => {
  function setup(sources = [{ id: SRC, code: 'OWN', name: 'Konten orisinal', license_type: 'OWN', may_store_copy: true }]) {
    mockFetch(() => ({
      body: {
        data: sources.map((s) => ({
          url: null,
          license_note: null,
          attribution_template: null,
          share_alike: false,
          non_commercial_only: false,
          asset_count: 0,
          ...s,
        })),
      },
    }));
    return renderWithProviders(<UploadAssetSheet open onOpenChange={() => {}} />);
  }

  it('menolak berkas melebihi batas jenis di klien', async () => {
    setup();
    const file = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(screen.getByTestId('asset-file-input'), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'Besar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unggah' }));
    expect(await screen.findByText(/melebihi batas 5 MB/)).toBeInTheDocument();
  });

  it('judul dan berkas wajib', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Unggah' }));
    expect(await screen.findByText('Judul wajib diisi (maksimal 200 karakter).')).toBeInTheDocument();
    expect(screen.getByText('Pilih satu berkas.')).toBeInTheDocument();
  });

  it('menampilkan petunjuk bila tidak ada sumber yang boleh disimpan salinannya', async () => {
    setup([{ id: SRC, code: 'CAMBRIDGE_REF', name: 'Ref', license_type: 'LINK_ONLY_COPYRIGHTED', may_store_copy: false }]);
    expect(await screen.findByText(/Belum ada sumber yang boleh disimpan salinannya/)).toBeInTheDocument();
  });

  it('sumber wajib dipilih sebelum unggah', async () => {
    setup();
    await screen.findByText('Jenis aset');
    fireEvent.change(screen.getByTestId('asset-file-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    fireEvent.change(screen.getByLabelText('Judul'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unggah' }));
    expect(await screen.findByText('Pilih sumber.')).toBeInTheDocument();
  });
});

describe('ImportsPanel', () => {
  it('menampilkan riwayat dengan aksi sesuai status', async () => {
    mockFetch(() => ({
      body: page([
        batch({ id: BATCH, status: 'PREVIEW_READY' }),
        batch({ id: 'ba7c0001-0000-4000-8000-000000000002', file_name: 'terbit.json', status: 'PUBLISHED' }),
        batch({ id: 'ba7c0001-0000-4000-8000-000000000003', file_name: 'batal.csv', format: 'CSV', csv_kind: 'QUESTIONS', status: 'CANCELLED' }),
      ]),
    }));
    renderWithProviders(<ImportsPanel />);
    expect((await screen.findAllByText('Siap ditinjau')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Lanjutkan: tier2-batch1.json' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Batalkan: tier2-batch1.json' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Kembalikan (Rollback): terbit.json' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Kembalikan \(Rollback\): batal.csv/ })).not.toBeInTheDocument();
  });

  it('kosong: Belum ada impor.', async () => {
    mockFetch(() => ({ body: page([]) }));
    renderWithProviders(<ImportsPanel />);
    expect(await screen.findByText('Belum ada impor.')).toBeInTheDocument();
  });

  it('rollback ditahan menampilkan entitas penahan', async () => {
    mockFetch((_u, init) =>
      init.method === 'POST'
        ? { status: 409, body: errorBody('ROLLBACK_BLOCKED', 'x', [{ path: '2.1.3', code: 'has_user_data', message: 'Sudah ada attempt.' }]) }
        : { body: page([batch({ status: 'PUBLISHED' })]) },
    );
    renderWithProviders(<ImportsPanel />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Kembalikan \(Rollback\)/ }))[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kembalikan' }));
    expect(await screen.findByText('Pengembalian ditolak')).toBeInTheDocument();
    expect(screen.getByText(/Sudah ada attempt\./)).toBeInTheDocument();
  });
});

describe('Stepper', () => {
  it('menandai langkah aktif dengan aria-current="step"', () => {
    render(<Stepper current={3} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
  });
});

describe('StepUpload', () => {
  it('menolak ekstensi selain .json/.csv dan berkas > 5 MB', () => {
    renderWithProviders(<StepUpload />);
    fireEvent.change(screen.getByTestId('import-file-input'), {
      target: { files: [new File(['x'], 'data.xlsx')] },
    });
    expect(screen.getByText('Hanya berkas .json atau .csv yang diterima.')).toBeInTheDocument();
    const big = new File(['x'], 'big.json');
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [big] } });
    expect(screen.getByText(/melebihi batas 5 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unggah dan validasi' })).toBeDisabled();
  });

  it('menyediakan unduhan templat JSON dan CSV', () => {
    renderWithProviders(<StepUpload />);
    expect(screen.getByRole('link', { name: 'Unduh templat JSON' })).toHaveAttribute(
      'href',
      '/api/v1/admin/import-templates/content-package',
    );
    expect(screen.getByRole('link', { name: 'Unduh templat CSV' })).toHaveAttribute(
      'href',
      '/api/v1/admin/import-templates/questions-csv',
    );
  });

  it('unggah sukses mengarahkan ke wizard batch', async () => {
    vi.spyOn(importsApi, 'upload').mockResolvedValue(batch({ status: 'UPLOADED' }) as never);
    renderWithProviders(<StepUpload />);
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [new File(['{}'], 'paket.json')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Unggah dan validasi' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/admin/impor/${BATCH}`));
  });

  it('IMPORT_FILE_INVALID menampilkan kode dan pesan terbaca', async () => {
    const { ApiError } = await import('@/lib/api/client');
    vi.spyOn(importsApi, 'upload').mockRejectedValue(
      new ApiError({
        status: 400,
        code: 'IMPORT_FILE_INVALID',
        message: 'x',
        details: [{ path: '', code: 'double_bom', message: 'dua bom' }],
      }),
    );
    renderWithProviders(<StepUpload />);
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [new File(['{}'], 'paket.json')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Unggah dan validasi' }));
    expect(await screen.findByText('double_bom')).toBeInTheDocument();
    expect(screen.getByText(/lebih dari satu BOM/)).toBeInTheDocument();
  });

  it('DUPLICATE_BATCH menautkan ke batch yang ada', async () => {
    const { ApiError } = await import('@/lib/api/client');
    vi.spyOn(importsApi, 'upload').mockRejectedValue(
      new ApiError({ status: 409, code: 'DUPLICATE_BATCH', message: 'x', details: [{ path: 'file', code: 'duplicate_of', message: BATCH }] }),
    );
    renderWithProviders(<StepUpload />);
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [new File(['{}'], 'paket.json')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Unggah dan validasi' }));
    const link = await screen.findByRole('link', { name: 'Buka batch yang sudah ada' });
    expect(link).toHaveAttribute('href', `/admin/impor/${BATCH}`);
  });
});

describe('StepValidate', () => {
  const noop = () => {};
  const errItem = item(2, {
    status: 'INVALID',
    action: null,
    errors: [
      { path: 'sub_modules[0].active_drill.questions[1].correct_answers[0]', code: 'answer_not_in_options', message: 'Jawaban benar harus salah satu opsi.', severity: 'error' },
      { path: 'sub_modules[0].materials.videos[0]', code: 'video_unverified', message: 'Video baru akan dibuat dengan status belum diverifikasi.', severity: 'warning' },
    ],
  });

  it('menampilkan tiga kartu, tabel galat (baris/path/kode/tingkat) dan memblokir Lanjut saat ada error', async () => {
    mockFetch(() => ({ body: page([errItem]) }));
    renderWithProviders(
      <StepValidate
        batch={batch({ valid_items: 2, invalid_items: 1, summary: { warnings: 1, noop: 0 } }) as never}
        acknowledged={false}
        onAcknowledge={noop}
        onNext={noop}
        onCancel={noop}
      />,
    );
    expect(await screen.findAllByText('Jawaban benar harus salah satu opsi.')).not.toHaveLength(0);
    expect(screen.getAllByText('(answer_not_in_options)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Error').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Peringatan').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Lanjut ke pratinjau' })).toBeDisabled();
    expect(screen.getByText('Perbaiki error pada berkas lalu unggah ulang untuk melanjutkan.')).toBeInTheDocument();
  });

  it('filter "Hanya error" menyembunyikan peringatan', async () => {
    mockFetch(() => ({ body: page([errItem]) }));
    renderWithProviders(
      <StepValidate
        batch={batch({ invalid_items: 1, summary: { warnings: 1, noop: 0 } }) as never}
        acknowledged={false}
        onAcknowledge={noop}
        onNext={noop}
        onCancel={noop}
      />,
    );
    await screen.findAllByText('Jawaban benar harus salah satu opsi.');
    expect(screen.getAllByText(/Video baru akan dibuat/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hanya error' }));
    expect(screen.queryByText(/Video baru akan dibuat/)).not.toBeInTheDocument();
  });

  it('peringatan butuh centang pengakuan sebelum Lanjut', async () => {
    mockFetch(() => ({ body: page([item(1, { errors: [{ path: 'v', code: 'video_unverified', message: 'Video baru.', severity: 'warning' }] })]) }));
    const onNext = vi.fn();
    function Wrapper() {
      const [ack, setAck] = React.useState(false);
      return (
        <StepValidate
          batch={batch({ summary: { warnings: 1, noop: 0 } }) as never}
          acknowledged={ack}
          onAcknowledge={setAck}
          onNext={onNext}
          onCancel={noop}
        />
      );
    }
    renderWithProviders(<Wrapper />);
    const next = await screen.findByRole('button', { name: 'Lanjut ke pratinjau' });
    expect(next).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Saya memahami peringatan ini' }));
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalled();
  });

  it('VALIDATING menampilkan progres job dan antrean', () => {
    renderWithProviders(
      <StepValidate
        batch={batch({
          status: 'VALIDATING',
          job: { id: BATCH, kind: 'IMPORT_VALIDATE', status: 'QUEUED', stage: null, progress_percent: 0, queue_position: 2, error_code: null, attempt: 0 },
        }) as never}
        acknowledged={false}
        onAcknowledge={noop}
        onNext={noop}
        onCancel={noop}
      />,
    );
    expect(screen.getByText('Menunggu antrean (posisi 2)')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('FAILED menampilkan galat dan tautan unggah ulang', () => {
    renderWithProviders(
      <StepValidate batch={batch({ status: 'FAILED' }) as never} acknowledged={false} onAcknowledge={noop} onNext={noop} onCancel={noop} />,
    );
    expect(screen.getByText('Validasi gagal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unggah berkas baru' })).toHaveAttribute('href', '/admin/impor/baru');
  });
});

describe('StepPreview', () => {
  it('menampilkan pohon dengan badge Baru/Diubah/Tanpa perubahan dan ringkasan', async () => {
    mockFetch(() => ({
      body: page([
        item(1, { entity_kind: 'MODULE', entity_code: '2.1', action: 'NOOP' }),
        item(2, { entity_code: '2.1.3', action: 'CREATE' }),
        item(3, { entity_code: '2.1.4', action: 'UPDATE' }),
      ]),
    }));
    renderWithProviders(<StepPreview batch={batch() as never} onNext={() => {}} onBack={() => {}} />);
    expect(await screen.findByText('Tier 2')).toBeInTheDocument();
    expect(screen.getByText('Modul 2.1')).toBeInTheDocument();
    expect(screen.getByText('Baru')).toBeInTheDocument();
    expect(screen.getByText('Diubah')).toBeInTheDocument();
    expect(screen.getByText('Tanpa perubahan')).toBeInTheDocument();
    expect(screen.getByTestId('preview-summary')).toHaveTextContent('1 dibuat, 1 diperbarui, 1 tanpa perubahan');
  });

  it('membuka pratinjau item baca-saja dengan kunci jawaban', async () => {
    mockFetch((url) => {
      if (/items\/2$/.test(url.pathname)) {
        return {
          body: {
            data: {
              ...item(2),
              payload: {
                sub_module_title: 'Passive Voice',
                materials: { article_markdown: '## Judul Materi\n\nIsi.' },
                active_drill: {
                  questions: [
                    {
                      question_id: 'Q-1',
                      question_type: 'MCQ_SINGLE',
                      prompt: 'Pilih bentuk pasif',
                      options: ['is made', 'makes'],
                      correct_answers: ['is made'],
                      explanation_id: 'Karena objek.',
                      points: 1,
                    },
                  ],
                },
              },
            },
          },
        };
      }
      return { body: page([item(2)]) };
    });
    renderWithProviders(<StepPreview batch={batch() as never} onNext={() => {}} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Pratinjau: Sub-modul 2\.1\.3/ }));
    expect(await screen.findByText('Pilih bentuk pasif')).toBeInTheDocument();
    expect(screen.getByText('Judul Materi')).toBeInTheDocument();
    expect(screen.getByText('Benar')).toBeInTheDocument();
    expect(screen.getAllByText(/Karena objek\./).length).toBeGreaterThan(0);
  });

  it('F-19-05: pratinjau item CSV ({ set_type, scope_code, question }) menampilkan soal', async () => {
    mockFetch((url) =>
      /items\/2$/.test(url.pathname)
        ? {
            body: {
              data: {
                ...item(2),
                payload: {
                  set_type: 'ACTIVE_DRILL',
                  scope_code: '1.99.1',
                  question: { question_id: 'Q-C1', question_type: 'TFNG', prompt: 'Pernyataan CSV', correct_answers: ['True'], explanation_id: 'Karena benar.', points: 1 },
                },
              },
            },
          }
        : { body: page([item(2)]) },
    );
    renderWithProviders(<StepPreview batch={batch() as never} onNext={() => {}} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Pratinjau:/ }));
    expect(await screen.findByText('Pernyataan CSV')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE_DRILL:1.99.1')).toBeInTheDocument();
  });

  it('payload null (dipurge) menampilkan pesan retensi', async () => {
    mockFetch((url) =>
      /items\/2$/.test(url.pathname) ? { body: { data: { ...item(2), payload: null } } } : { body: page([item(2)]) },
    );
    renderWithProviders(<StepPreview batch={batch() as never} onNext={() => {}} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Pratinjau:/ }));
    expect(await screen.findByText(/sudah dihapus sesuai kebijakan retensi/)).toBeInTheDocument();
  });
});

describe('StepPublish', () => {
  const noop = () => {};

  it('opsi Publikasikan nonaktif dengan alasan bila ada peringatan asset_unverified', async () => {
    mockFetch(() => ({
      body: page([item(1, { errors: [{ path: 'a', code: 'asset_unverified', message: 'Aset belum diverifikasi.', severity: 'warning' }] })]),
    }));
    renderWithProviders(
      <StepPublish batch={batch({ summary: { warnings: 1, noop: 0 } }) as never} acknowledged onAcknowledge={noop} onBack={noop} onRollback={noop} />,
    );
    const published = screen.getByRole('radio', { name: /Publikasikan sekarang/ });
    await waitFor(() => expect(published).toBeDisabled());
    expect(screen.getByText(/Tidak tersedia: ada aset yang dirujuk berstatus belum diverifikasi/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Simpan sebagai draf/ })).toBeChecked();
  });

  it('konfirmasi lalu mengirim target dan pengakuan peringatan', async () => {
    const calls = mockFetch((url, init) => {
      if (init.method === 'POST') return { status: 202, body: { data: batch({ status: 'PUBLISHING' }) } };
      return { body: page([item(1, { action: 'CREATE' }), item(2, { action: 'UPDATE' })]) };
    });
    renderWithProviders(
      <StepPublish batch={batch({ summary: { warnings: 1, noop: 0 } }) as never} acknowledged onAcknowledge={noop} onBack={noop} onRollback={noop} />,
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    await screen.findByRole('radio', { name: /Publikasikan sekarang/ });
    fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Terapkan impor ini?' });
    await waitFor(() => expect(within(dialog).getByText(/1 dibuat, 1 diperbarui, 0 tanpa perubahan\. Target: draf\./)).toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ya, terapkan' }));
    await waitFor(() => expect(calls.some((c) => c.init.method === 'POST')).toBe(true));
    const post = calls.find((c) => c.init.method === 'POST')!;
    expect(post.url.pathname).toBe(`/api/v1/admin/import-batches/${BATCH}/publish`);
    expect(post.json).toEqual({ target_status: 'DRAFT', acknowledge_warnings: true });
  });

  it('REVIEW_CONFIRMATION_REQUIRED (batch memuat konten AI): kotak reviu muncul, wajib dicentang, lalu mengirim confirm_reviewed', async () => {
    let posts = 0;
    const calls = mockFetch((url, init) => {
      if (init.method === 'POST') {
        posts += 1;
        if (posts === 1) return { status: 409, body: errorBody('REVIEW_CONFIRMATION_REQUIRED', 'x') };
        return { status: 202, body: { data: batch({ status: 'PUBLISHING' }) } };
      }
      return { body: page([item(1, { action: 'CREATE' })]) };
    });
    renderWithProviders(<StepPublish batch={batch() as never} acknowledged={false} onAcknowledge={noop} onBack={noop} onRollback={noop} />);
    const published = await screen.findByRole('radio', { name: /Publikasikan sekarang/ });
    await waitFor(() => expect(published).toBeEnabled());
    fireEvent.click(published);
    expect(screen.queryByTestId('ai-review-confirm')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
    let dialog = await screen.findByRole('dialog', { name: 'Terapkan impor ini?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ya, terapkan' }));
    const box = await screen.findByRole('checkbox', { name: /Saya telah meninjau konten buatan AI/ });
    expect(calls.find((c) => c.init.method === 'POST')!.json).toEqual({ target_status: 'PUBLISHED', acknowledge_warnings: false });
    expect(screen.getByRole('button', { name: 'Publikasikan' })).toBeDisabled();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'Publikasikan' }));
    dialog = await screen.findByRole('dialog', { name: 'Terapkan impor ini?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ya, terapkan' }));
    await waitFor(() => expect(calls.filter((c) => c.init.method === 'POST')).toHaveLength(2));
    expect(calls.filter((c) => c.init.method === 'POST')[1]!.json).toEqual({ target_status: 'PUBLISHED', acknowledge_warnings: false, confirm_reviewed: true });
  });

  it('PUBLISH_BLOCKED menampilkan daftar penghalang dengan tautan ke aset', async () => {
    mockFetch(() => ({ body: page([item(1)]) }));
    renderWithProviders(
      <StepPublish
        batch={batch({
          summary: {
            warnings: 0,
            noop: 0,
            last_error: {
              code: 'PUBLISH_BLOCKED',
              message: 'ditahan',
              blockers: [{ code: 'ASSET_UNVERIFIED', asset_code: 'tier2/slides/passive', message: 'Aset belum diverifikasi.' }],
            },
          },
        }) as never}
        acknowledged={false}
        onAcknowledge={noop}
        onBack={noop}
        onRollback={noop}
      />,
    );
    expect(screen.getByText('Publikasi ditahan')).toBeInTheDocument();
    expect(screen.getByText('ASSET_UNVERIFIED')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'tier2/slides/passive' })).toHaveAttribute('href', '/admin/konten/aset');
  });

  it('PUBLISHED menampilkan hasil, tautan kurasi, dan tombol rollback', () => {
    const onRollback = vi.fn();
    renderWithProviders(
      <StepPublish
        batch={batch({ status: 'PUBLISHED', created_count: 5, updated_count: 2, skipped_count: 1 }) as never}
        acknowledged={false}
        onAcknowledge={noop}
        onBack={noop}
        onRollback={onRollback}
      />,
    );
    expect(screen.getByTestId('publish-result')).toHaveTextContent('5 dibuat, 2 diperbarui, 1 tanpa perubahan.');
    expect(screen.getByRole('link', { name: 'Buka kurasi konten' })).toHaveAttribute('href', '/admin/konten/kurikulum');
    fireEvent.click(screen.getByRole('button', { name: 'Kembalikan (Rollback)' }));
    expect(onRollback).toHaveBeenCalled();
  });

  it('PUBLISHING menampilkan progres job', () => {
    renderWithProviders(
      <StepPublish
        batch={batch({
          status: 'PUBLISHING',
          job: { id: BATCH, kind: 'IMPORT_PUBLISH', status: 'RUNNING', stage: null, progress_percent: 40, queue_position: null, error_code: null, attempt: 1 },
        }) as never}
        acknowledged={false}
        onAcknowledge={noop}
        onBack={noop}
        onRollback={noop}
      />,
    );
    expect(screen.getByText('Menerapkan impor')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
  });
});
