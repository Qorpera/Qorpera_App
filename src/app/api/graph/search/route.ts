import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { searchEntities } from "@/lib/entity-resolution";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const type = url.searchParams.get("type") ?? undefined;
  if (!q) return NextResponse.json([]);

  const results = await searchEntities(operatorId, q, type);
  return NextResponse.json(results);
}
