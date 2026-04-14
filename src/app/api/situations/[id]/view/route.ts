import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id } = params;

  // Verify situation exists via wiki page or thin Situation record
  const [wikiExists, situationExists] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "KnowledgePage"
       WHERE "operatorId" = $1
         AND "pageType" = 'situation_instance'
         AND properties->>'situation_id' = $2
       LIMIT 1`,
      operatorId, id,
    ),
    prisma.situation.findFirst({
      where: { id, operatorId },
      select: { id: true },
    }),
  ]);

  if (wikiExists.length === 0 && !situationExists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Upsert the view record
  try {
    await prisma.situationView.upsert({
      where: { userId_situationId: { userId: user.id, situationId: id } },
      create: { userId: user.id, situationId: id },
      update: { viewedAt: new Date() },
    });
  } catch {
    return NextResponse.json({ error: "Failed to record view" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
