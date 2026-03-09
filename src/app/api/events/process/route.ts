import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { materializeUnprocessed } from "@/lib/event-materializer";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { operatorId } = su;
  const body = await req.json().catch(() => ({}));
  const limit = body.limit ?? 50;

  const results = await materializeUnprocessed(operatorId, limit);

  return NextResponse.json({ processed: results.length, results });
}
