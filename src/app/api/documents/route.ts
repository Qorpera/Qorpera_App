import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const operatorId = await getOperatorId();

  const docs = await prisma.internalDocument.findMany({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      status: true,
      businessContext: true,
      createdAt: true,
    },
  });

  return NextResponse.json(docs);
}

export async function DELETE(req: NextRequest) {
  const operatorId = await getOperatorId();
  const { id } = await req.json();

  await prisma.internalDocument.deleteMany({
    where: { id, operatorId },
  });

  return NextResponse.json({ ok: true });
}
