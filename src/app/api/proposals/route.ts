import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { listProposals, getPendingProposalCount } from "@/lib/action-executor";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const result = await listProposals(operatorId, status);
  const pendingCount = await getPendingProposalCount(operatorId);
  return NextResponse.json({ ...result, pendingCount });
}
