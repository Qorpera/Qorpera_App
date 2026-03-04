import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { getEntity, updateEntity, deleteEntity } from "@/lib/entity-model-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operatorId = await getOperatorId();
  const entity = await getEntity(operatorId, id);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(entity);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operatorId = await getOperatorId();
  const body = await req.json();
  const entity = await updateEntity(operatorId, id, body);
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(entity);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operatorId = await getOperatorId();
  const ok = await deleteEntity(operatorId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
