import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { addProperty, updateProperty, deleteProperty } from "@/lib/entity-model-store";
import { prisma } from "@/lib/db";

async function verifyEntityTypeOwnership(entityTypeId: string, operatorId: string) {
  return prisma.entityType.findFirst({ where: { id: entityTypeId, operatorId } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await verifyEntityTypeOwnership(id, su.operatorId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const prop = await addProperty(id, body);
  return NextResponse.json(prop, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await verifyEntityTypeOwnership(id, su.operatorId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { propertyId, ...fields } = await req.json();
  const prop = await updateProperty(id, propertyId, fields);
  if (!prop) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(prop);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await verifyEntityTypeOwnership(id, su.operatorId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { propertyId } = await req.json();
  const ok = await deleteProperty(id, propertyId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
