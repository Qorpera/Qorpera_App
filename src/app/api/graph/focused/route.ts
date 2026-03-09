import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getFocusedSubgraph } from "@/lib/graph-traversal";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const entityId = new URL(req.url).searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "entityId required" }, { status: 400 });

  const result = await getFocusedSubgraph(operatorId, entityId);
  return NextResponse.json(result);
}
