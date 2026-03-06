import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { auditPreFilters } from "@/lib/situation-audit";

export async function POST() {
  const operatorId = await getOperatorId();

  const results = await auditPreFilters(operatorId);

  return NextResponse.json({
    audited: results.reduce((s, r) => s + r.entitiesSampled, 0),
    missesFound: results.reduce((s, r) => s + r.missesFound, 0),
    filtersRegenerated: results.filter((r) => r.filterRegenerated).length,
    details: results,
  });
}
