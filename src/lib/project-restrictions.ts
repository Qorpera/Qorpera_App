import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import type { Prisma } from "@prisma/client";

/**
 * Interprets natural-language access restrictions for project members via LLM.
 * Called fire-and-forget after project creation — does NOT block the response.
 */
export async function interpretMemberRestrictions(
  projectId: string,
  members: Array<{ userId: string; restrictionText: string }>,
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      template: { select: { name: true, analysisFramework: true } },
      deliverables: { select: { id: true, title: true, stage: true } },
    },
  });
  if (!project) return;

  const deliverableTitles = project.deliverables.map((d) => d.title);

  for (const member of members) {
    const systemPrompt = `You interpret access restrictions for project team members.

The project "${project.name}" has these deliverables: ${deliverableTitles.join(", ")}.

Given a natural language restriction description, produce a JSON object with these fields:
{
  "deniedDeliverableIds": string[],  // IDs of deliverables this member should NOT see (empty array if no deliverable restrictions)
  "deniedDataTypes": string[],       // data categories they shouldn't access: "financial", "legal", "hr", "communications", "all_raw_data"
  "readOnly": boolean,               // true if they should only view, never edit or approve
  "summary": string                  // one-line summary of what was restricted
}

Respond with ONLY the JSON object, no explanation.`;

    const userMessage = `Restriction: "${member.restrictionText}"

Available deliverables:
${project.deliverables.map((d) => `- ${d.id}: ${d.title}`).join("\n")}`;

    try {
      const response = await callLLM({
        operatorId: project.operatorId,
        instructions: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        model: getModel("copilot"),
        maxTokens: 500,
      });

      const text = typeof response === "string" ? response : response.text ?? "";
      const restrictions = extractJSON(text);

      if (!restrictions || typeof restrictions !== "object" || !restrictions.summary) {
        throw new Error("Invalid restriction structure");
      }

      await prisma.projectMember.updateMany({
        where: { projectId, userId: member.userId },
        data: { restrictions: restrictions as Prisma.InputJsonValue },
      });

      console.log(`[project-restrictions] Set restrictions for user ${member.userId}: ${restrictions.summary}`);
    } catch (err) {
      console.error(`[project-restrictions] Failed for user ${member.userId}:`, err);
      // Store raw text as fallback so it's not lost
      await prisma.projectMember.updateMany({
        where: { projectId, userId: member.userId },
        data: {
          restrictions: {
            rawText: member.restrictionText,
            parsed: false,
            error: err instanceof Error ? err.message : "unknown",
          } as Prisma.InputJsonValue,
        },
      });
    }
  }
}
