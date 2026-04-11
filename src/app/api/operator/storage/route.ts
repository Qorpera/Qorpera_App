import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { getStorageStats } = await import("@/lib/storage/raw-content-store");
  const stats = await getStorageStats(session.operatorId);

  return NextResponse.json({
    ...stats,
    totalSizeMB: Math.round(stats.totalSizeBytes / 1024 / 1024 * 100) / 100,
  });
}
