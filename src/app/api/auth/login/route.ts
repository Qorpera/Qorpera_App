import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many login attempts. Try again later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const { email, password } = body || {};

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { operator: true },
  });

  if (!user) {
    // Run bcrypt on a dummy hash to prevent timing-based email enumeration
    await verifyPassword(password, "$2b$12$000000000000000000000uGHTEYOTGelkJYm2ZNMiJM9T/3TO3i");
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(user.id);
  await setSessionCookie(token, expiresAt);

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    operator: { id: user.operator.id, companyName: user.operator.companyName },
  });
}
