import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const su = await getSessionUser();
  if (!su?.isSuperadmin || !su.actingAsOperator) {
    return NextResponse.json({ error: "Forbidden — must be superadmin acting as an operator" }, { status: 403 });
  }

  const { userId } = await req.json().catch(() => ({ userId: null }));
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, operatorId: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Must belong to the operator the superadmin is currently viewing
  if (targetUser.operatorId !== su.operatorId) {
    return NextResponse.json({ error: "User does not belong to current operator" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const isLocalhost = (process.env.NEXT_PUBLIC_APP_URL || "").includes("localhost");
  cookieStore.set("acting_user_id", userId, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.json({
    success: true,
    user: { id: targetUser.id, name: targetUser.name, email: targetUser.email, role: targetUser.role },
  });
}
