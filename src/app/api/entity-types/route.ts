import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listEntityTypes, createEntityTypeWithProperties } from "@/lib/entity-model-store";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const types = await listEntityTypes(operatorId);
  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const { properties, ...typeInput } = await req.json();
  const result = await createEntityTypeWithProperties(operatorId, typeInput, properties ?? []);
  return NextResponse.json(result, { status: 201 });
}
