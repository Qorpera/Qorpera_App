import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { operatorId } = body;

  if (!operatorId || typeof operatorId !== "string") {
    return NextResponse.json({ error: "operatorId is required" }, { status: 400 });
  }

  const { runQualityCheck } = await import("@/lib/wiki-quality-monitor");
  const report = await runQualityCheck(operatorId);

  return NextResponse.json(report);
}
