import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listRelationshipTypes, createRelationshipType, createRelationship } from "@/lib/entity-model-store";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const types = await listRelationshipTypes(operatorId);
  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const body = await req.json();

  // If fromEntityId and toEntityId are provided, create a relationship instance
  if (body.fromEntityId && body.toEntityId && body.relationshipTypeId) {
    const rel = await createRelationship(operatorId, body);
    if (!rel) return NextResponse.json({ error: "Entities not found" }, { status: 404 });
    return NextResponse.json(rel, { status: 201 });
  }

  // Creating relationship TYPES is admin-only
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const type = await createRelationshipType(operatorId, body);
  return NextResponse.json(type, { status: 201 });
}
