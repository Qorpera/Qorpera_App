import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { relateEntities } from "@/lib/entity-resolution";
import { assignDomainSchema, parseBody } from "@/lib/api-validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { operatorId } = su;
  const { id } = await params;
  const body = await req.json();
  const parsed = parseBody(assignDomainSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { domainId } = parsed.data;

  const entity = await prisma.entity.findFirst({
    where: { id, operatorId, status: "active" },
  });
  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const dept = await prisma.entity.findFirst({
    where: { id: domainId, operatorId, category: "foundational", status: "active" },
  });
  if (!dept) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  await relateEntities(operatorId, id, domainId, "domain-member");

  return NextResponse.json({ ok: true });
}
