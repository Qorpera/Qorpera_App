import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getEntityCounts } from "@/lib/entity-model-store";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const counts = await getEntityCounts(operatorId);

  return NextResponse.json({
    ...counts,
  });
}
