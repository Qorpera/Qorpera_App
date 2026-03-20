import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";

/**
 * Reassess a WorkStream after a plan completion.
 * Checks if all children are done, or asks the AI what to do next.
 */
export async function reassessWorkStream(
  workStreamId: string,
  completedSourceId: string,
  completedSourceType: string,
): Promise<void> {
  const ws = await prisma.workStream.findUnique({
    where: { id: workStreamId },
    include: {
      items: true,
      children: { select: { id: true, status: true, title: true } },
    },
  });
  if (!ws || ws.status !== "active") return;

  // Load goal context
  let goalTitle = "";
  let goalDescription = "";
  if (ws.goalId) {
    const goal = await prisma.goal.findUnique({
      where: { id: ws.goalId },
      select: { title: true, description: true },
    });
    if (goal) {
      goalTitle = goal.title;
      goalDescription = goal.description;
    }
  }

  // Check all items
  const itemSummaries: Array<{ type: string; id: string; status: string; summary: string }> = [];
  let allTerminal = true;

  for (const item of ws.items) {
    if (item.itemType === "situation") {
      const s = await prisma.situation.findUnique({
        where: { id: item.itemId },
        include: { situationType: { select: { name: true } } },
      });
      if (s) {
        const terminal = ["resolved", "closed", "dismissed"].includes(s.status);
        if (!terminal) allTerminal = false;
        itemSummaries.push({ type: "situation", id: s.id, status: s.status, summary: s.situationType.name });
      }
    } else if (item.itemType === "initiative") {
      const i = await prisma.initiative.findUnique({
        where: { id: item.itemId },
        select: { id: true, status: true, rationale: true },
      });
      if (i) {
        const terminal = ["completed", "rejected", "failed"].includes(i.status);
        if (!terminal) allTerminal = false;
        itemSummaries.push({ type: "initiative", id: i.id, status: i.status, summary: i.rationale.slice(0, 200) });
      }
    }
  }

  for (const child of ws.children) {
    if (child.status !== "completed") allTerminal = false;
  }

  // If all terminal: mark completed
  if (allTerminal && (ws.items.length > 0 || ws.children.length > 0)) {
    await prisma.workStream.update({
      where: { id: workStreamId },
      data: {
        status: "completed",
        completedAt: new Date(),
        lastReassessmentAt: new Date(),
        lastReassessmentResult: JSON.stringify({ action: "completed", reason: "All items resolved" }),
      },
    });
    return;
  }

  // Not all complete — ask AI to reassess
  const contextLines = [
    `Workstream: "${ws.title}"`,
    ws.description ? `Description: ${ws.description}` : "",
    goalTitle ? `Goal: ${goalTitle} — ${goalDescription}` : "",
    "",
    "Current items:",
    ...itemSummaries.map(i => `  - [${i.type}] ${i.summary} (status: ${i.status})`),
    ...(ws.children.length > 0
      ? ["", "Child workstreams:", ...ws.children.map(c => `  - ${c.title} (${c.status})`)]
      : []),
    "",
    `Just completed: ${completedSourceType} ${completedSourceId}`,
  ].filter(Boolean);

  try {
    const response = await callLLM({
      instructions: `You are reassessing a workstream after one of its items completed. Analyze the current state and decide the next action.

Respond with JSON:
{
  "action": "wait" | "completed" | "needs_adjustment",
  "reason": "brief explanation",
  "notes": "optional additional notes"
}

- "wait": other items are still in progress, no action needed
- "completed": the workstream goal has been achieved
- "needs_adjustment": the plan needs human attention`,
      messages: [{ role: "user", content: contextLines.join("\n") }],
      aiFunction: "reasoning",
      temperature: 0.2,
      model: getModel("reasoning"),
    });

    const result = extractJSON(response.text) || { action: "wait", reason: "Could not parse AI response" };

    await prisma.workStream.update({
      where: { id: workStreamId },
      data: {
        lastReassessmentAt: new Date(),
        lastReassessmentResult: JSON.stringify(result),
        ...(result.action === "completed" ? { status: "completed", completedAt: new Date() } : {}),
      },
    });
  } catch (err) {
    console.error("[workstream-reassessment] LLM call failed:", err);
    await prisma.workStream.update({
      where: { id: workStreamId },
      data: {
        lastReassessmentAt: new Date(),
        lastReassessmentResult: JSON.stringify({ action: "error", reason: String(err) }),
      },
    });
  }
}
