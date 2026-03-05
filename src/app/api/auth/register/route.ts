import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie, isFirstRun } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  // Only allow registration if no operator exists
  const firstRun = await isFirstRun();
  if (!firstRun) {
    return NextResponse.json({ error: "Operator already registered" }, { status: 409 });
  }

  const body = await req.json();
  const { displayName, email, password } = body;

  if (!displayName || !email || !password) {
    return NextResponse.json({ error: "displayName, email, and password are required" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const operator = await prisma.operator.create({
    data: { displayName, email, passwordHash },
  });

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
  }, { status: 201 });
}
