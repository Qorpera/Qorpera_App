import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { addItemToWorkStream } from "@/lib/workstreams";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const { id: workStreamId } = await params;

  if (user.role !== "admin" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json();
  const { itemType, itemId } = body;

  if (!itemType || !itemId) {
    return NextResponse.json({ error: "itemType and itemId are required" }, { status: 400 });
  }

  if (itemType !== "situation" && itemType !== "initiative") {
    return NextResponse.json({ error: "itemType must be 'situation' or 'initiative'" }, { status: 400 });
  }

  try {
    const item = await addItemToWorkStream(workStreamId, itemType, itemId, operatorId);
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add item";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
