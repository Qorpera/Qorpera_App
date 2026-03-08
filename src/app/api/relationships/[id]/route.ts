import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { deleteRelationship } from "@/lib/entity-model-store";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operatorId = await getOperatorId();
  const ok = await deleteRelationship(operatorId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
