import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const jobId = await enqueueWorkerJob("extract_insights", operatorId, {
    operatorId,
  });
  return NextResponse.json({ status: "queued", jobId });
}
