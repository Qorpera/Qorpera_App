import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { redis } from '@/lib/rate-limiter';

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = {};
  let status: 'ok' | 'degraded' = 'ok';

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    status = 'degraded';
    checks.database = 'disconnected';
  }

  // Check document storage
  const storagePath = process.env.DOCUMENT_STORAGE_PATH || './uploads/documents';
  try {
    const fs = await import('fs');
    fs.accessSync(storagePath, fs.constants.W_OK);
    checks.storage = 'ok';
  } catch {
    checks.storage = 'not writable';
  }

  // Check Redis
  if (redis) {
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'degraded';
    }
  } else {
    checks.redis = 'not_configured';
  }

  // Check Sentry
  checks.sentry = (process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN) ? 'configured' : 'not_configured';

  // Only database being down makes health fail (503)
  const statusCode = checks.database === 'ok' ? 200 : 503;

  return NextResponse.json({
    status: checks.database === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    checks,
  }, { status: statusCode });
}
