import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getGraphData } from "@/lib/entity-model-store";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const data = await getGraphData(operatorId);
  return NextResponse.json(data);
}
