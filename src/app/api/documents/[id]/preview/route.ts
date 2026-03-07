import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  const doc = await prisma.internalDocument.findFirst({
    where: { id, operatorId },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (doc.status === "uploaded" || doc.status === "processing") {
    return NextResponse.json({ error: "Not yet extracted" }, { status: 400 });
  }

  const extraction = doc.extractedEntities ? JSON.parse(doc.extractedEntities) : {};

  return NextResponse.json({
    entities: extraction.entities ?? [],
    relationships: extraction.relationships ?? [],
    businessContext: extraction.businessContext ?? doc.businessContext ?? "",
  });
}
