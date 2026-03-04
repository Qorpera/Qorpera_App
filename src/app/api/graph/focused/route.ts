import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { getFocusedSubgraph } from "@/lib/graph-traversal";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const entityId = new URL(req.url).searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "entityId required" }, { status: 400 });

  const result = await getFocusedSubgraph(operatorId, entityId);
  return NextResponse.json(result);
}
