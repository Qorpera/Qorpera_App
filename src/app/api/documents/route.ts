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
      extractedEntities: true,
      createdAt: true,
    },
  });

  // Parse extraction errors server-side for a cleaner API surface
  const docsWithErrors = docs.map((doc) => {
    let extractionError: string | null = null;
    if (doc.extractedEntities) {
      try {
        const parsed = JSON.parse(doc.extractedEntities);
        if (parsed.error) extractionError = parsed.error;
      } catch { /* ignore */ }
    }
    return {
      id: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      status: doc.status,
      businessContext: doc.businessContext,
      extractionError,
      createdAt: doc.createdAt,
    };
  });

  return NextResponse.json(docsWithErrors);
}

export async function DELETE(req: NextRequest) {
  const operatorId = await getOperatorId();
  const { id } = await req.json();

  // Find entities created from this document
  const docEntities = await prisma.entity.findMany({
    where: { operatorId, sourceSystem: "document", externalId: id },
    select: {
      id: true,
      mentions: { select: { sourceType: true, sourceId: true } },
    },
  });

  // Only delete entities whose ONLY mentions trace back to this document
  const entitiesToDelete: string[] = [];
  for (const ent of docEntities) {
    const hasOtherSources = ent.mentions.some(
      (m) => !(m.sourceType === "internal_document" && m.sourceId === id),
    );
    if (!hasOtherSources) {
      entitiesToDelete.push(ent.id);
    }
  }

  if (entitiesToDelete.length > 0) {
    // Delete relationships involving these entities (no cascade on Relationship FK)
    await prisma.relationship.deleteMany({
      where: {
        OR: [
          { fromEntityId: { in: entitiesToDelete } },
          { toEntityId: { in: entitiesToDelete } },
        ],
      },
    });

    // Delete entities (PropertyValue + EntityMention cascade automatically)
    await prisma.entity.deleteMany({
      where: { id: { in: entitiesToDelete } },
    });
  }

  // Delete the document itself
  await prisma.internalDocument.deleteMany({
    where: { id, operatorId },
  });

  return NextResponse.json({
    ok: true,
    entitiesRemoved: entitiesToDelete.length,
  });
}
