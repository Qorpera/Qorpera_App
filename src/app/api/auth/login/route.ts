import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  const operator = await prisma.operator.findFirst({ where: { email } });
  if (!operator || !operator.passwordHash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const valid = await verifyPassword(password, operator.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createSession(operator.id);
  const cookieStore = await cookies();
  const cookieOpts = setSessionCookie(token);
  cookieStore.set(cookieOpts.name, cookieOpts.value, {
    httpOnly: cookieOpts.httpOnly,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    secure: cookieOpts.secure,
    maxAge: cookieOpts.maxAge,
  });

  return NextResponse.json({
    id: operator.id,
    displayName: operator.displayName,
    email: operator.email,
  });
}
