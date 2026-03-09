import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const health: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  };

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.database = 'connected';
  } catch {
    health.status = 'degraded';
    health.database = 'disconnected';
  }

  // Check document storage
  const storagePath = process.env.DOCUMENT_STORAGE_PATH || './uploads/documents';
  try {
    const fs = await import('fs');
    fs.accessSync(storagePath, fs.constants.W_OK);
    health.storage = 'writable';
  } catch {
    health.status = 'degraded';
    health.storage = 'not writable';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
