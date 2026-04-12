import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite not found or expired" }, { status: 404 });
  }
  if (invite.claimedAt) {
    return NextResponse.json({ error: "This invite has already been used" }, { status: 410 });
  }

  const operator = await prisma.operator.findUnique({ where: { id: invite.operatorId } });

  // Resolve person name from wiki page or invite name
  let personName = invite.name ?? "Unknown";
  if (invite.wikiPageSlug) {
    const page = await prisma.knowledgePage.findFirst({
      where: { operatorId: invite.operatorId, slug: invite.wikiPageSlug, scope: "operator" },
      select: { title: true },
    });
    if (page) personName = page.title;
  }

  return NextResponse.json({
    companyName: operator?.companyName || operator?.displayName || "Unknown",
    personName,
    role: invite.role,
    email: invite.email,
  });
}
