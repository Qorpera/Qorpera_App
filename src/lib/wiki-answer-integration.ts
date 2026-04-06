/**
 * Integrates human-confirmed answers from onboarding into wiki pages.
 * Human answers are the highest-authority input — they override synthesized content
 * and mark pages as verified.
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { embedChunks } from "@/lib/rag/embedder";
import { searchPages, createVersionSnapshot } from "@/lib/wiki-engine";

const MAX_WIKI_UPDATES = 10;

export async function updateWikiFromAnswers(
  operatorId: string,
  answeredQuestions: Array<Record<string, unknown>>,
): Promise<{ pagesUpdated: number; pagesCreated: number; skipped: number }> {
  const stats = { pagesUpdated: 0, pagesCreated: 0, skipped: 0 };
  let updateCount = 0;

  for (const q of answeredQuestions) {
    if (updateCount >= MAX_WIKI_UPDATES) break;

    const answer = String(q.userAnswer ?? "");
    const question = String(q.question ?? "");
    const context = String(q.context ?? "");

    // Skip trivial answers (yes/no, very short)
    if (answer.length < 20 && !answer.match(/\d/)) {
      stats.skipped++;
      continue;
    }

    // Strategy 1: If the question references an entity name, find that entity's wiki page
    let targetPage = await findPageByQuestionContext(operatorId, question, context);

    // Strategy 2: Semantic search for the most relevant wiki page
    if (!targetPage) {
      const searchQuery = `${question} ${answer}`.slice(0, 200);
      const results = await searchPages(operatorId, searchQuery, {
        limit: 1,
        statusFilter: ["verified", "stale", "draft"],
      });
      if (results.length > 0) {
        const page = await prisma.knowledgePage.findFirst({
          where: { operatorId, slug: results[0].slug, scope: "operator" },
          select: { id: true, slug: true, title: true, content: true, pageType: true, version: true, sourceCount: true },
        });
        if (page) targetPage = page;
      }
    }

    if (targetPage) {
      const updated = await integrateAnswerIntoPage(operatorId, targetPage, question, answer, context);
      if (updated) {
        stats.pagesUpdated++;
        updateCount++;
      }
    } else {
      const created = await createPageFromAnswer(operatorId, question, answer, context);
      if (created) {
        stats.pagesCreated++;
        updateCount++;
      }
    }
  }

  console.log(
    `[wiki-answers] Integrated ${stats.pagesUpdated} updated, ${stats.pagesCreated} created, ${stats.skipped} skipped`,
  );
  return stats;
}

async function findPageByQuestionContext(
  operatorId: string,
  question: string,
  context: string,
): Promise<{ id: string; slug: string; title: string; content: string; pageType: string; version: number; sourceCount: number } | null> {
  const combined = `${question} ${context}`;

  const entities = await prisma.entity.findMany({
    where: { operatorId, status: "active" },
    select: { id: true, displayName: true },
  });

  for (const entity of entities) {
    if (entity.displayName.length >= 3 && combined.includes(entity.displayName)) {
      const page = await prisma.knowledgePage.findFirst({
        where: {
          operatorId,
          scope: "operator",
          subjectEntityId: entity.id,
          status: { in: ["verified", "stale", "draft"] },
        },
        select: { id: true, slug: true, title: true, content: true, pageType: true, version: true, sourceCount: true },
        orderBy: { lastSynthesizedAt: "desc" },
      });
      if (page) return page;
    }
  }

  return null;
}

async function integrateAnswerIntoPage(
  operatorId: string,
  page: { id: string; slug: string; title: string; content: string; pageType: string; version: number; sourceCount: number },
  question: string,
  answer: string,
  context: string,
): Promise<boolean> {
  try {
    const response = await callLLM({
      instructions: `You are updating an organizational knowledge wiki page with human-confirmed information.

The page was synthesized from data. A human has now answered a question that provides additional or correcting information. Integrate their answer into the page content.

Rules:
- Preserve all existing content and source citations [src:xxx]
- Add the new information naturally within the relevant section, or create a brief new section if needed
- Mark human-provided claims with [human-confirmed] inline
- If the answer CONTRADICTS existing content, update the contradicted claim and add a note: [corrected by human — previous: "old claim"]
- Keep the same markdown formatting style as the existing page
- Do NOT add any preamble or explanation — output ONLY the updated page content`,
      messages: [
        {
          role: "user",
          content: `## Current page: "${page.title}" (${page.pageType})

${page.content}

---

## Human input

**Question asked:** ${question}
**Context:** ${context}
**Human's answer:** ${answer}

Output the updated page content:`,
        },
      ],
      temperature: 0.1,
      maxTokens: 4000,
      aiFunction: "reasoning",
      operatorId,
      model: getModel("wikiAnswerIntegration"),
    });

    const updatedContent = response.text.trim();
    if (!updatedContent || updatedContent.length < 50) return false;

    await createVersionSnapshot(page.id, "answer_integration", "human");

    await prisma.knowledgePage.update({
      where: { id: page.id },
      data: {
        content: updatedContent,
        contentTokens: Math.ceil(updatedContent.length / 4),
        status: "verified",
        verifiedAt: new Date(),
        verifiedByModel: "human",
        version: page.version + 1,
        lastSynthesizedAt: new Date(),
        synthesisPath: "onboarding",
        sourceCount: page.sourceCount + 1,
      },
    });

    // Re-embed the updated content
    const embeddings = await embedChunks([updatedContent]).catch(() => [null]);
    const embedding = embeddings[0];
    if (embedding) {
      const embeddingStr = `[${embedding.join(",")}]`;
      await prisma.$executeRaw`
        UPDATE "KnowledgePage" SET "embedding" = ${embeddingStr}::vector WHERE "id" = ${page.id}
      `;
    }

    return true;
  } catch (err) {
    console.error(`[wiki-answers] Failed to integrate answer into page ${page.slug}:`, err);
    return false;
  }
}

async function createPageFromAnswer(
  operatorId: string,
  question: string,
  answer: string,
  context: string,
): Promise<boolean> {
  try {
    const titleResponse = await callLLM({
      instructions: `Generate a short title (max 8 words) for a knowledge page based on this Q&A. Output ONLY the title, nothing else.`,
      messages: [{ role: "user", content: `Q: ${question}\nA: ${answer}` }],
      temperature: 0.1,
      maxTokens: 50,
      aiFunction: "reasoning",
      operatorId,
      model: getModel("wikiAnswerIntegration"),
    });

    const title = titleResponse.text.trim().replace(/^["']|["']$/g, "");
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    if (!title || !slug) return false;

    // Check for slug collision
    const existing = await prisma.knowledgePage.findUnique({
      where: { operatorId_slug: { operatorId, slug } },
    });
    if (existing) return false;

    const content = `# ${title}\n\n${answer}\n\n*Context: ${context}*\n\n[human-confirmed]`;

    const page = await prisma.knowledgePage.create({
      data: {
        operatorId,
        scope: "operator",
        pageType: "topic_synthesis",
        title,
        slug,
        content,
        contentTokens: Math.ceil(content.length / 4),
        sources: [],
        sourceCount: 1,
        sourceTypes: ["human"],
        status: "verified",
        verifiedAt: new Date(),
        verifiedByModel: "human",
        confidence: 0.95,
        version: 1,
        synthesisPath: "onboarding",
        synthesizedByModel: "human",
        lastSynthesizedAt: new Date(),
      },
      select: { id: true },
    });

    // Embed the new page
    const embeddings = await embedChunks([content]).catch(() => [null]);
    const embedding = embeddings[0];
    if (embedding) {
      const embeddingStr = `[${embedding.join(",")}]`;
      await prisma.$executeRaw`
        UPDATE "KnowledgePage" SET "embedding" = ${embeddingStr}::vector WHERE "id" = ${page.id}
      `;
    }

    return true;
  } catch (err) {
    console.error(`[wiki-answers] Failed to create page from answer:`, err);
    return false;
  }
}
