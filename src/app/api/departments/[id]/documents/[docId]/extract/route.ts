import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isStructuralSlot } from "@/lib/document-slots";
import {
  extractStructuralDocument,
  generateExtractionDiff,
} from "@/lib/structural-extraction";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const operatorId = await getOperatorId();
  const { id: departmentId, docId } = await params;

  const doc = await prisma.internalDocument.findFirst({
    where: { id: docId, departmentId, operatorId },
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (!isStructuralSlot(doc.documentType)) {
    return NextResponse.json(
      { error: "Only structural documents can be extracted (not context docs)" },
      { status: 400 },
    );
  }
  if (!doc.rawText) {
    return NextResponse.json(
      { error: "Text extraction has not completed yet. Please wait and try again." },
      { status: 400 },
    );
  }

  // Run structural extraction
  const extraction = await extractStructuralDocument(docId, operatorId);

  // Generate diff against current department state
  const diff = await generateExtractionDiff(extraction, departmentId, operatorId);

  // Store extraction result and diff
  await prisma.internalDocument.update({
    where: { id: docId },
    data: {
      extractedEntities: JSON.stringify({ extraction, diff }),
      status: "extracted",
    },
  });

  return NextResponse.json({ extraction, diff });
}
