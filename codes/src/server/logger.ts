import pino from 'pino';

/** Log JSON terstruktur dengan redaksi key sensitif (security-standards 13.2). */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { svc: 'web' },
  redact: {
    paths: [
      'password',
      '*.password',
      'password_hash',
      '*.password_hash',
      'token',
      '*.token',
      'authorization',
      'cookie',
      '*.cookie',
      'secret',
      '*.secret',
      'email',
      '*.email',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});
