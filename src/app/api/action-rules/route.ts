import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import {
  listActionRules,
  createActionRule,
  updateActionRule,
  deleteActionRule,
} from "@/lib/action-rule-store";

export async function GET() {
  const operatorId = await getOperatorId();
  const rules = await listActionRules(operatorId);
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();
  const rule = await createActionRule(operatorId, body);
  return NextResponse.json(rule, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const operatorId = await getOperatorId();
  const { id, ...fields } = await req.json();
  const rule = await updateActionRule(operatorId, id, fields);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rule);
}

export async function DELETE(req: NextRequest) {
  const operatorId = await getOperatorId();
  const { id } = await req.json();
  const ok = await deleteActionRule(operatorId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
