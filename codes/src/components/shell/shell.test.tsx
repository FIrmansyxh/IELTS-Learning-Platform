import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { ProfileCard } from '@/components/auth/profile-card';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import { AdminGuard } from '@/components/admin/admin-guard';
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
  it('tanpa sesi mengalihkan ke /masuk?next=<path> dan tidak merender konten', async () => {
    search = 'tab=a';
    mockFetch(() => me(errorBody('UNAUTHENTICATED', 'x'), 401));
    renderWithProviders(
      <AuthenticatedLayout>
        <p>Rahasia</p>
      </AuthenticatedLayout>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/masuk?next=%2Fprofil%3Ftab%3Da'));
    expect(screen.queryByText('Rahasia')).not.toBeInTheDocument();
  });

  it('must_change_password memaksa /ganti-password dan menyembunyikan navigasi', async () => {
    mockFetch(() => me({ ...USER, must_change_password: true }));
    renderWithProviders(
      <AuthenticatedLayout>
        <p>Rahasia</p>
      </AuthenticatedLayout>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ganti-password'));
    expect(screen.queryByText('Rahasia')).not.toBeInTheDocument();
  });

  it('learner: navigasi 4 item, Riwayat disabled (Segera hadir), tanpa item Admin', async () => {
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
    expect(riwayat).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    const profil = screen.getAllByRole('link', { name: 'Profil' })[0];
    expect(profil).toHaveAttribute('aria-current', 'page');
  });

  it('admin melihat item Admin', async () => {
    mockFetch(() => me({ ...USER, role: 'admin' }));
    renderWithProviders(
      <AuthenticatedLayout>
        <p>Isi</p>
      </AuthenticatedLayout>,
    );
    await screen.findByText('Isi');
    expect(screen.getAllByRole('link', { name: 'Admin' }).length).toBeGreaterThan(0);
  });
});

describe('AdminGuard', () => {
  it('learner melihat pesan 403 dan tidak melihat konten admin', async () => {
    mockFetch(() => me(USER));
    renderWithProviders(
      <AdminGuard>
        <p>Panel admin</p>
      </AdminGuard>,
    );
    expect(await screen.findByText('Anda tidak punya akses')).toBeInTheDocument();
    expect(screen.queryByText('Panel admin')).not.toBeInTheDocument();
  });
});

describe('ChangePasswordForm', () => {
  it('mode paksa menampilkan teks wajib ganti dan memetakan password saat ini salah', async () => {
    mockFetch((url) => {
      if (url.pathname.endsWith('/auth/me')) return me({ ...USER, must_change_password: true });
      return { status: 403, body: errorBody('CURRENT_PASSWORD_INCORRECT', 'x') };
    });
    renderWithProviders(<ChangePasswordForm />);
    expect(await screen.findByText('Anda harus mengganti password sementara.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Password saat ini'), { target: { value: 'Qm7vXk3PzR9tNc2H' } });
    fireEvent.change(screen.getByLabelText('Password baru'), { target: { value: 'teh-tarik-hangat-77' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Password saat ini salah.')).toBeInTheDocument();
    expect(screen.getByLabelText('Password saat ini')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sukses memperbarui sesi dan mengarah ke /', async () => {
    const calls = mockFetch((url, init) => {
      if (init.method === 'POST') return me({ ...USER, must_change_password: false });
      return me({ ...USER, must_change_password: true });
    });
    renderWithProviders(<ChangePasswordForm />);
    await screen.findByLabelText('Password saat ini');
    fireEvent.change(screen.getByLabelText('Password saat ini'), { target: { value: 'Qm7vXk3PzR9tNc2H' } });
    fireEvent.change(screen.getByLabelText('Password baru'), { target: { value: 'teh-tarik-hangat-77' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(calls.find((c) => c.init.method === 'POST')!.json).toEqual({
      current_password: 'Qm7vXk3PzR9tNc2H',
      new_password: 'teh-tarik-hangat-77',
    });
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

  it('tombol Keluar membuka dialog konfirmasi', async () => {
    mockFetch(() => me(USER));
    renderWithProviders(<ProfileCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Keluar' }));
    expect(await screen.findByText('Keluar dari akun?')).toBeInTheDocument();
  });
});
