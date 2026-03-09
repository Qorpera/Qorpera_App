import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await prisma.appSetting.findMany();
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return NextResponse.json(map);
}

export async function PUT(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await req.json() as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  return NextResponse.json({ ok: true });
}
