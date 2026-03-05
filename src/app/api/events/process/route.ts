import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { materializeUnprocessed } from "@/lib/event-materializer";

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json().catch(() => ({}));
  const limit = body.limit ?? 50;

  const results = await materializeUnprocessed(operatorId, limit);

  return NextResponse.json({ processed: results.length, results });
}
