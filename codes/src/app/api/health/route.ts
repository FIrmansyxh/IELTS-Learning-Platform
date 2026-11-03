import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPool } from '@/server/db';
import { id } from '@/i18n/id';

export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 2000;

/** SELECT 1 dengan batas waktu 2 detik; timer selalu dibersihkan. */
async function pingDb(): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), DB_TIMEOUT_MS);
  });
  try {
    await Promise.race([getPool().query('SELECT 1'), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const requestId = randomUUID();
  try {
    await pingDb();
    return NextResponse.json(
      { data: { status: 'ok', time: new Date().toISOString() } },
      { status: 200, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId } },
    );
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: id.errors.serviceUnavailable,
          request_id: requestId,
        },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId, 'Retry-After': '5' } },
    );
  }
}
