import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileCard } from '@/components/auth/profile-card';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import { AuthenticatedLayout } from './authenticated-layout';

const replace = vi.fn();
let pathname = '/profil';
let search = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  replace.mockClear();
  pathname = '/profil';
  search = '';
});

const me = (user: unknown, status = 200) => ({ status, body: status === 200 ? { data: { user } } : user });

describe('AuthenticatedLayout (AuthGate + AppShell)', () => {
  it('tanpa profil terpilih mengalihkan ke /pilih-profil?next=<path> dan tidak merender konten', async () => {
    search = 'tab=a';
    mockFetch(() => me(errorBody('UNAUTHENTICATED', 'x'), 401));
    renderWithProviders(
      <AuthenticatedLayout>
        <p>Rahasia</p>
      </AuthenticatedLayout>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/pilih-profil?next=%2Fprofil%3Ftab%3Da'));
    expect(screen.queryByText('Rahasia')).not.toBeInTheDocument();
  });

  it('learner: navigasi 4 item, Riwayat aktif (SPEC-017), tanpa item Admin', async () => {
    mockFetch(() => me(USER));
    renderWithProviders(
      <AuthenticatedLayout>
        <p>Isi</p>
      </AuthenticatedLayout>,
    );
    expect(await screen.findByText('Isi')).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Navigasi utama' })[0];
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Peta' }).length).toBeGreaterThan(0);
    const riwayat = screen.getAllByRole('link', { name: 'Riwayat' })[0];
    expect(riwayat).toHaveAttribute('href', '/riwayat');
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    const profil = screen.getAllByRole('link', { name: 'Profil' })[0];
    expect(profil).toHaveAttribute('aria-current', 'page');
  });
});

describe('ProfileCard', () => {
  it('hanya mengirim field yang berubah dan tidak pernah role/email/status', async () => {
    const calls = mockFetch((url, init) => {
      if (init.method === 'PATCH') return me({ ...USER, display_name: 'Budi S.' });
      return me(USER);
    });
    renderWithProviders(<ProfileCard />);
    const name = await screen.findByLabelText('Nama tampilan');
    const save = screen.getByRole('button', { name: 'Simpan' });
    expect(save).toBeDisabled();
    fireEvent.change(name, { target: { value: 'Budi S.' } });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(calls.some((c) => c.init.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.init.method === 'PATCH')!.json).toEqual({ display_name: 'Budi S.' });
  });

  it('tidak menampilkan email maupun menu password; tombol Ganti profil memanggil /profiles/leave lalu ke pemilih', async () => {
    const calls = mockFetch((url) => {
      if (url.pathname.endsWith('/profiles/leave')) return { status: 204, body: null };
      return me(USER);
    });
    renderWithProviders(<ProfileCard />);
    await screen.findByLabelText('Nama tampilan');
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByText('Ganti password')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ganti profil' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/pilih-profil?pilih=1'));
    expect(calls.some((c) => c.url.pathname.endsWith('/profiles/leave') && c.init.method === 'POST')).toBe(true);
  });
});
