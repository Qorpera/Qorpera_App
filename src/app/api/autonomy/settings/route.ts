import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_THRESHOLDS, getThresholds } from "@/lib/autonomy-graduation";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const thresholds = await getThresholds(su.operatorId);
  return NextResponse.json(thresholds);
}

export async function PUT(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = await req.json();

  const validKeys = Object.keys(DEFAULT_THRESHOLDS);

  for (const key of validKeys) {
    if (body[key] !== undefined) {
      const existing = await prisma.appSetting.findFirst({
        where: { key, operatorId: su.operatorId },
      });
      if (existing) {
        await prisma.appSetting.update({
          where: { id: existing.id },
          data: {
            value: String(body[key]),
            lastModifiedById: su.user.id,
            lastModifiedAt: new Date(),
          },
        });
      } else {
        await prisma.appSetting.create({
          data: {
            key,
            value: String(body[key]),
            operatorId: su.operatorId,
            lastModifiedById: su.user.id,
            lastModifiedAt: new Date(),
          },
        });
      }
    }
  }

  const thresholds = await getThresholds(su.operatorId);
  return NextResponse.json(thresholds);
}
