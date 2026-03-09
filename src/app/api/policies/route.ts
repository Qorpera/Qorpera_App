import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { listPolicies, createPolicy, updatePolicy, deletePolicy } from "@/lib/policy-engine";
import { createPolicySchema, parseBody } from "@/lib/api-validation";

export async function GET() {
  const operatorId = await getOperatorId();
  const policies = await listPolicies(operatorId);
  return NextResponse.json(policies);
}

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();
  const parsed = parseBody(createPolicySchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const policy = await createPolicy(operatorId, parsed.data);
  return NextResponse.json(policy, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const operatorId = await getOperatorId();
  const { id, ...fields } = await req.json();
  const policy = await updatePolicy(operatorId, id, fields);
  if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(policy);
}

export async function DELETE(req: NextRequest) {
  const operatorId = await getOperatorId();
  const { id } = await req.json();
  const ok = await deletePolicy(operatorId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
