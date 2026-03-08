import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { getEntityCounts } from "@/lib/entity-model-store";

export async function GET() {
  const operatorId = await getOperatorId();

  const counts = await getEntityCounts(operatorId);

  return NextResponse.json({
    ...counts,
  });
}
