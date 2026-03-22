import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { locales, type Locale } from "@/i18n/config";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { user, operatorId, isSuperadmin, actingAsOperator } = su;

  // Get scopes
  let scopes: string[] | "all" = "all";
  if (user.role !== "admin" && user.role !== "superadmin") {
    const userScopes = await prisma.userScope.findMany({
      where: { userId: user.id },
      select: { departmentEntityId: true },
    });
    scopes = userScopes.map((s) => s.departmentEntityId);
  }

  // When acting as another operator, fetch that operator's details
  let operator = { id: operatorId, companyName: user.operator.companyName, industry: user.operator.industry };
  if (actingAsOperator && operatorId !== user.operatorId) {
    const actingOp = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { id: true, companyName: true, industry: true },
    });
    if (actingOp) {
      operator = actingOp;
    }
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      entityId: user.entityId,
      locale: user.locale,
    },
    operator,
    isSuperadmin,
    actingAsOperator,
    scopes,
  });
}

export async function PATCH(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ("locale" in body) {
    const newLocale = body.locale;
    if (typeof newLocale !== "string" || !locales.includes(newLocale as Locale)) {
      return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
    }
    updates.locale = newLocale;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: su.user.id },
    data: updates,
  });

  return NextResponse.json({ ok: true });
}
