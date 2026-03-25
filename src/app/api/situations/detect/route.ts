import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const jobId = await enqueueWorkerJob("detect_situations", su.operatorId, {
    operatorId: su.operatorId,
  });

  return NextResponse.json({ status: "queued", jobId });
}
