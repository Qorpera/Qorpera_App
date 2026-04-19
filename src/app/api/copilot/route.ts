import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { chat, type OrientationInfo } from "@/lib/ai-copilot";
import { prisma } from "@/lib/db";
import type { AIMessage } from "@/lib/ai-provider";
import { resolveAccessContext } from "@/lib/domain-scope";
import { loadContextForCopilot, getContextRoleInstruction, loadSystemHealthContext, loadSystemJobsContext } from "@/lib/copilot-context-loaders";
import { captureApiError } from "@/lib/api-error";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limiter";

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
  const accessCtx = await resolveAccessContext(operatorId, su.effectiveUserId);
  const visibleDomains: string[] | "all" = accessCtx.isScoped
    ? accessCtx.userDomainSlugs
    : "all";
  let scopeInfo: { userName?: string; domainName?: string; visibleDomains: string[] | "all" } | undefined;
  if (visibleDomains !== "all") {
    const scopeUser = await prisma.user.findUnique({ where: { id: su.effectiveUserId }, select: { name: true } });
    let domainName: string | undefined;
    if (accessCtx.userDomainSlugs[0]) {
      const domainPage = await prisma.knowledgePage.findFirst({
        where: { operatorId: su.operatorId, slug: accessCtx.userDomainSlugs[0], scope: "operator", pageType: "domain_hub" },
        select: { title: true },
      });
      domainName = domainPage?.title ?? undefined;
    }
    scopeInfo = { userName: scopeUser?.name, domainName, visibleDomains };
  }

  // Context injection for embedded chat (situation, idea, workstream detail panes)
  let contextInfo: { contextType: string; contextText: string } | null = null;
  let ctxType = typeof body.contextType === "string" ? body.contextType.trim() : null;
  let ctxId = typeof body.contextId === "string" ? body.contextId.trim() : null;

  // Scope check: verify the user has visibility into the requested context item
  if (ctxType && ctxId && visibleDomains !== "all") {
    try {
      if (ctxType === "situation") {
        const sitPages = await prisma.$queryRawUnsafe<Array<{
          properties: Record<string, unknown> | null;
        }>>(
          `SELECT properties FROM "KnowledgePage"
           WHERE "operatorId" = $1
             AND "pageType" = 'situation_instance'
             AND properties->>'situation_id' = $2
           LIMIT 1`,
          operatorId, ctxId,
        );
        if (sitPages.length === 0) {
          ctxType = null; ctxId = null;
        } else {
          const domain = sitPages[0].properties?.domain as string | undefined;
          if (domain && !visibleDomains.includes(domain)) {
            ctxType = null; ctxId = null;
          }
        }
      } else if (ctxType === "idea") {
        const init = await prisma.idea.findFirst({
          where: { id: ctxId, operatorId },
          select: { id: true },
        });
        if (!init) {
          ctxType = null; ctxId = null;
        }
      }
    } catch (err) {
      console.warn(`[copilot] Context scope check failed for ${ctxType}/${ctxId}:`, err);
      ctxType = null; ctxId = null;
    }
  }

  // System-health context: scope filtering done inside the loader
  if (ctxType === "system-health") {
    try {
      const contextText = await loadSystemHealthContext(operatorId);
      if (contextText) {
        const roleInstruction = getContextRoleInstruction(ctxType);
        contextInfo = {
          contextType: ctxType,
          contextText: `${roleInstruction}\n\n${contextText}`,
        };
      }
    } catch (err) {
      console.warn(`[copilot] System health context loading failed:`, err);
    }
  } else if (ctxType === "system_jobs") {
    try {
      const contextText = await loadSystemJobsContext(operatorId);
      if (contextText) {
        const roleInstruction = getContextRoleInstruction(ctxType);
        contextInfo = {
          contextType: ctxType,
          contextText: `${roleInstruction}\n\n${contextText}`,
        };
      }
    } catch (err) {
      console.warn(`[copilot] System jobs context loading failed:`, err);
    }
  } else if (ctxType && ctxId) {
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

  // Emergency stop — checked before billing gate
  const copilotOperator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { aiPaused: true, billingStatus: true, freeCopilotUsedCents: true, freeCopilotBudgetCents: true },
  });
  if (copilotOperator?.aiPaused) {
    const pauseMessage = "AI operations are currently paused by your administrator. You can still view existing situations and data, but new AI responses are temporarily disabled.";
    return new Response(pauseMessage, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }

  // Copilot budget check for free users
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

  // Per-user rate limit (in addition to IP-based global limit from middleware)
  const userRateCheck = await rateLimit(`copilot:user:${user.id}`, "copilot");
  if (!userRateCheck.success) {
    return rateLimitResponse(userRateCheck.reset);
  }

  const stream = await chat(operatorId, message, history, su.effectiveRole, orientation, scopeInfo, su.effectiveUserId, contextInfo, user.locale);

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
    } catch (err) {
      captureApiError(err, { route: "copilot", userId: user.id, operatorId });
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
