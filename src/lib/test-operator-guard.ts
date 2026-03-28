/**
 * SYNTHETIC DATA EXCLUSION POINTS
 * ================================
 * The following pipeline stages MUST exclude isTestOperator=true operators:
 *
 * ✅ IMPLEMENTED:
 * - sync-scheduler.ts — scheduled connector syncs
 * - cron-scheduler.ts — scheduled situation detection, audit, priorities, insights
 * - billing/balance.ts — guarded by billingStatus="free" (test operators never "active")
 *
 * 🔮 FUTURE (implement when these features are built):
 * - Self-improvement training loops — prompt optimization data
 * - Anonymized cross-customer benchmarks — decision outcome data
 * - Context section effectiveness scoring — citation rate aggregation
 * - Situation type recommendation engine — cross-customer pattern matching
 * - Data moat aggregation — the k-anonymity dataset must exclude synthetic
 *
 * ⚠️ DO NOT EXCLUDE from:
 * - Manual sync triggered by superadmin (API routes with admin auth)
 * - Manual situation detection triggered by superadmin
 * - Superadmin impersonation — must be able to enter and test synthetic companies
 * - Onboarding analysis — superadmin may trigger on test companies for QA
 */

import { prisma } from "@/lib/db";

/**
 * Check if an operator is a test/synthetic account.
 * Use this to exclude synthetic data from:
 * - Scheduled background processing (sync, detection, insights)
 * - Billing and usage tracking
 * - Anonymized training data and benchmarks
 * - Cross-customer aggregation and analytics
 *
 * Do NOT use this to block manual/admin-triggered operations —
 * superadmins need to test against synthetic companies.
 */
export async function isTestOperator(operatorId: string): Promise<boolean> {
  const op = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { isTestOperator: true },
  });
  return op?.isTestOperator ?? false;
}

/**
 * Filter for Prisma queries that should exclude test operators.
 * Use in `where` clauses: { ...NOT_TEST_OPERATOR }
 */
export const NOT_TEST_OPERATOR = {
  operator: { isTestOperator: false },
} as const;
