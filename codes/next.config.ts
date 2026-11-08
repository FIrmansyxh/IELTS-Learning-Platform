import type { NextConfig } from 'next';

// Header keamanan dasar (security-standards 8.1). CSP berbasis nonce ditambahkan
// oleh spec keamanan/auth berikutnya via middleware; HSTS hanya di proxy HTTPS.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'pg-boss', 'pino', 'sharp'],
  // SPEC-001: daftar password umum dibaca lewat fs saat runtime; paksa ikut ke output standalone.
  outputFileTracingIncludes: {
    '/api/v1/auth/register': ['./src/server/auth/common-passwords.txt'],
    '/api/v1/auth/change-password': ['./src/server/auth/common-passwords.txt'],
  },
  images: { remotePatterns: [] },
  experimental: { serverActions: { bodySizeLimit: '1mb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
