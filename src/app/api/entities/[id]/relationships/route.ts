import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { getEntityRelationships } from "@/lib/entity-model-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operatorId = await getOperatorId();
  const relationships = await getEntityRelationships(operatorId, id);
  return NextResponse.json({ relationships });
}
