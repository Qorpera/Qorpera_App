import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  if (process.env.DEMO_ONBOARDING !== "true") {
    return NextResponse.json({ demoMode: false });
  }

  const session = await getSessionUser();
  if (!session) return NextResponse.json({ demoMode: false });

  const { user, operatorId } = session;

  if (user.role === "superadmin") {
    return NextResponse.json({ demoMode: true });
  }

  if (user.role === "admin") {
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { isTestOperator: true },
    });
    if (operator?.isTestOperator) {
      return NextResponse.json({ demoMode: true });
    }
  }

  return NextResponse.json({ demoMode: false });
}
