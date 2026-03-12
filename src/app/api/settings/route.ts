import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

// AppSetting is global (no operatorId) — superadmin only
export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = await prisma.appSetting.findMany();
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return NextResponse.json(map);
}

const ALLOWED_SETTING_KEYS = [
  "ai_provider",
  "ai_model",
  "ai_api_key",
  "ai_base_url",
  "ai_reasoning_provider",
  "ai_reasoning_model",
  "ai_reasoning_key",
  "ai_copilot_provider",
  "ai_copilot_model",
  "ai_copilot_key",
  "ai_orientation_provider",
  "ai_orientation_model",
  "ai_orientation_key",
  "ai_embedding_provider",
  "ai_embedding_model",
  "ai_embedding_key",
  "embedding_provider",
  "embedding_api_key",
  "graduation_supervised_to_notify_consecutive",
  "graduation_supervised_to_notify_rate",
  "graduation_notify_to_autonomous_consecutive",
  "graduation_notify_to_autonomous_rate",
];

const MAX_VALUE_LENGTH = 10000;

export async function PUT(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role !== "superadmin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json() as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_SETTING_KEYS.includes(key)) {
      return NextResponse.json({ error: `Unknown setting: ${key}` }, { status: 400 });
    }
    if (typeof value !== "string" || value.length > MAX_VALUE_LENGTH) {
      return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 });
    }
  }
  for (const [key, value] of Object.entries(body)) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  return NextResponse.json({ ok: true });
}
