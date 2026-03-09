import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su?.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { operatorId } = await req.json().catch(() => ({ operatorId: null }));
  if (!operatorId) {
    return NextResponse.json({ error: "operatorId is required" }, { status: 400 });
  }

  const operator = await prisma.operator.findUnique({ where: { id: operatorId } });
  if (!operator) {
    return NextResponse.json({ error: "Operator not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set("acting_operator_id", operatorId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Session cookie — no max-age, clears on browser close
  });

  return NextResponse.json({
    success: true,
    operator: { id: operator.id, companyName: operator.companyName || operator.displayName },
  });
}
