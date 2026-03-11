import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAIConfig, callLLM, type AIFunction } from "@/lib/ai-provider";

const VALID_FUNCTIONS = new Set(["reasoning", "copilot", "embedding", "orientation"]);

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let aiFunction: AIFunction | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.aiFunction && VALID_FUNCTIONS.has(body.aiFunction)) {
      aiFunction = body.aiFunction as AIFunction;
    }
  } catch { /* empty body is fine */ }

  try {
    const config = await getAIConfig(aiFunction);

    const response = await callLLM(
      [{ role: "user", content: "Respond with exactly: OK" }],
      { maxTokens: 10, temperature: 0, aiFunction },
    );

    return NextResponse.json({
      ok: true,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      response: response.content.trim(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
