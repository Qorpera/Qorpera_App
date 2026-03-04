import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { getGraphData } from "@/lib/entity-model-store";

export async function GET() {
  const operatorId = await getOperatorId();
  const data = await getGraphData(operatorId);
  return NextResponse.json(data);
}
