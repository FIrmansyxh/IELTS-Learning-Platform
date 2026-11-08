import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePicker } from '@/components/profiles/profile-picker';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';

const replace = vi.fn();
let search = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/pilih-profil',
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  replace.mockClear();
  search = '';
});

const P = (id: string, name: string, done = 0) => ({ id, display_name: name, target_band: null, created_at: '2026-11-08T10:00:00.000Z', completed_sub_modules: done });
const A = '3b241101-e2bb-4255-8caf-4136c566a962';
const B = '4c352212-f3cc-4366-9dbf-5247d677b073';
const list = (profiles: unknown[]) => ({ status: 200, body: { data: { profiles, max_profiles: 10 } } });
const user = { status: 200, body: { data: { user: USER } } };

describe('ProfilePicker (SPEC-025)', () => {
  it('menampilkan profil dengan ringkasan progres dan tanpa kolom email/password', async () => {
    mockFetch(() => list([P(A, 'Ani', 3), P(B, 'Bayu')]));
    renderWithProviders(<ProfilePicker />);
    expect(await screen.findByText('Ani')).toBeInTheDocument();
    expect(screen.getByText('3 sub-modul selesai')).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it('memilih profil memanggil /select lalu menuju next yang aman', async () => {
    search = 'next=%2Fpeta&pilih=1';
    const calls = mockFetch((url, init) => (init.method === 'POST' ? user : list([P(A, 'Ani'), P(B, 'Bayu')])));
    renderWithProviders(<ProfilePicker />);
    const buttons = await screen.findAllByRole('button', { name: 'Pilih' });
    fireEvent.click(buttons[1]!);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/peta'));
    expect(calls.some((c) => c.url.pathname === `/api/v1/profiles/${B}/select` && c.init.method === 'POST')).toBe(true);
  });

  it('next berbahaya diabaikan', async () => {
    search = 'next=%2F%2Fevil.test&pilih=1';
    mockFetch((url, init) => (init.method === 'POST' ? user : list([P(A, 'Ani'), P(B, 'Bayu')])));
    renderWithProviders(<ProfilePicker />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Pilih' }))[0]!);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('satu profil terbuka otomatis; dengan ?pilih=1 (ganti profil) tidak', async () => {
    const calls = mockFetch((url, init) => (init.method === 'POST' ? user : list([P(A, 'Ani')])));
    const { unmount } = renderWithProviders(<ProfilePicker />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(calls.some((c) => c.url.pathname.endsWith('/select'))).toBe(true);
    unmount();

    replace.mockClear();
    search = 'pilih=1';
    const calls2 = mockFetch(() => list([P(A, 'Ani')]));
    renderWithProviders(<ProfilePicker />);
    await screen.findByText('Ani');
    expect(replace).not.toHaveBeenCalled();
    expect(calls2.some((c) => c.url.pathname.endsWith('/select'))).toBe(false);
  });

  it('buat profil: nama terlalu pendek ditolak di klien; sukses menuju beranda; nama kembar menampilkan pesan', async () => {
    search = 'pilih=1';
    let taken = false;
    const calls = mockFetch((url, init) => {
      if (init.method === 'POST') return taken ? { status: 409, body: errorBody('PROFILE_NAME_TAKEN', 'x') } : { status: 201, body: { data: { user: USER } } };
      return list([P(A, 'Ani'), P(B, 'Bayu')]);
    });
    renderWithProviders(<ProfilePicker />);
    const input = await screen.findByLabelText('Nama profil');
    fireEvent.change(input, { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buat profil' }));
    expect(await screen.findByText('Nama harus 2 sampai 40 karakter.')).toBeInTheDocument();
    expect(calls.some((c) => c.init.method === 'POST')).toBe(false);

    taken = true;
    fireEvent.change(input, { target: { value: 'ani' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buat profil' }));
    expect(await screen.findByText('Nama profil sudah dipakai.')).toBeInTheDocument();

    taken = false;
    fireEvent.change(input, { target: { value: 'Citra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buat profil' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(calls.filter((c) => c.init.method === 'POST').at(-1)!.json).toEqual({ display_name: 'Citra' });
  });

  it('hapus profil: tombol konfirmasi aktif hanya bila nama diketik benar, lalu memanggil DELETE', async () => {
    search = 'pilih=1';
    const calls = mockFetch((url, init) => (init.method === 'DELETE' ? { status: 204, body: null } : list([P(A, 'Ani'), P(B, 'Bayu')])));
    renderWithProviders(<ProfilePicker />);
    fireEvent.click(await screen.findByRole('button', { name: 'Hapus Ani' }));
    const confirm = await screen.findByRole('button', { name: 'Hapus permanen' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Ketik nama profil untuk konfirmasi'), { target: { value: 'ani' } });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(calls.some((c) => c.init.method === 'DELETE')).toBe(true));
    const del = calls.find((c) => c.init.method === 'DELETE')!;
    expect(del.url.pathname).toBe(`/api/v1/profiles/${A}`);
    expect(del.json).toEqual({ confirm_name: 'ani' });
  });

  it('daftar kosong menampilkan ajakan membuat profil pertama', async () => {
    search = 'pilih=1';
    mockFetch(() => list([]));
    renderWithProviders(<ProfilePicker />);
    expect(await screen.findByText(/Belum ada profil/)).toBeInTheDocument();
  });
});
