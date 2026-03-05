import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie, isFirstRun } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  // Only allow registration if no users exist
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

  // Check if an Operator already exists (migration from Day 1 state)
  let operator = await prisma.operator.findFirst();
  if (!operator) {
    operator = await prisma.operator.create({
      data: { displayName, email, passwordHash },
    });
  }

  // Create the first User with admin role
  const user = await prisma.user.create({
    data: {
      operatorId: operator.id,
      email,
      displayName,
      passwordHash,
      role: "admin",
    },
  });

  const token = await createSession(operator.id, user.id);
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
    id: user.id,
    operatorId: operator.id,
    displayName,
    email,
    role: "admin",
  }, { status: 201 });
}
