import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { detectSituations } from "@/lib/situation-detector";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { operatorId } = su;

  const results = await detectSituations(operatorId);

  return NextResponse.json({
    situationsCreated: results.length,
    details: results,
  });
}
