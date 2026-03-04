import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { acceptRecommendation, dismissRecommendation } from "@/lib/recommendation-engine";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const operatorId = await getOperatorId();
  const body = await req.json();
  const action = body.action as string | undefined;

  if (action !== "accept" && action !== "dismiss") {
    return NextResponse.json({ error: "action must be 'accept' or 'dismiss'" }, { status: 400 });
  }

  try {
    if (action === "accept") {
      await acceptRecommendation(operatorId, id);
    } else {
      await dismissRecommendation(operatorId, id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
