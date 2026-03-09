import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { searchEntities } from "@/lib/entity-resolution";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const type = url.searchParams.get("type") ?? undefined;
  if (!q) return NextResponse.json([]);

  const results = await searchEntities(operatorId, q, type);
  return NextResponse.json(results);
}
