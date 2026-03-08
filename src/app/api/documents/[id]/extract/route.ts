import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { callLLM, getAIConfig } from "@/lib/ai-provider";
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
      try {
        const { PDFParse } = await import("pdf-parse");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parser = new PDFParse({ data: buffer, verbosity: 0 }) as any;
        await parser.load();
        const result = await parser.getText();
        const text = typeof result === "string" ? result : result?.text;
        if (!text || text.trim().length < 10) {
          return null; // Scanned PDF with no text layer
        }
        return text;
      } catch (pdfErr) {
        console.error("[extract] PDF parse error:", pdfErr);
        return null;
      }
    }

    case "image/png":
    case "image/jpeg":
    case "image/webp": {
      // Send as proper multimodal content blocks
      const base64 = buffer.toString("base64");
      try {
        const response = await callLLM([
          {
            role: "user",
            content: [
              { type: "image_base64", mediaType: mimeType, data: base64 },
              { type: "text", text: "Describe the organizational structure, team members, roles, and relationships shown in this image. Be specific about names, titles, and reporting lines." },
            ],
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

async function buildExtractionPrompt(operatorId: string): Promise<string> {
  // Fetch existing entity types + properties from the knowledge graph
  const dbTypes = await prisma.entityType.findMany({
    where: { operatorId },
    include: {
      properties: {
        select: { slug: true, name: true, dataType: true },
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  const relTypes = await prisma.relationshipType.findMany({
    where: { operatorId },
    select: { slug: true, name: true },
  });

  // Build existing types section
  let existingTypesSection = "";
  if (dbTypes.length > 0) {
    const typeDescs = dbTypes.map((t) => {
      const props = t.properties.map((p) => `      - ${p.slug} (${p.dataType})`).join("\n");
      return `    ${t.slug} ("${t.name}"):\n${props || "      (no properties defined)"}`;
    }).join("\n");
    existingTypesSection = `\nEXISTING ENTITY TYPES IN THIS BUSINESS (use these when the data matches):\n${typeDescs}\n`;
  }

  // Build existing relationship types section
  let existingRelSection = "";
  if (relTypes.length > 0) {
    const relDescs = relTypes.map((r) => `    - ${r.slug} ("${r.name}")`).join("\n");
    existingRelSection = `\nEXISTING RELATIONSHIP TYPES:\n${relDescs}\n`;
  }

  const ontologyIsEmpty = dbTypes.length === 0;

  return `You are building a knowledge graph for a business operations platform. Your job is to read this document thoroughly and extract EVERY entity, relationship, and piece of business context that could be operationally useful.

Think of yourself as an analyst mapping out everything this document tells you about how this business works — the people, companies, products, markets, processes, goals, metrics, and relationships between them.
${existingTypesSection}${existingRelSection}
ENTITY TYPE GUIDANCE:

For organizational data, use these standard types:
    team-member, department, organization, role, process, policy

For business data, ${ontologyIsEmpty
    ? "you are building the ontology from scratch. PROPOSE NEW TYPES for everything you find."
    : "use existing types where they fit, and PROPOSE NEW TYPES for data that doesn't match."
} Examples of types you might propose:
    - customer, vendor, partner, competitor (external entities)
    - product, service, feature (what the business offers)
    - market-segment, target-audience, region (market context)
    - strategic-goal, initiative, milestone, kpi (planning)
    - budget-line, cost-center, revenue-stream (financial)
    - tool, platform, integration (technology)

EXTRACTION RULES:
1. Be THOROUGH. Extract every named entity — people, companies, products, markets, tools, goals, metrics.
2. For each entity, capture all properties mentioned in the text (amounts, dates, descriptions, statuses).
3. Map relationships between entities — who works for whom, which product serves which market, which goal relates to which metric.
4. For NEW entity types, define them with descriptive names and relevant properties including data types.
5. The businessContext field should capture strategic information, business rules, priorities, and context that doesn't fit neatly into entities — this is injected into AI reasoning prompts later.
6. Use kebab-case for all slugs. Use proper English names for display names.
7. Data types: STRING, NUMBER, DATE, BOOLEAN, CURRENCY, ENUM.

Return ONLY valid JSON (no markdown fences, no commentary):
{
  "entities": [
    {
      "type": "entity-type-slug",
      "displayName": "Entity Name",
      "properties": { "property-slug": "value" },
      "isNewType": true
    }
  ],
  "newEntityTypes": [
    {
      "slug": "strategic-goal",
      "name": "Strategic Goal",
      "description": "A high-level business objective or target",
      "properties": [
        { "slug": "target-date", "name": "Target Date", "dataType": "DATE" },
        { "slug": "status", "name": "Status", "dataType": "STRING" },
        { "slug": "description", "name": "Description", "dataType": "STRING" }
      ]
    }
  ],
  "relationships": [
    { "fromName": "Entity A", "toName": "Entity B", "type": "relationship-slug" }
  ],
  "businessContext": "Comprehensive summary of business rules, strategy, priorities, and operational context from this document"
}

IMPORTANT: Every entity with isNewType=true MUST have a corresponding entry in newEntityTypes defining the type. Extract as many entities as the document supports — a 2-page strategy document typically contains 10-30 entities across multiple types.`;
}

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

    console.log(`[extract] Doc ${id} (${doc.mimeType}): text extraction ${rawText ? `succeeded (${rawText.length} chars)` : "FAILED"}`);

    if (!rawText) {
      const isImage = doc.mimeType.startsWith("image/");
      const isPdf = doc.mimeType === "application/pdf";
      const errorNote = isImage
        ? "Image extraction requires a vision-capable AI provider. Configure one in Settings."
        : isPdf
          ? "Could not extract text from this PDF. It may be a scanned document without a text layer, or the file may be corrupted."
          : "Could not extract text from this file.";

      // Don't fake "extracted" — revert to "uploaded" so the user sees it failed
      await prisma.internalDocument.update({
        where: { id },
        data: {
          status: "uploaded",
          rawText: null,
          extractedEntities: JSON.stringify({
            entities: [],
            newEntityTypes: [],
            relationships: [],
            businessContext: errorNote,
            error: errorNote,
          }),
        },
      });

      return NextResponse.json({ error: errorNote }, { status: 422 });
    }

    // Truncate text for LLM (safety)
    const textForLLM = rawText.slice(0, 15000);

    // Build ontology-aware prompt, then run both extractors in parallel:
    // Step 2: Ontology-aware extraction (knows existing types + can propose new ones)
    // Step 3: Schema-strict extraction (only entities matching defined types)
    const extractionPrompt = await buildExtractionPrompt(operatorId);

    const aiConfig = await getAIConfig();
    console.log(`[extract] Using AI provider: ${aiConfig.provider}, model: ${aiConfig.model}`);

    type NewEntityTypeDef = { slug: string; name: string; description?: string; properties?: Array<{ slug: string; name: string; dataType?: string }> };

    const [internalResult, schemaResult] = await Promise.all([
      callLLM(
        [
          { role: "system", content: extractionPrompt },
          { role: "user", content: `Read this document carefully and extract ALL entities, relationships, and business context.\n\nDOCUMENT TEXT:\n\n${textForLLM}` },
        ],
        { temperature: 0.2, maxTokens: 8000 },
      ).then((response) => {
        console.log(`[extract] LLM response length: ${response.content.length} chars`);
        const parsed = extractJSON(response.content);
        if (!parsed) {
          console.error(`[extract] Failed to parse LLM response as JSON. First 500 chars:`, response.content.slice(0, 500));
        }
        const result = {
          entities: (Array.isArray(parsed?.entities) ? parsed.entities : []) as Array<{ type: string; displayName: string; properties?: Record<string, string> }>,
          newEntityTypes: (Array.isArray(parsed?.newEntityTypes) ? parsed.newEntityTypes : []) as NewEntityTypeDef[],
          relationships: (Array.isArray(parsed?.relationships) ? parsed.relationships : []) as Array<{ fromName: string; toName: string; type: string }>,
          businessContext: typeof parsed?.businessContext === "string" ? parsed.businessContext : "",
        };
        console.log(`[extract] Ontology-aware: ${result.entities.length} entities, ${result.newEntityTypes.length} new types, ${result.relationships.length} relationships`);
        return result;
      }).catch((err) => {
        console.error(`[extract] Ontology-aware extraction failed:`, err);
        return { entities: [], newEntityTypes: [] as NewEntityTypeDef[], relationships: [], businessContext: "" };
      }),

      extractEntitiesFromText(operatorId, textForLLM).then((result) => {
        console.log(`[extract] Schema-strict: ${result.entities.length} entities, ${result.relationships.length} relationships`);
        return result;
      }).catch((err) => {
        console.error(`[extract] Schema-strict extraction failed:`, err);
        return {
          entities: [] as Array<{ name: string; type: string; properties: Record<string, string> }>,
          relationships: [] as Array<{ from: string; to: string; type: string }>,
        };
      }),
    ]);

    // Merge: internal entities first, then schema-aware entities (deduped by name)
    const entities = [...internalResult.entities];
    const newEntityTypes = [...internalResult.newEntityTypes];
    const relationships = [...internalResult.relationships];
    const businessContext = internalResult.businessContext;

    if (schemaResult.entities.length > 0) {
      const existingNames = new Set(entities.map((e) => e.displayName?.toLowerCase()));
      for (const se of schemaResult.entities) {
        if (!existingNames.has(se.name.toLowerCase())) {
          entities.push({ type: se.type, displayName: se.name, properties: se.properties });
          existingNames.add(se.name.toLowerCase());
        }
      }
    }
    if (schemaResult.relationships.length > 0) {
      for (const sr of schemaResult.relationships) {
        relationships.push({ fromName: sr.from, toName: sr.to, type: sr.type });
      }
    }

    const extraction = { entities, newEntityTypes, relationships, businessContext };

    console.log(`[extract] Final merged: ${entities.length} entities, ${newEntityTypes.length} new types, ${relationships.length} relationships`);

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
        extractedEntities: JSON.stringify({ entities: [], newEntityTypes: [], relationships: [], error: msg }),
      },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
