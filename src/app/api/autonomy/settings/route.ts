import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_THRESHOLDS, getThresholds } from "@/lib/autonomy-graduation";

export async function GET() {
  await getOperatorId();
  const thresholds = await getThresholds();
  return NextResponse.json(thresholds);
}

export async function PUT(req: NextRequest) {
  await getOperatorId();
  const body = await req.json();

  const validKeys = Object.keys(DEFAULT_THRESHOLDS);

  for (const key of validKeys) {
    if (body[key] !== undefined) {
      await prisma.appSetting.upsert({
        where: { key },
        update: { value: String(body[key]) },
        create: { key, value: String(body[key]) },
      });
    }
  }

  const thresholds = await getThresholds();
  return NextResponse.json(thresholds);
}
