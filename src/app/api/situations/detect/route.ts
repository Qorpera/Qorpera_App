import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { detectSituations } from "@/lib/situation-detector";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const results = await detectSituations(operatorId);

  return NextResponse.json({
    situationsCreated: results.length,
    details: results,
  });
}
