import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import { buildDomainContext } from "@/lib/knowledge/chunk-classifier";

const MAX_TOTAL_REEVALUATIONS = 300; // Safety cap across all operators

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const operators = await prisma.operator.findMany({
    where: { aiPaused: false, isTestOperator: false },
    select: { id: true },
  });

  const client = new Anthropic();
  const model = getModel("chunkClassification");

  const results: { operatorId: string; reevaluated: number; changed: number }[] = [];
  let totalReevaluated = 0;
  let totalChanged = 0;

  for (const operator of operators) {
    const operatorId = operator.id;

    // Budget-aware limit
    const remaining = MAX_TOTAL_REEVALUATIONS - totalReevaluated;
    const limit = Math.min(100, remaining);

    // Step 1 — Pick random classified-but-not-reevaluated chunks
    const chunks = await prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        sourceType: string;
        metadata: string | null;
        domainIds: string | null;
      }>
    >`
      SELECT id, content, "sourceType", metadata, "domainIds"
      FROM "ContentChunk"
      WHERE "operatorId" = ${operatorId}
        AND "classifiedAt" IS NOT NULL
        AND "reevaluatedAt" IS NULL
      ORDER BY RANDOM()
      LIMIT ${limit}
    `;

    if (chunks.length === 0) continue;

    // Step 2 — Build department context (shared helper)
    const { domains, contextString } = await buildDomainContext(operatorId);
    if (domains.length === 0) continue;

    // Step 3 — Evaluate each chunk individually via Haiku
    let reevaluated = 0;
    let changed = 0;

    for (const chunk of chunks) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 256,
          temperature: 0,
          system: `You are a content classifier for a business intelligence system.
Given the departments below, determine which department(s) this content chunk belongs to.
If it's general/company-wide content, respond "ALL".
Respond with ONLY a JSON object, no other text: {"domainIds": ["id1", "id2"]} or {"domainIds": "ALL"}

Departments:
${contextString}`,
          messages: [
            {
              role: "user",
              content: `Source type: ${chunk.sourceType}\nContent:\n${chunk.content.slice(0, 500)}`,
            },
          ],
        });

        // Parse response
        const text =
          response.content[0]?.type === "text" ? response.content[0].text : "";
        const parsed = extractJSON(text) as {
          domainIds: string[] | "ALL";
        } | null;

        if (!parsed?.domainIds) {
          // Couldn't parse — mark as reevaluated but don't change departments
          await prisma.contentChunk.update({
            where: { id: chunk.id },
            data: { reevaluatedAt: new Date() },
          });
          reevaluated++;
          continue;
        }

        let newDeptIds: string[];
        if (parsed.domainIds === "ALL") {
          newDeptIds = domains.map((d) => d.id);
        } else {
          // Filter to only valid department IDs
          const validIds = new Set(domains.map((d) => d.id));
          newDeptIds = parsed.domainIds.filter((id) => validIds.has(id));
          if (newDeptIds.length === 0) {
            // Haiku returned invalid IDs — assign to all as fallback
            newDeptIds = domains.map((d) => d.id);
          }
        }

        // Check if departments actually changed
        const oldDeptIds = chunk.domainIds
          ? (JSON.parse(chunk.domainIds) as string[])
          : [];
        const oldSet = new Set(oldDeptIds);
        const newSet = new Set(newDeptIds);
        const didsChange =
          oldSet.size !== newSet.size || [...newSet].some((id) => !oldSet.has(id));

        if (didsChange) changed++;

        await prisma.contentChunk.update({
          where: { id: chunk.id },
          data: {
            domainIds: JSON.stringify(newDeptIds),
            reevaluatedAt: new Date(),
            classificationMethod: "llm",
          },
        });
        reevaluated++;
      } catch (err) {
        // Skip this chunk on failure — it'll be picked up next time since reevaluatedAt stays null
        console.warn(
          `[reevaluate-chunks] Failed to reevaluate chunk ${chunk.id}:`,
          err,
        );
      }
    }

    // Step 4 — Log results
    console.log(
      `[reevaluate-chunks] Operator ${operatorId}: ${reevaluated}/${chunks.length} reevaluated, ${changed} changed departments`,
    );

    results.push({ operatorId, reevaluated, changed });
    totalReevaluated += reevaluated;
    totalChanged += changed;

    if (totalReevaluated >= MAX_TOTAL_REEVALUATIONS) {
      console.log(`[reevaluate-chunks] Hit global cap of ${MAX_TOTAL_REEVALUATIONS}, stopping early`);
      break;
    }
  }

  return NextResponse.json({
    operators: results.length,
    totalReevaluated,
    totalChanged,
  });
}
