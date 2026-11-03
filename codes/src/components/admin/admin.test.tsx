import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import { HealthGrid, workerState } from './health-cards';
import { SecretDialog } from './dialogs';
import { UsersPanel } from './users-panel';
import { InvitesPanel } from './invites-panel';
import { SettingsPanel, groupSettings } from './settings-panel';
import { buildAuditParams } from './audit-panel';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/admin',
}));

const ADMIN_ID = '0c7d9e12-34ab-4cde-8f01-23456789abcd';
const adminUser = (over: Record<string, unknown> = {}) => ({
  id: 'b8f2c1a4-5d3e-4a7b-9c21-0e6f7a8b9c10',
  email: 'budi.santoso@example.test',
  display_name: 'Budi Santoso',
  role: 'learner',
  status: 'ACTIVE',
  target_band: 6,
  must_change_password: false,
  last_login_at: '2026-11-03T09:12:44.000Z',
  created_at: '2026-11-01T03:00:00.000Z',
  deleted_at: null,
  ...over,
});
const page = (data: unknown[]) => ({ data, meta: { page: 1, page_size: 20, total: data.length } });

describe('HealthGrid', () => {
  const health = {
    db: { status: 'up', latency_ms: 3 },
    queue: { waiting: 2, active: 1, failed_24h: 0, oldest_waiting_age_sec: 41 },
    llm: { enabled: true, driver: 'ollama', status: 'down', model_writing: 'qwen2.5:3b-instruct', model_speaking: 'qwen2.5:3b-instruct' },
    stt: { status: 'disabled', model: null },
    worker: { heartbeat_age_sec: null },
    disk: { assets_used_mb: 512, assets_free_mb: 48230 },
    app: { version: '0.1.0', node: '22.20.0' },
  } as const;

  it('menampilkan status dengan ikon + teks Aktif/Mati/Nonaktif', () => {
    renderWithProviders(<HealthGrid health={health as never} />);
    expect(screen.getAllByText('Aktif')).toHaveLength(3); // DB, antrean, disk
    expect(screen.getAllByText('Mati')).toHaveLength(2); // Penilai AI + Worker (tanpa detak)
    expect(screen.getByText('Nonaktif')).toBeInTheDocument();
    expect(screen.getByText('Belum ada detak')).toBeInTheDocument();
    expect(screen.getByText('Latensi 3 ms')).toBeInTheDocument();
  });

  it('workerState: > 45 detik dianggap mati', () => {
    expect(workerState(7)).toBe('up');
    expect(workerState(46)).toBe('down');
    expect(workerState(null)).toBe('down');
  });
});

