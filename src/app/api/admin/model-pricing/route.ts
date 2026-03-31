import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su || (su.user.role !== "admin" && su.user.role !== "superadmin")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const setting = await prisma.appSetting.findFirst({
    where: { key: "modelPricing", operatorId: null },
  });

  if (!setting) {
    const { MODEL_PRICING } = await import("@/lib/model-pricing");
    return NextResponse.json({ source: "hardcoded", pricing: MODEL_PRICING });
  }

  return NextResponse.json({
    source: "database",
    pricing: JSON.parse(setting.value),
    updatedAt: setting.lastModifiedAt,
  });
}

export async function PUT(req: NextRequest) {
  const su = await getSessionUser();
  if (!su || su.user.role !== "superadmin") {
    return NextResponse.json({ error: "Superadmin only" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.pricing || typeof body.pricing !== "object" || Array.isArray(body.pricing)) {
    return NextResponse.json({ error: "pricing object required" }, { status: 400 });
  }

  // Validate structure
  for (const [model, prices] of Object.entries(body.pricing)) {
    const p = prices as Record<string, unknown>;
    if (typeof p.input !== "number" || typeof p.output !== "number") {
      return NextResponse.json({ error: `Invalid pricing for model "${model}"` }, { status: 400 });
    }
    if (p.input < 0 || p.output < 0) {
      return NextResponse.json({ error: `Negative pricing for model "${model}"` }, { status: 400 });
    }
  }

  const existing = await prisma.appSetting.findFirst({
    where: { key: "modelPricing", operatorId: null },
  });

  if (existing) {
    await prisma.appSetting.update({
      where: { id: existing.id },
      data: {
        value: JSON.stringify(body.pricing),
        lastModifiedById: su.user.id,
        lastModifiedAt: new Date(),
      },
    });
  } else {
    await prisma.appSetting.create({
      data: {
        key: "modelPricing",
        value: JSON.stringify(body.pricing),
        lastModifiedById: su.user.id,
        lastModifiedAt: new Date(),
      },
    });
  }

  const { invalidateModelPricingCache } = await import("@/lib/model-pricing");
  invalidateModelPricingCache();

  return NextResponse.json({ ok: true });
}
