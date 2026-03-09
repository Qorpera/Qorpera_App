import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cleanupOldEvents } from "@/lib/event-retention";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const body = await req.json().catch(() => ({}));
  const retentionDays = body.retentionDays ?? 90;

  const result = await cleanupOldEvents(operatorId, retentionDays);

  return NextResponse.json(result);
}
