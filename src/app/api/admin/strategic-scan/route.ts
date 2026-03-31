import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su || su.effectiveRole !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await enqueueWorkerJob("strategic_scan", su.operatorId, {});

  return NextResponse.json({ status: "queued", message: "Strategic scan queued for execution" });
}
