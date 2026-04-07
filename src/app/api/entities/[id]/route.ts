import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getEntity, updateEntity, deleteEntity } from "@/lib/entity-model-store";
import { updateEntitySchema, parseBody } from "@/lib/api-validation";
import { getVisibleDomainIds, canAccessEntity } from "@/lib/domain-scope";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, su.user.id);
  if (!(await canAccessEntity(id, visibleDomains, operatorId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const entity = await getEntity(operatorId, id);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(entity);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, su.user.id);
  if (!(await canAccessEntity(id, visibleDomains, operatorId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = parseBody(updateEntitySchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const entity = await updateEntity(operatorId, id, parsed.data);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(entity);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, su.user.id);
  if (!(await canAccessEntity(id, visibleDomains, operatorId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ok = await deleteEntity(operatorId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
