import { NextRequest } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { chat } from "@/lib/ai-copilot";
import type { AIMessage } from "@/lib/ai-provider";

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();

  const message = body.message as string | undefined;
  const history = (body.history ?? []) as AIMessage[];

  if (!message || typeof message !== "string" || !message.trim()) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = await chat(operatorId, message, history);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
