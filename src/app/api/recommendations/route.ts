import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { listRecommendations, generateRecommendations } from "@/lib/recommendation-engine";

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  const recommendations = await listRecommendations(operatorId, status);
  return NextResponse.json({ recommendations });
}

export async function POST() {
  const operatorId = await getOperatorId();

  try {
    await generateRecommendations(operatorId);
    const recommendations = await listRecommendations(operatorId, "active");
    return NextResponse.json({ ok: true, count: recommendations.length, recommendations });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
