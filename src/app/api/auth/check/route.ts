import { NextResponse } from "next/server";
import { isFirstRun, getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const firstRun = await isFirstRun();
  const session = await getSessionFromCookies();
  let role: string | null = null;
  if (session?.userId) {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    role = user?.role ?? null;
  }
  return NextResponse.json({ firstRun, authenticated: !!session, role });
}
