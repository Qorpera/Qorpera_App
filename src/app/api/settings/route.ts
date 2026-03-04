import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const settings = await prisma.appSetting.findMany();
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return NextResponse.json(map);
}

export async function PUT(req: NextRequest) {
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
