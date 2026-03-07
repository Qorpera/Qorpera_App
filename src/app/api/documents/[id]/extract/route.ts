import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { extractEntitiesFromText } from "@/lib/entity-extractor";
import { readFile } from "fs/promises";

// ── Text Extraction ───────────────────────────────────────────────────────────

async function extractTextFromFile(filePath: string, mimeType: string): Promise<string | null> {
  const buffer = await readFile(filePath);

  switch (mimeType) {
    case "text/plain":
      return buffer.toString("utf-8");

    case "text/csv": {
      const Papa = (await import("papaparse")).default;
      const text = buffer.toString("utf-8");
      const parsed = Papa.parse(text, { header: true });
      if (!parsed.data || parsed.data.length === 0) return text;
      const headers = parsed.meta.fields ?? [];
      const rows = (parsed.data as Record<string, string>[]).map((row, i) => {
        const fields = headers.map((h) => `${h}: ${row[h] ?? ""}`).join(", ");
        return `Record ${i + 1}: ${fields}`;
      });
      return `CSV with ${rows.length} records.\nHeaders: ${headers.join(", ")}\n\n${rows.join("\n")}`;
    }

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case "application/pdf": {
      const { PDFParse } = await import("pdf-parse");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parser = new PDFParse({ data: buffer, verbosity: 0 }) as any;
      await parser.load();
      const result = await parser.getText();
      return typeof result === "string" ? result : (result?.text ?? String(result));
    }

    case "image/png":
    case "image/jpeg":
    case "image/webp": {
      // Try vision extraction via LLM
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;
      try {
        const response = await callLLM([
          {
            role: "user",
            content: `[Image: ${dataUrl}]\n\nDescribe the organizational structure, team members, roles, and relationships shown in this image. Be specific about names, titles, and reporting lines.`,
          },
        ], { temperature: 0.2, maxTokens: 2000 });
        return response.content || null;
      } catch {
        return null;
      }
    }

    default:
      return null;
  }
}

// ── JSON Extraction ───────────────────────────────────────────────────────────

function extractJSON(text: string): Record<string, unknown> | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── LLM Entity Extraction ─────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `Extract structured business information from this document.

Return ONLY valid JSON (no markdown fences, no commentary):
{
  "entities": [
    {
      "type": "team-member" | "department" | "organization" | "role" | "process" | "policy",
      "displayName": "string",
      "properties": { "key": "value" }
    }
  ],
  "relationships": [
    {
      "fromName": "entity display name",
      "toName": "entity display name",
      "type": "has-department" | "has-member" | "manages" | "owns-account" | "reports-to"
    }
  ],
  "businessContext": "Free-text summary of business rules, processes, or context described in this document"
}

Guidelines:
- For team rosters/org charts: extract each person as "team-member" with properties like title, email, phone
- For department structures: extract departments and their hierarchy
- For process documents: extract as "process" entities with description properties
- Relationship types: "has-department" (org→dept), "has-member" (dept→person), "manages" (person→person), "reports-to" (person→person), "owns-account" (person→external entity)
- Be specific — use actual names and titles from the document`;

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(
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

  // Mark as processing
  await prisma.internalDocument.update({
    where: { id },
    data: { status: "processing" },
  });

  try {
    // Extract text
    const rawText = await extractTextFromFile(doc.filePath, doc.mimeType);

    if (!rawText) {
      const isImage = doc.mimeType.startsWith("image/");
      const errorNote = isImage
        ? "Image extraction requires a vision-capable AI provider. Configure one in Settings."
        : "Could not extract text from this file.";

      await prisma.internalDocument.update({
        where: { id },
        data: {
          status: "extracted",
          rawText: null,
          extractedEntities: JSON.stringify({
            entities: [],
            relationships: [],
            businessContext: errorNote,
          }),
          businessContext: errorNote,
        },
      });

      return NextResponse.json({ status: "extracted", note: errorNote });
    }

    // Truncate text for LLM (safety)
    const textForLLM = rawText.slice(0, 15000);

    // LLM extraction
    const response = await callLLM(
      [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: `DOCUMENT TEXT:\n\n${textForLLM}` },
      ],
      { temperature: 0.2, maxTokens: 4000 },
    );

    const parsed = extractJSON(response.content);
    const entities = Array.isArray(parsed?.entities) ? parsed.entities : [];
    const relationships = Array.isArray(parsed?.relationships) ? parsed.relationships : [];
    const businessContext = typeof parsed?.businessContext === "string" ? parsed.businessContext : "";

    // Also run the schema-aware extractor if entity types exist.
    // This catches entities matching the operator's existing ontology that
    // the generic document prompt might miss or mis-type.
    try {
      const schemaResult = await extractEntitiesFromText(operatorId, textForLLM);
      if (schemaResult.entities.length > 0) {
        const existingNames = new Set(entities.map((e: { displayName?: string }) => e.displayName?.toLowerCase()));
        for (const se of schemaResult.entities) {
          if (!existingNames.has(se.name.toLowerCase())) {
            entities.push({ type: se.type, displayName: se.name, properties: se.properties });
          }
        }
      }
      if (schemaResult.relationships.length > 0) {
        for (const sr of schemaResult.relationships) {
          relationships.push({ fromName: sr.from, toName: sr.to, type: sr.type });
        }
      }
    } catch {
      // Schema-aware extraction is best-effort — generic results are still valid
    }

    const extraction = { entities, relationships, businessContext };

    await prisma.internalDocument.update({
      where: { id },
      data: {
        status: "extracted",
        rawText,
        extractedEntities: JSON.stringify(extraction),
        businessContext,
      },
    });

    return NextResponse.json({ status: "extracted", ...extraction });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.internalDocument.update({
      where: { id },
      data: {
        status: "uploaded",
        extractedEntities: JSON.stringify({ error: msg }),
      },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
