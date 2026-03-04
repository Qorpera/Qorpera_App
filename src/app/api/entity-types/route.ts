import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { listEntityTypes, createEntityTypeWithProperties } from "@/lib/entity-model-store";

export async function GET() {
  const operatorId = await getOperatorId();
  const types = await listEntityTypes(operatorId);
  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const { properties, ...typeInput } = await req.json();
  const result = await createEntityTypeWithProperties(operatorId, typeInput, properties ?? []);
  return NextResponse.json(result, { status: 201 });
}
