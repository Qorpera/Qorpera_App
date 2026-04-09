import { prisma } from "@/lib/db";
import { getSystemWikiPages, searchPages } from "@/lib/wiki-engine";
import type { DocumentProfile } from "./types";

const EXPERTISE_TOKEN_BUDGET = 15000;

/**
 * Load reference material from the system wiki and company context
 * from the operator wiki to supplement the model's analysis.
 *
 * System wiki pages provide practitioner-specific details: Danish
 * accounting practice, empirical benchmarks, red flag patterns.
 * The model brings its own analytical expertise — this material
 * sharpens the analysis with specifics it wouldn't reliably know.
 */
export async function assembleExpertise(
  profile: DocumentProfile,
  operatorId: string,
): Promise<string> {
  const expertisePages: Array<{
    title: string;
    content: string;
    source: "system" | "operator";
  }> = [];
  let tokensUsed = 0;

  // 1. Load system wiki reference material for each domain
  for (const domain of profile.expertiseDomains) {
    // Build search queries that combine domain + document type for relevance
    const queries = [
      `${domain} ${profile.documentType} analysis methodology`,
      `${domain} best practices review`,
    ];

    for (const query of queries) {
      if (tokensUsed >= EXPERTISE_TOKEN_BUDGET) break;

      const systemPages = await getSystemWikiPages({
        query,
        maxPages: 2,
      });

      for (const page of systemPages) {
        const pageTokens = Math.ceil(page.content.length / 4);
        if (tokensUsed + pageTokens > EXPERTISE_TOKEN_BUDGET) break;

        // Dedup by title
        if (expertisePages.some((p) => p.title === page.title)) continue;

        expertisePages.push({
          title: page.title,
          content: page.content,
          source: "system",
        });
        tokensUsed += pageTokens;
      }
    }
  }

  // 2. Load operator wiki for company-specific context
  //    (how this company does things — relevant for analyzing their documents)
  if (tokensUsed < EXPERTISE_TOKEN_BUDGET - 2000) {
    const companyQueries = [
      `${profile.documentType} process`,
      profile.expertiseDomains[0] ?? "business operations",
    ];

    for (const query of companyQueries) {
      if (tokensUsed >= EXPERTISE_TOKEN_BUDGET) break;

      // searchPages returns contentPreview only — find slugs then load full content
      const matches = await searchPages(operatorId, query, { limit: 2 });

      if (matches.length > 0) {
        const fullPages = await prisma.knowledgePage.findMany({
          where: {
            operatorId,
            slug: { in: matches.map((m) => m.slug) },
          },
          select: { slug: true, title: true, content: true },
        });

        for (const page of fullPages) {
          const pageTokens = Math.ceil(page.content.length / 4);
          if (tokensUsed + pageTokens > EXPERTISE_TOKEN_BUDGET) break;
          if (expertisePages.some((p) => p.title === page.title)) continue;

          expertisePages.push({
            title: `[Company context] ${page.title}`,
            content: page.content,
            source: "operator",
          });
          tokensUsed += pageTokens;
        }
      }
    }
  }

  if (expertisePages.length === 0) {
    return "No specific reference material available. Apply your analytical expertise — look for claims without evidence, numbers without context, commitments without timelines, and gaps in coverage.";
  }

  const systemCount = expertisePages.filter(
    (p) => p.source === "system",
  ).length;
  const operatorCount = expertisePages.filter(
    (p) => p.source === "operator",
  ).length;

  return `## Reference Material (${systemCount} practitioner reference pages, ${operatorCount} company-specific pages)

The following reference material may sharpen your analysis of this document. System pages provide practitioner specifics — Danish ÅRL interpretation, empirical benchmarks, red flag patterns. Company pages provide organizational context. Your analytical expertise is your own — use this material to add specificity where it helps.

${expertisePages.map((p) => `### ${p.title}\n${p.content}`).join("\n\n---\n\n")}`;
}
