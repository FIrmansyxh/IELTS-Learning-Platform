import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorBody, mockFetch, renderWithProviders, USER } from '@/components/test-utils';
import { RegisterForm } from './register-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => replace.mockClear());

function route(mode: string, register?: () => { status?: number; body?: unknown }) {
  return mockFetch((url) => {
    if (url.pathname.endsWith('/auth/signup-config')) return { body: { data: { mode } } };
    return register ? register() : { status: 201, body: { data: { user: USER } } };
  });
}

function fillBasics() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'budi.santoso@example.test' } });
  fireEvent.change(screen.getByLabelText('Nama tampilan'), { target: { value: 'Budi Santoso' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'kopi-tubruk-2026!' } });
}

describe('RegisterForm', () => {
  it('mode closed menampilkan kartu informasi tanpa form', async () => {
    route('closed');
    renderWithProviders(<RegisterForm />);
    expect(await screen.findByText('Pendaftaran sedang ditutup. Hubungi pemilik.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('mode open tidak menampilkan kode undangan dan tidak mengirimnya', async () => {
    const calls = route('open');
    renderWithProviders(<RegisterForm />);
    await screen.findByLabelText('Email');
    expect(screen.queryByLabelText('Kode undangan')).not.toBeInTheDocument();
    fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/masuk'));
    const post = calls.find((c) => c.url.pathname.endsWith('/auth/register'))!;
    expect(post.json).toEqual({
      email: 'budi.santoso@example.test',
      display_name: 'Budi Santoso',
      password: 'kopi-tubruk-2026!',
    });
  });

  it('mode invite mewajibkan kode dan menormalkannya jadi huruf besar', async () => {
    const calls = route('invite');
    renderWithProviders(<RegisterForm />);
    await screen.findByLabelText('Kode undangan');
    fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }));
    expect(await screen.findByText('Kode undangan wajib diisi.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Kode undangan'), { target: { value: 'k7qm-4xzp-9t2v-hd8w-rj3n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/masuk'));
    const post = calls.find((c) => c.url.pathname.endsWith('/auth/register'))!;
    expect((post.json as { invite_code: string }).invite_code).toBe('K7QM-4XZP-9T2V-HD8W-RJ3N');
  });

  it('password pendek ditolak di klien dengan penunjuk panjang', async () => {
    route('open');
    renderWithProviders(<RegisterForm />);
    await screen.findByLabelText('Email');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc123' } });
    expect(screen.getByText(/6 dari 10\+ karakter/)).toBeInTheDocument();
    fillBasicsExceptPassword();
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }));
    expect(await screen.findByText('Password minimal 10 karakter.', { selector: 'span' })).toBeInTheDocument();
  });

  it('EMAIL_TAKEN dipetakan ke field email', async () => {
    route('open', () => ({ status: 409, body: errorBody('EMAIL_TAKEN', 'Email sudah terdaftar.') }));
    renderWithProviders(<RegisterForm />);
    await screen.findByLabelText('Email');
    fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }));
    expect(await screen.findByText('Email sudah terdaftar.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('details server (password_too_common) tampil di bawah field password', async () => {
    route('open', () => ({
      status: 400,
      body: errorBody('VALIDATION_ERROR', 'Data yang dikirim tidak valid.', [
        { path: 'password', code: 'password_too_common', message: 'x' },
      ]),
    }));
    renderWithProviders(<RegisterForm />);
    await screen.findByLabelText('Email');
    fillBasics();
    fireEvent.click(screen.getByRole('button', { name: 'Daftar' }));
    expect(await screen.findByText('Password terlalu umum. Gunakan kombinasi yang lebih unik.')).toBeInTheDocument();
  });
});

function fillBasicsExceptPassword() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'budi.santoso@example.test' } });
  fireEvent.change(screen.getByLabelText('Nama tampilan'), { target: { value: 'Budi Santoso' } });
}
