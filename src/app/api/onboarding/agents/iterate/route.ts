import { NextResponse } from "next/server";
import { validateInternalKey } from "@/lib/internal-api";
import { runAgentIteration } from "@/lib/onboarding-intelligence/agent-runner";

export async function POST(request: Request) {
  // Validate internal API key
  if (!validateInternalKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { runId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { runId } = body;
  if (!runId || typeof runId !== "string") {
    return NextResponse.json({ error: "Missing runId" }, { status: 400 });
  }

  // Fire-and-forget: run the iteration but respond immediately
  runAgentIteration(runId).catch((err) =>
    console.error("Agent iteration error:", err),
  );

  return NextResponse.json({ ok: true });
}
