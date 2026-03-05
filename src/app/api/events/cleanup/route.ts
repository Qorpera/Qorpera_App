import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { cleanupOldEvents } from "@/lib/event-retention";

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json().catch(() => ({}));
  const retentionDays = body.retentionDays ?? 90;

  const result = await cleanupOldEvents(operatorId, retentionDays);

  return NextResponse.json(result);
}
