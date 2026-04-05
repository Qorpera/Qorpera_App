import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.effectiveRole !== "superadmin") {
    return NextResponse.json({ error: "Superadmin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { content, title, focusArea } = body;

  if (!content || typeof content !== "string" || content.length < 100) {
    return NextResponse.json({ error: "content is required (minimum 100 characters)" }, { status: 400 });
  }
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const jobId = await enqueueWorkerJob(
    "synthesize_research",
    su.operatorId,
    { content, title, focusArea: focusArea || undefined },
  );

  return NextResponse.json({ jobId, status: "queued" }, { status: 202 });
}
