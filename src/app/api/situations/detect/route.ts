import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { detectSituations } from "@/lib/situation-detector";

export async function POST() {
  const operatorId = await getOperatorId();

  const results = await detectSituations(operatorId);

  return NextResponse.json({
    situationsCreated: results.length,
    details: results,
  });
}
