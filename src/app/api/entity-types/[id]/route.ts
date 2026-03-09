import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { updateEntityType, deleteEntityType, getEntityType } from "@/lib/entity-model-store";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const t = await getEntityType(operatorId, id);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const body = await req.json();
  const t = await updateEntityType(operatorId, id, body);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const ok = await deleteEntityType(operatorId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
