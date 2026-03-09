import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { auditPreFilters } from "@/lib/situation-audit";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { operatorId } = su;

  const results = await auditPreFilters(operatorId);

  return NextResponse.json({
    audited: results.reduce((s, r) => s + r.entitiesSampled, 0),
    missesFound: results.reduce((s, r) => s + r.missesFound, 0),
    filtersRegenerated: results.filter((r) => r.filterRegenerated).length,
    details: results,
  });
}
