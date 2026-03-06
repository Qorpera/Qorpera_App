import { NextRequest } from "next/server";
import { getOperatorId, getUserId, getUserRole } from "@/lib/auth";
import { chat, type OrientationInfo } from "@/lib/ai-copilot";
import { prisma } from "@/lib/db";
import type { AIMessage } from "@/lib/ai-provider";

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const userId = await getUserId();
  const userRole = await getUserRole();
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
  let sessionId = "default";

  const orientationSession = await prisma.orientationSession.findFirst({
    where: { operatorId, completedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (
    orientationSession &&
    (orientationSession.phase === "orienting" || orientationSession.phase === "confirming")
  ) {
    orientation = {
      sessionId: orientationSession.id,
      phase: orientationSession.phase as "orienting" | "confirming",
    };
    sessionId = orientationSession.id;
  }

  // Store user message
  await prisma.copilotMessage.create({
    data: { operatorId, userId, sessionId, role: "user", content: message },
  });

  const stream = await chat(operatorId, message, history, userRole, orientation);

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
          data: { operatorId, userId, sessionId, role: "assistant", content: fullText },
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
