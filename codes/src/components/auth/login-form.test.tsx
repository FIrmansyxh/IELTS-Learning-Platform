import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import { LoginForm } from './login-form';

const replace = vi.fn();
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
  usePathname: () => '/masuk',
}));

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
}

beforeEach(() => {
  replace.mockClear();
  search = new URLSearchParams();
});

describe('LoginForm', () => {
  it('menampilkan galat per field dan tidak memanggil API bila kosong', async () => {
    const calls = mockFetch(() => ({ body: {} }));
    renderWithProviders(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(await screen.findByText('Email wajib diisi.')).toBeInTheDocument();
    expect(screen.getByText('Password wajib diisi.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);
  });

  it('kredensial salah menampilkan satu pesan generik role=alert', async () => {
    mockFetch(() => ({ status: 401, body: errorBody('INVALID_CREDENTIALS', 'Email atau password salah.') }));
    renderWithProviders(<LoginForm />);
    fill('x@example.test', 'salah-salah-1');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email atau password salah.');
    expect(replace).not.toHaveBeenCalled();
  });

  it('429 menampilkan menit tunggu dari Retry-After', async () => {
    mockFetch(() => ({
      status: 429,
      headers: { 'Retry-After': '300' },
      body: errorBody('RATE_LIMITED', 'x'),
    }));
    renderWithProviders(<LoginForm />);
    fill('x@example.test', 'salah-salah-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Terlalu banyak percobaan. Coba lagi dalam 5 menit.');
  });

  it('sukses mengirim kredensial apa adanya dan mengarah ke next yang aman', async () => {
    search = new URLSearchParams('next=/profil');
    const calls = mockFetch(() => ({ body: { data: { user: USER } } }));
    renderWithProviders(<LoginForm />);
    fill(' budi.santoso@example.test ', 'kopi-tubruk-2026!');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/profil'));
    expect(calls[0].url.pathname).toBe('/api/v1/auth/login');
    expect(calls[0].json).toEqual({ email: 'budi.santoso@example.test', password: 'kopi-tubruk-2026!' });
  });

  it('mengabaikan next berbahaya', async () => {
    search = new URLSearchParams('next=//evil.test');
    mockFetch(() => ({ body: { data: { user: USER } } }));
    renderWithProviders(<LoginForm />);
    fill('budi.santoso@example.test', 'kopi-tubruk-2026!');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('must_change_password mengarah ke /ganti-password', async () => {
    mockFetch(() => ({ body: { data: { user: { ...USER, must_change_password: true } } } }));
    renderWithProviders(<LoginForm />);
    fill('budi.santoso@example.test', 'Qm7vXk3PzR9tNc2H');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ganti-password'));
  });

  it('toggle password mengubah tipe input dan aria-label', () => {
    renderWithProviders(<LoginForm />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Sembunyikan password' })).toBeInTheDocument();
  });
});
