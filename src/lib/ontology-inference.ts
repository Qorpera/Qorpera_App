import { callLLM, type AIMessage } from "@/lib/ai-provider";
import type { InferredSchema } from "@/lib/connectors/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type OntologyProposal = {
  entityTypes: Array<{
    name: string;
    slug: string;
    description: string;
    icon: string;
    color: string;
    sourceMapping: {
      connectorId: string;
      sourceFilter: { sheet?: string; eventType?: string };
      propertyMap: Record<string, string>;
      displayNameTemplate: string;
      identityFields: string[];
    };
    properties: Array<{
      name: string;
      slug: string;
      dataType: string;
      identityRole?: string;
      sourceColumn: string;
    }>;
  }>;
  relationshipTypes: Array<{
    name: string;
    slug: string;
    fromEntityTypeSlug: string;
    toEntityTypeSlug: string;
    description: string;
    inferenceReason: string;
  }>;
  summary: string;
};

// ── Inference ────────────────────────────────────────────────────────────────

export async function inferOntology(
  sources: Array<{
    connectorId: string;
    connectorName: string;
    providerType: string;
    schemas: InferredSchema[];
  }>,
  existingEntityTypes?: Array<{
    name: string;
    slug: string;
    properties: string[];
  }>
): Promise<OntologyProposal> {
  const sourceDescriptions = sources
    .map((src) => {
      const schemaDescs = src.schemas
        .map((s) => {
          const cols = s.suggestedProperties
            .map((p) => {
              const role = p.possibleRole ? ` (possible role: ${p.possibleRole})` : "";
              const samples = p.sampleValues.slice(0, 3).join(", ");
              return `      - "${p.name}" [${p.dataType}${role}] samples: ${samples}`;
            })
            .join("\n");
          return `    Sheet/Table: "${s.suggestedTypeName}" (${s.recordCount} records)\n${cols}`;
        })
        .join("\n\n");
      return `  Connector: "${src.connectorName}" (${src.providerType}, id: ${src.connectorId})\n${schemaDescs}`;
    })
    .join("\n\n");

  const existingDesc = existingEntityTypes?.length
    ? `\nEXISTING ENTITY TYPES (do not duplicate — extend if needed):\n${existingEntityTypes
        .map(
          (t) =>
            `  - ${t.slug} ("${t.name}") with properties: ${t.properties.join(", ") || "(none)"}`
        )
        .join("\n")}\n`
    : "";

  const systemPrompt = `You are an ontology designer. Given data source schemas, propose a unified ontology.

DATA SOURCES:
${sourceDescriptions}
${existingDesc}
RULES:
1. Create one entity type per distinct sheet/table. Do NOT merge sheets together.
2. Choose clean, descriptive English names and kebab-case slugs. If a sheet name like "Ark1" contains data that is clearly customers, name the entity type "Customer" with slug "customer".
3. Assign appropriate data types: STRING, NUMBER, DATE, BOOLEAN, CURRENCY, ENUM.
4. Identify which properties should be identity roles for deduplication: "email", "domain", or "phone".
5. Create a displayNameTemplate using {ColumnName} syntax referencing the original source column names.
6. Set identityFields to the source column names used for dedup (e.g. the column that contains email).
7. Suggest relationships between entity types where the data implies connections (e.g. a "Company" column in a contacts sheet implies a relationship to a companies entity type).
8. Assign appropriate lucide icon names (e.g. "users", "building-2", "file-text", "dollar-sign") and distinct hex colors.
9. Property slugs must be kebab-case. Property names should be clean English labels.
10. The propertyMap in sourceMapping maps source column names to property slugs.

OUTPUT FORMAT — respond with ONLY this JSON, no preamble:
{
  "entityTypes": [
    {
      "name": "Customer",
      "slug": "customer",
      "description": "...",
      "icon": "users",
      "color": "#3b82f6",
      "sourceMapping": {
        "connectorId": "...",
        "sourceFilter": { "sheet": "OriginalSheetName" },
        "propertyMap": { "Email": "email", "Navn": "name" },
        "displayNameTemplate": "{Navn}",
        "identityFields": ["Email"]
      },
      "properties": [
        { "name": "Email", "slug": "email", "dataType": "STRING", "identityRole": "email", "sourceColumn": "Email" },
        { "name": "Name", "slug": "name", "dataType": "STRING", "sourceColumn": "Navn" }
      ]
    }
  ],
  "relationshipTypes": [
    {
      "name": "Works At",
      "slug": "works-at",
      "fromEntityTypeSlug": "contact",
      "toEntityTypeSlug": "company",
      "description": "Contact is employed at this company",
      "inferenceReason": "The Contacts sheet has a 'Company' column matching company names"
    }
  ],
  "summary": "I found 203 customers in your 'Kunder' sheet with email, name, and company information..."
}`;

  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content:
        "Analyze the data sources above and propose an ontology. Return ONLY the JSON.",
    },
  ];

  const response = await callLLM(messages, {
    temperature: 0.2,
    maxTokens: 4096,
  });

  return parseOntologyResponse(response.content);
}

// ── Response Parser ──────────────────────────────────────────────────────────

function parseOntologyResponse(content: string): OntologyProposal {
  const trimmed = content.trim();

  // Strip markdown code fences if present
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : trimmed;

  // Try to extract a JSON object
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!objMatch) {
    throw new Error("Failed to extract JSON from LLM response");
  }

  const parsed = JSON.parse(objMatch[0]) as OntologyProposal;

  // Validate structure
  if (!Array.isArray(parsed.entityTypes)) {
    throw new Error("OntologyProposal missing entityTypes array");
  }

  for (const et of parsed.entityTypes) {
    if (!et.name || !et.slug || !Array.isArray(et.properties)) {
      throw new Error(
        `Invalid entity type: ${JSON.stringify({ name: et.name, slug: et.slug })}`
      );
    }
    if (et.properties.length === 0) {
      throw new Error(
        `Entity type "${et.slug}" must have at least one property`
      );
    }
    // Ensure slugs are kebab-case
    et.slug = toKebabCase(et.slug);
    for (const p of et.properties) {
      p.slug = toKebabCase(p.slug);
    }
  }

  if (!Array.isArray(parsed.relationshipTypes)) {
    parsed.relationshipTypes = [];
  }
  for (const rt of parsed.relationshipTypes) {
    rt.slug = toKebabCase(rt.slug);
  }

  if (typeof parsed.summary !== "string") {
    parsed.summary = `Proposed ${parsed.entityTypes.length} entity type(s) and ${parsed.relationshipTypes.length} relationship type(s).`;
  }

  return parsed;
}

function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}
