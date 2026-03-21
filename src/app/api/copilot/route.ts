import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { chat, type OrientationInfo } from "@/lib/ai-copilot";
import { prisma } from "@/lib/db";
import type { AIMessage } from "@/lib/ai-provider";
import { getVisibleDepartmentIds } from "@/lib/user-scope";
import { loadContextForCopilot, getContextRoleInstruction } from "@/lib/copilot-context-loaders";
import { canMemberAccessWorkStream } from "@/lib/workstreams";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const body = await req.json();

  const message = body.message as string | undefined;
  const history = (body.history ?? []) as AIMessage[];

  if (!message || typeof message !== "string" || !message.trim()) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Detect orientation mode
  let orientation: OrientationInfo = null;
  let sessionId = typeof body.sessionId === "string" && body.sessionId.trim()
    ? body.sessionId.trim()
    : "default";

  const orientationSession = await prisma.orientationSession.findFirst({
    where: { operatorId, completedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (orientationSession && orientationSession.phase === "orienting") {
    orientation = {
      sessionId: orientationSession.id,
      phase: "orienting",
    };
    sessionId = orientationSession.id;
  }

  // Store user message
  await prisma.copilotMessage.create({
    data: { operatorId, userId: user.id, sessionId, role: "user", content: message },
  });

  // Build scope info for copilot system prompt
  const visibleDepts = await getVisibleDepartmentIds(operatorId, user.id);
  let scopeInfo: { userName?: string; departmentName?: string; visibleDepts: string[] | "all" } | undefined;
  if (visibleDepts !== "all") {
    const scopeUser = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, entityId: true, entity: { select: { parentDepartmentId: true } } } });
    let departmentName: string | undefined;
    if (scopeUser?.entity?.parentDepartmentId) {
      const dept = await prisma.entity.findUnique({ where: { id: scopeUser.entity.parentDepartmentId }, select: { displayName: true } });
      departmentName = dept?.displayName ?? undefined;
    }
    scopeInfo = { userName: scopeUser?.name, departmentName, visibleDepts };
  }

  // Context injection for embedded chat (situation, initiative, workstream detail panes)
  let contextInfo: { contextType: string; contextText: string } | null = null;
  let ctxType = typeof body.contextType === "string" ? body.contextType.trim() : null;
  let ctxId = typeof body.contextId === "string" ? body.contextId.trim() : null;

  // Scope check: verify the user has visibility into the requested context item
  if (ctxType && ctxId && visibleDepts !== "all") {
    try {
      if (ctxType === "situation") {
        const sit = await prisma.situation.findFirst({
          where: { id: ctxId, operatorId },
          select: { situationType: { select: { scopeEntityId: true } } },
        });
        if (!sit) {
          ctxType = null; ctxId = null;
        } else if (sit.situationType.scopeEntityId && !visibleDepts.includes(sit.situationType.scopeEntityId)) {
          ctxType = null; ctxId = null;
        }
      } else if (ctxType === "initiative") {
        const init = await prisma.initiative.findFirst({
          where: { id: ctxId, operatorId },
          select: { goal: { select: { departmentId: true } } },
        });
        if (!init) {
          ctxType = null; ctxId = null;
        } else if (init.goal.departmentId && !visibleDepts.includes(init.goal.departmentId)) {
          ctxType = null; ctxId = null;
        }
      } else if (ctxType === "workstream") {
        const canAccess = await canMemberAccessWorkStream(user.id, ctxId, operatorId, visibleDepts);
        if (!canAccess) {
          ctxType = null; ctxId = null;
        }
      }
    } catch (err) {
      console.warn(`[copilot] Context scope check failed for ${ctxType}/${ctxId}:`, err);
      ctxType = null; ctxId = null;
    }
  }

  if (ctxType && ctxId) {
    try {
      const contextText = await loadContextForCopilot(ctxType, ctxId, operatorId);
      if (contextText) {
        const roleInstruction = getContextRoleInstruction(ctxType);
        contextInfo = {
          contextType: ctxType,
          contextText: `${roleInstruction}\n\n${contextText}`,
        };
      } else {
        console.warn(`[copilot] Context not found: ${ctxType}/${ctxId} for operator ${operatorId}`);
      }
    } catch (err) {
      console.warn(`[copilot] Context loading failed for ${ctxType}/${ctxId}:`, err);
      // Graceful degradation — continue without context
    }
  }

  // Copilot budget check for free users
  const copilotOperator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { billingStatus: true, freeCopilotUsedCents: true, freeCopilotBudgetCents: true },
  });
  if (copilotOperator) {
    const { checkCopilotBudget } = await import("@/lib/billing-gate");
    const budgetCheck = checkCopilotBudget(copilotOperator);
    if (!budgetCheck.allowed) {
      return new Response(JSON.stringify({ error: budgetCheck.reason, code: budgetCheck.code, budgetExhausted: true }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const stream = await chat(operatorId, message, history, user.role, orientation, scopeInfo, user.id, contextInfo);

  // Tee the stream: one for the HTTP response, one to capture for persistence
  const [responseStream, captureStream] = stream.tee();

  // Capture assistant response in background and persist
  (async () => {
    try {
      const reader = captureStream.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }
      if (fullText.trim()) {
        const costCents = stream.totalApiCostCents || 0;
        await prisma.copilotMessage.create({
          data: {
            operatorId,
            userId: user.id,
            sessionId,
            role: "assistant",
            content: fullText,
            apiCostCents: costCents || null,
          },
        });

        // Increment free copilot budget usage (for non-active operators)
        // Uses atomic increment; post-check catches concurrent overshoot
        if (costCents > 0 && copilotOperator && copilotOperator.billingStatus !== "active") {
          const updated = await prisma.operator.update({
            where: { id: operatorId },
            data: { freeCopilotUsedCents: { increment: costCents } },
            select: { freeCopilotUsedCents: true, freeCopilotBudgetCents: true },
          });
          if (updated.freeCopilotUsedCents > updated.freeCopilotBudgetCents) {
            console.log(`[copilot] Free budget exceeded for operator ${operatorId}: ${updated.freeCopilotUsedCents}/${updated.freeCopilotBudgetCents} cents`);
          }
        }

        // Emit billing event (fire-and-forget)
        if (costCents > 0) {
          import("@/lib/billing-events")
            .then((m) => m.emitCopilotBillingEvent({ apiCostCents: costCents, operatorId }))
            .catch(console.error);
        }
      }
    } catch {
      // Don't let persistence errors break the response
    }
  })();

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
