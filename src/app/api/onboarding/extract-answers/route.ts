import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { operatorId } = su;
  const { history } = await req.json();

  if (!history?.length) {
    return NextResponse.json({ error: "No conversation to extract from" }, { status: 400 });
  }

  // Load the questions
  const analysis = await prisma.onboardingAnalysis.findUnique({
    where: { operatorId },
    select: { uncertaintyLog: true },
  });

  if (!analysis) {
    return NextResponse.json({ error: "No analysis found" }, { status: 404 });
  }

  const questions = Array.isArray(analysis.uncertaintyLog) ? analysis.uncertaintyLog as any[] : [];
  const adminQuestions = questions.filter((q: any) => (q.scope ?? "admin") === "admin");

  if (adminQuestions.length === 0) {
    return NextResponse.json({ answers: {} });
  }

  // Use LLM to extract structured answers from conversation
  const conversationText = history
    .map((m: any) => `${m.role === "user" ? "Admin" : "Qorpera"}: ${m.content}`)
    .join("\n\n");

  const extractionPrompt = `Extract the admin's answers from this onboarding conversation.

## Questions that were asked:
${adminQuestions.map((q: any, i: number) => `${i}: ${q.question}`).join("\n")}

## Conversation:
${conversationText}

## Instructions:
Return a JSON object where keys are question indices (0, 1, 2...) and values are the admin's answer as a concise string. If the admin didn't answer a question or said they don't know, use "unknown" as the value. If the admin's answer was spread across multiple messages, synthesize it into one concise answer.

Return ONLY the JSON object, no other text.`;

  try {
    const response = await callLLM({
      aiFunction: "copilot",
      model: getModel("onboardingExtraction"),
      instructions: "You extract structured data from conversations. Return only valid JSON.",
      messages: [{ role: "user", content: extractionPrompt }],
      operatorId,
    });

    const text = response.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const answers = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Merge answers into the uncertainty log
    const updatedLog = [...questions];
    for (const [idx, answer] of Object.entries(answers)) {
      const i = Number(idx);
      if (updatedLog[i]) {
        (updatedLog[i] as any).userAnswer = answer;
      }
    }

    await prisma.onboardingAnalysis.updateMany({
      where: { operatorId },
      data: { uncertaintyLog: updatedLog },
    });

    return NextResponse.json({ answers, questionsAnswered: Object.keys(answers).length });
  } catch (err) {
    console.error("[extract-answers] Failed:", err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}
