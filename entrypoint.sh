#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
npx prisma migrate deploy

if [ -n "$SUPERADMIN_EMAIL" ] && [ -n "$SUPERADMIN_PASSWORD" ]; then
  echo "[entrypoint] Seeding superadmin..."
  npx tsx scripts/create-superadmin.ts
fi

echo "[entrypoint] Starting server..."
exec node server.js
