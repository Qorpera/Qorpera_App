import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listPolicies, createPolicy, updatePolicy, deletePolicy } from "@/lib/policy-engine";
import { createPolicySchema, parseBody } from "@/lib/api-validation";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;
  const policies = await listPolicies(operatorId);
  return NextResponse.json(policies);
}

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;
  const body = await req.json();
  const parsed = parseBody(createPolicySchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const policy = await createPolicy(operatorId, parsed.data, su.user.id);
  return NextResponse.json(policy, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;
  const { id, ...fields } = await req.json();
  const policy = await updatePolicy(operatorId, id, fields, su.user.id);
  if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(policy);
}

export async function DELETE(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;
  const { id } = await req.json();
  const ok = await deletePolicy(operatorId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
