import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;

  // Get distinct sessionIds with the first message content and earliest date
  const rows = await prisma.$queryRaw<
    Array<{ sessionId: string; preview: string; createdAt: Date }>
  >`
    SELECT DISTINCT ON ("sessionId")
      "sessionId",
      "content" AS "preview",
      "createdAt"
    FROM "CopilotMessage"
    WHERE "operatorId" = ${operatorId}
      AND "userId" = ${user.id}
    ORDER BY "sessionId", "createdAt" ASC
  `;

  // Sort sessions by most recent first (based on the first message date)
  // and truncate preview
  const sessions = rows
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((r) => ({
      sessionId: r.sessionId,
      preview: r.preview.length > 60 ? r.preview.slice(0, 60) + "..." : r.preview,
      createdAt: r.createdAt,
    }));

  return NextResponse.json({ sessions });
}
