import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { chat, type OrientationInfo } from "@/lib/ai-copilot";
import { prisma } from "@/lib/db";
import type { AIMessage } from "@/lib/ai-provider";
import { getVisibleDepartmentIds } from "@/lib/user-scope";

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

  // TODO: When contextType/contextId are provided, load the relevant context and prepend to conversation:
  // - "situation" → load situation's reasoning, entity, situation type, execution plan
  // - "initiative" → load initiative's goal, rationale, execution plan, department
  // - "workstream" → load via getWorkStreamContext()
  // Then inject as a system message or user context before calling chat().
  // For now, contextType and contextId are accepted but not yet used for context injection.
  const _contextType = body.contextType as string | undefined;
  const _contextId = body.contextId as string | undefined;
  void _contextType;
  void _contextId;

  const stream = await chat(operatorId, message, history, user.role, orientation, scopeInfo);

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
        await prisma.copilotMessage.create({
          data: { operatorId, userId: user.id, sessionId, role: "assistant", content: fullText },
        });
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
