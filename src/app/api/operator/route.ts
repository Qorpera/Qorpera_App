import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { id: true, displayName: true, companyName: true, industry: true, deletionRequestedAt: true, deletionScheduledFor: true },
  });
  if (!operator) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(operator);
}

export async function PATCH(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  if (su.user.role !== "admin" && su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.companyName !== undefined) {
    data.companyName = body.companyName;
    data.displayName = body.companyName;

    // Keep CompanyHQ entity in sync
    const orgType = await prisma.entityType.findFirst({
      where: { operatorId, slug: "organization" },
    });
    if (orgType) {
      await prisma.entity.updateMany({
        where: { operatorId, entityTypeId: orgType.id, category: "foundational" },
        data: { displayName: body.companyName },
      });
    }
  }

  if (body.industry !== undefined) {
    data.industry = body.industry || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.operator.update({
    where: { id: operatorId },
    data,
    select: { id: true, displayName: true, companyName: true, industry: true },
  });

  return NextResponse.json(updated);
}
