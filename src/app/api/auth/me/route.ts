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

  // Get scopes — use effective user identity for impersonation
  let scopes: string[] | "all" = "all";
  const scopeRole = su.actingAsUser ? su.effectiveRole : user.role;
  const scopeUserId = su.actingAsUser ? su.effectiveUserId : user.id;

  if (scopeRole !== "admin" && scopeRole !== "superadmin") {
    const userScopes = await prisma.userScope.findMany({
      where: { userId: scopeUserId },
      select: { domainEntityId: true },
    });
    scopes = userScopes.map((s) => s.domainEntityId);
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

  // When impersonating, show the impersonated user's info
  let responseUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    entityId: user.entityId,
    locale: user.locale,
  };

  if (su.actingAsUser) {
    const impersonated = await prisma.user.findUnique({
      where: { id: su.effectiveUserId },
      select: { id: true, name: true, email: true, role: true, entityId: true, locale: true },
    });
    if (impersonated) {
      responseUser = {
        id: impersonated.id,
        name: impersonated.name,
        email: impersonated.email,
        role: impersonated.role,
        entityId: impersonated.entityId,
        locale: impersonated.locale ?? user.locale,
      };
    }
  }

  return NextResponse.json({
    user: responseUser,
    operator,
    isSuperadmin,
    actingAsOperator,
    actingAsUser: su.actingAsUser,
    impersonatedUserName: su.impersonatedUserName,
    effectiveUserId: su.effectiveUserId,
    effectiveRole: su.effectiveRole,
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
