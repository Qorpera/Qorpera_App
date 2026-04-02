import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { streamLLM, getModel } from "@/lib/ai-provider";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { operatorId } = su;

  // Load session user's name for personalized conversation
  let sessionUser = await prisma.user.findUnique({
    where: { id: su.user.id },
    select: { name: true, role: true },
  });

  // If superadmin is impersonating an operator, use the operator's primary admin identity
  if (sessionUser?.role === "superadmin") {
    const operatorAdmin = await prisma.user.findFirst({
      where: { operatorId, role: "admin" },
      orderBy: { createdAt: "asc" },
      select: { name: true, role: true },
    });
    if (operatorAdmin) {
      sessionUser = operatorAdmin;
    }
  }

  const body = await req.json();
  const { message, history = [] } = body;

  // Load admin-scoped questions from the analysis
  const analysis = await prisma.onboardingAnalysis.findUnique({
    where: { operatorId },
    select: { uncertaintyLog: true, synthesisOutput: true },
  });

  if (!analysis) {
    return new Response(JSON.stringify({ error: "No analysis found" }), { status: 404 });
  }

  const allQuestions = Array.isArray(analysis.uncertaintyLog) ? analysis.uncertaintyLog as any[] : [];
  const adminQuestions = allQuestions.filter((q: any) => (q.scope ?? "admin") === "admin");
  const departmentQuestions = allQuestions.filter((q: any) => q.scope === "department");

  // Build the system prompt
  const systemPrompt = buildQuestionsSystemPrompt(
    adminQuestions,
    departmentQuestions,
    analysis.synthesisOutput,
    sessionUser?.name ?? null,
    sessionUser?.role ?? null,
  );

  // Build messages
  const messages = [
    ...history.map((m: any) => ({ role: m.role, content: m.content })),
  ];

  if (message) {
    messages.push({ role: "user", content: message });
  }

  // If no user message yet (initial chat load), add a synthetic prompt
  // that triggers the AI's opening introduction
  if (messages.length === 0) {
    messages.push({
      role: "user",
      content: "Please introduce yourself, briefly summarize what you discovered about our organization, and begin with your first clarification question.",
    });
  }

  // Stream the response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamLLM({
          instructions: systemPrompt,
          messages,
          aiFunction: "copilot",
          model: getModel("onboardingChat"),
          operatorId,
        })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStack = err instanceof Error ? err.stack : undefined;
        console.error("[questions-chat] Stream error:", errMsg);
        if (errStack) console.error("[questions-chat] Stack:", errStack);
        controller.enqueue(encoder.encode("\n\n[Error: Could not generate response]"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function buildQuestionsSystemPrompt(
  adminQuestions: any[],
  departmentQuestions: any[],
  synthesisOutput: any,
  userName: string | null,
  userRole: string | null,
): string {
  let prompt = `You are Qorpera's AI assistant, helping the company admin complete their onboarding by discussing a few strategic questions about their organization.

## Your Role

You've just finished analyzing the company's connected data (emails, documents, calendar, etc.) and have built a comprehensive understanding of the organization. Now you need to clarify a few things that the data alone couldn't answer.

## Who You're Talking To

${userName ? `You are speaking with **${userName}**${userRole === "admin" ? ", the company admin" : ""}.` : "You are speaking with the company admin."}
Address them by name. Frame questions from THEIR perspective — ask about THEIR decisions, THEIR plans, THEIR view. Do NOT refer to them in third person. Do NOT say "the admin" or "the CEO" — you are talking TO them.

If their name matches someone prominent in the analysis (e.g., the owner, director, or a key person), acknowledge that directly and use it to frame your questions personally: "I can see you're involved in almost every major process — from client approvals to material ordering. That tells me a lot about the company, but I want to understand..."

## Conversation Style

- Be warm, professional, and conversational — NOT like a survey or interrogation
- Ask 1-2 questions at a time, not all at once
- When the admin answers, acknowledge their response naturally and connect it to what you know
- If they say "I don't know" or "not sure," that's completely fine — say so and move on
- If they want to discuss something beyond your questions, engage naturally
- Use the company's language (Danish if the data was predominantly Danish)
- Reference specific details from the analysis to show you understand their business

## Your Questions for the Admin

These are strategic questions that only the company admin can answer:

`;

  if (adminQuestions.length > 0) {
    for (let i = 0; i < adminQuestions.length; i++) {
      prompt += `${i + 1}. **${adminQuestions[i].question}**\n   Context: ${adminQuestions[i].context}\n`;
      if (adminQuestions[i].possibleAnswers?.length) {
        prompt += `   Possible answers: ${adminQuestions[i].possibleAnswers.join(", ")}\n`;
      }
      prompt += "\n";
    }
  } else {
    prompt += "No strategic questions needed — the analysis was comprehensive.\n\n";
  }

  if (departmentQuestions.length > 0) {
    prompt += `## Questions You're Saving for Team Members

You also have ${departmentQuestions.length} operational question(s) that are better answered by specific team members. Do NOT ask the admin these — mention that you'll ask the relevant people when they join. If the admin volunteers information about these topics, accept it gratefully.

`;
    for (const q of departmentQuestions) {
      prompt += `- ${q.question} (for: ${q.targetEmail ?? q.department ?? "team member"})\n`;
    }
  }

  prompt += `
## First Message

Start by greeting ${userName ?? "the admin"} by name, briefly summarize what you discovered about their organization (2-3 sentences showing you understand their business), then naturally transition into your first question. If you have no admin questions, tell them the analysis was thorough and ask if there's anything they'd like to add or correct about the organizational map.

## Important

- Do NOT dump all questions at once
- Do NOT use numbered lists of questions
- Do NOT sound like a form or survey
- Each of your messages should feel like a natural conversation turn
- After all questions are discussed, wrap up by thanking them and letting them know they can proceed with confirming the organizational map`;

  return prompt;
}
