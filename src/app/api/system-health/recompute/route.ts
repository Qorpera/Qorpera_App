import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limiter";
import { recomputeHealthSnapshots } from "@/lib/system-health/compute-snapshot";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = su.user.role === "admin" || su.user.role === "superadmin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 1 recompute per minute per operator
  const rl = checkRateLimit(`system-health-recompute:${su.operatorId}`, 1, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);

  await recomputeHealthSnapshots(su.operatorId);

  // Return fresh data by redirecting to GET
  const { GET } = await import("../route");
  return GET();
}
