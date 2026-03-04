import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { listRelationshipTypes, createRelationshipType, createRelationship } from "@/lib/entity-model-store";

export async function GET() {
  const operatorId = await getOperatorId();
  const types = await listRelationshipTypes(operatorId);
  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();

  // If fromEntityId and toEntityId are provided, create an instance
  if (body.fromEntityId && body.toEntityId && body.relationshipTypeId) {
    const rel = await createRelationship(operatorId, body);
    if (!rel) return NextResponse.json({ error: "Entities not found" }, { status: 404 });
    return NextResponse.json(rel, { status: 201 });
  }

  // Otherwise create a type
  const type = await createRelationshipType(operatorId, body);
  return NextResponse.json(type, { status: 201 });
}
