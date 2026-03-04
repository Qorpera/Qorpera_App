import { NextRequest, NextResponse } from "next/server";
import { addProperty, updateProperty, deleteProperty } from "@/lib/entity-model-store";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const prop = await addProperty(id, body);
  return NextResponse.json(prop, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { propertyId, ...fields } = await req.json();
  const prop = await updateProperty(id, propertyId, fields);
  if (!prop) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(prop);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { propertyId } = await req.json();
  const ok = await deleteProperty(id, propertyId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
