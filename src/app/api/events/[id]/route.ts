import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  const event = await prisma.event.findFirst({
    where: { id, operatorId },
  });

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const entityRefs = event.entityRefs ? JSON.parse(event.entityRefs) : [];

  return NextResponse.json({ ...event, entityRefs });
}
