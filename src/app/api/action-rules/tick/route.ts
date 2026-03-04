import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { evaluateTickRules } from "@/lib/action-rule-store";

export async function POST() {
  const operatorId = await getOperatorId();
  const result = await evaluateTickRules(operatorId);
  return NextResponse.json(result);
}
