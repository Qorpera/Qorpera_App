/** @deprecated Migrated to Bastion worker (worker/src/cron-scheduler.ts) */
export async function GET() {
  return Response.json({ migrated: "worker" });
}
