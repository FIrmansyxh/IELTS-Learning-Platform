import type { NextConfig } from 'next';

// Header keamanan dasar (security-standards 8.1). CSP berbasis nonce ditambahkan
// oleh spec keamanan berikutnya via middleware. Aplikasi lokal HTTP loopback: tanpa HSTS.
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
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  reactStrictMode: true,
  serverExternalPackages: ['pino', 'sharp'],
  images: { remotePatterns: [] },
  experimental: { serverActions: { bodySizeLimit: '1mb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
