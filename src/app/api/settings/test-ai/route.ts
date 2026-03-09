import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAIConfig, callLLM } from "@/lib/ai-provider";

export async function POST() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  try {
    const config = await getAIConfig();

    const response = await callLLM(
      [{ role: "user", content: "Respond with exactly: OK" }],
      { maxTokens: 10, temperature: 0 },
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
