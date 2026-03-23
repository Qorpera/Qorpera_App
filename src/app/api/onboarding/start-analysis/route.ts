import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { startAnalysis } from "@/lib/onboarding-intelligence/orchestration";

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin only
  if (session.user.role !== "admin" && session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await startAnalysis(session.operatorId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start analysis";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
