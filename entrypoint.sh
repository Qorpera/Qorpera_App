#!/bin/sh
set -e

echo "[entrypoint] Pushing database schema..."
npx prisma db push --skip-generate --accept-data-loss

if [ -n "$SUPERADMIN_EMAIL" ] && [ -n "$SUPERADMIN_PASSWORD" ]; then
  echo "[entrypoint] Seeding superadmin..."
  npx tsx scripts/create-superadmin.ts
fi

echo "[entrypoint] Starting server..."
exec node server.js
