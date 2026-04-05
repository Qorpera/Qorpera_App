import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { reconcileOrphanedEntities } from "@/lib/entity-reconciliation";

export async function POST() {
  const su = await getSessionUser();
  if (!su || su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reconcileOrphanedEntities(su.operatorId);
  return NextResponse.json(result);
}
