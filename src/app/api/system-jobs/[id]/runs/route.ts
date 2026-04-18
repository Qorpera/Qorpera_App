import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// TODO: Run history now lives inline on the system_job wiki page under the
// "Execution History" section. This endpoint used to page through
// prisma.systemJobRun records; callers should read the wiki page instead.
// Returning 501 so any lingering caller fails loudly rather than quietly
// returning empty data.
export async function GET(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Not implemented. Run history is now rendered from the system_job wiki page's Execution History section." },
    { status: 501 },
  );
}
