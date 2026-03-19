import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const itemType = req.nextUrl.searchParams.get("itemType");
  const itemId = req.nextUrl.searchParams.get("itemId");

  if (!itemType || !itemId) {
    return NextResponse.json({ error: "itemType and itemId are required" }, { status: 400 });
  }

  const item = await prisma.workStreamItem.findFirst({
    where: {
      itemType,
      itemId,
      workStream: { operatorId },
    },
    select: {
      workStreamId: true,
      workStream: { select: { title: true } },
    },
  });

  return NextResponse.json({
    workStreamId: item?.workStreamId ?? null,
    workStreamTitle: item?.workStream.title ?? null,
  });
}
