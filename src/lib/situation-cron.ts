import { prisma } from "@/lib/db";
import { detectSituations } from "@/lib/situation-detector";
import { auditPreFilters } from "@/lib/situation-audit";

// Store on globalThis so references survive Next.js HMR in dev mode
const g = globalThis as typeof globalThis & {
  _situationDetectionInterval?: ReturnType<typeof setInterval>;
  _situationAuditInterval?: ReturnType<typeof setInterval>;
};

// ── Start cron jobs (uses setInterval — no external dependency) ──────────────

export function startSituationCrons() {
  if (g._situationDetectionInterval) return; // already running

  // Detection: every 15 minutes
  g._situationDetectionInterval = setInterval(async () => {
    try {
      const operators = await prisma.operator.findMany({ select: { id: true } });
      for (const op of operators) {
        const results = await detectSituations(op.id);
        if (results.length > 0) {
          console.log(`[situation-cron] Operator ${op.id}: ${results.length} situations detected`);
        }
      }
    } catch (err) {
      console.error("[situation-cron] Detection tick error:", err);
    }
  }, 15 * 60 * 1000);

  // Audit: daily (every 24 hours)
  g._situationAuditInterval = setInterval(async () => {
    try {
      const operators = await prisma.operator.findMany({ select: { id: true } });
      for (const op of operators) {
        const results = await auditPreFilters(op.id);
        const totalMisses = results.reduce((sum, r) => sum + r.missesFound, 0);
        const regens = results.filter((r) => r.filterRegenerated).length;
        if (totalMisses > 0 || regens > 0) {
          console.log(`[situation-cron] Audit for ${op.id}: ${totalMisses} misses, ${regens} filters regenerated`);
        }
      }
    } catch (err) {
      console.error("[situation-cron] Audit tick error:", err);
    }
  }, 24 * 60 * 60 * 1000);

  console.log("[situation-cron] Started: detection every 15min, audit every 24h");
}

export function isCronRunning(): boolean {
  return g._situationDetectionInterval !== undefined;
}
