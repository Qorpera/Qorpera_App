import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { listAuditEntries } from "@/lib/audit-logger";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const outcome = url.searchParams.get("outcome") ?? undefined;
  const limit = parseInt(url.searchParams.get("limit") ?? "50");
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  const result = await listAuditEntries(operatorId, { action, entityId, outcome, limit, offset });
  return NextResponse.json(result);
}