describe('SecretDialog', () => {
  it('menampilkan rahasia sekali dengan peringatan dan tombol Salin', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onClose = vi.fn();
    renderWithProviders(
      <SecretDialog
        open
        onClose={onClose}
        title="Password sementara"
        warning="Hanya ditampilkan sekali."
        secret="Qm7vXk3PzR9tNc2H"
        secretLabel="Password sementara"
        doneLabel="Sudah saya salin"
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('secret-value')).toHaveTextContent('Qm7vXk3PzR9tNc2H');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Hanya ditampilkan sekali.');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Salin/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Qm7vXk3PzR9tNc2H'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sudah saya salin' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('UsersPanel', () => {
  function route(handlers: Record<string, () => { status?: number; body?: unknown }> = {}) {
    return mockFetch((url, init) => {
      const key = `${init.method ?? 'GET'} ${url.pathname}`;
      if (key === 'GET /api/v1/auth/me') return { body: { data: { user: { ...USER, id: ADMIN_ID, role: 'admin' } } } };
      if (handlers[key]) return handlers[key]();
      if (key === 'GET /api/v1/admin/users') {
        return {
          body: page([
            adminUser(),
            adminUser({ id: ADMIN_ID, display_name: 'Pemilik', email: 'pemilik@example.test', role: 'admin' }),
          ]),
        };
      }
      return { status: 404, body: errorBody('NOT_FOUND', 'x') };
    });
  }

  it('mendaftar pengguna dan menonaktifkan akun sendiri tidak dimungkinkan', async () => {
    route();
    renderWithProviders(<UsersPanel />);
    expect((await screen.findAllByText('Budi Santoso')).length).toBeGreaterThan(0);
    // Dua tampilan (tabel + kartu) hadir di DOM; ambil tombol aksi baris Pemilik (diri sendiri).
    const own = screen.getAllByRole('button', { name: 'Aksi untuk Pemilik' })[0];
    fireEvent.keyDown(own, { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Nonaktifkan' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(menu).getByRole('menuitem', { name: 'Hapus akun' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keadaan kosong menampilkan pesan Indonesia', async () => {
    mockFetch((url) =>
      url.pathname.endsWith('/auth/me')
        ? { body: { data: { user: USER } } }
        : { body: page([]) },
    );
    renderWithProviders(<UsersPanel />);
    expect(await screen.findByText('Belum ada pengguna.')).toBeInTheDocument();
  });

  it('galat memuat menampilkan Coba lagi', async () => {
    mockFetch((url) =>
      url.pathname.endsWith('/auth/me')
        ? { body: { data: { user: USER } } }
        : { status: 500, body: errorBody('INTERNAL_ERROR', 'x') },
    );
    renderWithProviders(<UsersPanel />);
    expect(await screen.findByRole('button', { name: 'Coba lagi' })).toBeInTheDocument();
  });
});

describe('InvitesPanel', () => {
  it('daftar tidak memuat kode; undangan aktif punya tombol Cabut, yang terpakai tidak', async () => {
    mockFetch((url) =>
      url.pathname.endsWith('/admin/invites')
        ? {
            body: page([
              {
                id: '5e1d7a90-2b3c-4d5e-8f60-718293a4b5c6',
                status: 'active',
                expires_at: '2026-11-10T10:00:00.000Z',
                created_at: '2026-11-03T10:00:00.000Z',
                used_at: null,
                used_by_email: null,
                revoked_at: null,
              },
              {
                id: '5e1d7a90-2b3c-4d5e-8f60-718293a4b5c7',
                status: 'used',
                expires_at: '2026-11-10T10:00:00.000Z',
                created_at: '2026-11-03T10:00:00.000Z',
                used_at: '2026-11-03T11:30:00.000Z',
                used_by_email: 'sari.dewi@example.test',
                revoked_at: null,
              },
            ]),
          }
        : { status: 404, body: errorBody('NOT_FOUND', 'x') },
    );
    renderWithProviders(<InvitesPanel />);
    expect((await screen.findAllByText('sari.dewi@example.test')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Cabut' })).toHaveLength(2); // tabel + kartu untuk 1 undangan aktif
  });

  it('membuat undangan menampilkan kode sekali dalam dialog', async () => {
    const code = 'K7QM-4XZP-9T2V-HD8W-RJ3N';
    const calls = mockFetch((url, init) => {
      if (init.method === 'POST')
        return {
          status: 201,
          body: { data: { id: '5e1d7a90-2b3c-4d5e-8f60-718293a4b5c6', code, expires_at: '2026-11-10T10:00:00.000Z', created_at: '2026-11-03T10:00:00.000Z' } },
        };
      return { body: page([]) };
    });
    renderWithProviders(<InvitesPanel />);
    await screen.findByText('Belum ada undangan.');
    fireEvent.click(screen.getByRole('button', { name: /Buat Undangan/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Buat kode' }));
    expect(await screen.findByTestId('secret-value')).toHaveTextContent(code);
    const post = calls.find((c) => c.init.method === 'POST')!;
    expect(post.json).toEqual({ expires_in_days: 7 });
  });
});

describe('SettingsPanel', () => {
  const setting = (key: string, over: Record<string, unknown> = {}) => ({
    key,
    value: 60,
    default: 60,
    type: 'int',
    min: 0,
    max: 1440,
    options: null,
    description: 'Jeda minimal antar percobaan (menit).',
    updated_at: null,
    updated_by: null,
    ...over,
  });

  it('groupSettings mengelompokkan berdasarkan prefiks kunci', () => {
    const groups = groupSettings([setting('attempt.cooldown_minutes'), setting('attempt.max_per_set_per_day'), setting('ai.queue_max')] as never);
    expect(groups.map((g) => [g.group, g.items.length])).toEqual([
      ['attempt', 2],
      ['ai', 1],
    ]);
  });

  it('validasi rentang di klien dan simpan ke PUT dengan nilai bertipe angka', async () => {
    const calls = mockFetch((url, init) => {
      if (init.method === 'PUT') return { body: { data: setting('attempt.cooldown_minutes', { value: 45 }) } };
      return { body: { data: [setting('attempt.cooldown_minutes')] } };
    });
    renderWithProviders(<SettingsPanel />);
    const input = await screen.findByLabelText('attempt.cooldown_minutes');
    const save = screen.getByRole('button', { name: 'Simpan attempt.cooldown_minutes' });
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: '2000' } });
    fireEvent.click(save);
    expect(await screen.findByText('Nilai harus antara 0 dan 1440.')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'PUT')).toBe(false);
    fireEvent.change(input, { target: { value: '45' } });
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.init.method === 'PUT')!;
    expect(put.url.pathname).toBe('/api/v1/admin/settings/attempt.cooldown_minutes');
    expect(put.json).toEqual({ value: 45 });
  });

  it('galat validasi server dipetakan ke pesan Indonesia', async () => {
    mockFetch((url, init) =>
      init.method === 'PUT'
        ? { status: 400, body: errorBody('VALIDATION_ERROR', 'x', [{ path: 'value', code: 'gold_not_greater_than_silver', message: 'x' }]) }
        : { body: { data: [setting('crown.gold_min', { value: 90, default: 90, min: 1, max: 100 })] } },
    );
    renderWithProviders(<SettingsPanel />);
    const input = await screen.findByLabelText('crown.gold_min');
    fireEvent.change(input, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan crown.gold_min' }));
    expect(await screen.findByText('Ambang Gold harus lebih besar dari ambang Silver.')).toBeInTheDocument();
  });
});

describe('buildAuditParams', () => {
  it('mengubah tanggal menjadi batas hari UTC dan membuang filter kosong', () => {
    expect(
      buildAuditParams({ action: ' AUTH_LOGIN_FAILED ', actor: '', from: '2026-11-03', to: '2026-11-04' }, 2),
    ).toEqual({
      page: 2,
      page_size: 20,
      action: 'AUTH_LOGIN_FAILED',
      actor_user_id: undefined,
      from: '2026-11-03T00:00:00.000Z',
      to: '2026-11-04T23:59:59.999Z',
    });
  });
});
