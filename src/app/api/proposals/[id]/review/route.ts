import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { reviewProposal } from "@/lib/action-executor";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operatorId = await getOperatorId();
  const { decision, reviewNote } = await req.json();

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });
  }

  const result = await reviewProposal(operatorId, id, decision, reviewNote);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
