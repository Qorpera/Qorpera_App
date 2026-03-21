import { prisma } from "./db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { User, Operator } from "@prisma/client";

const SESSION_COOKIE = "session_token";
const SESSION_EXPIRY_DAYS = 30;
const BCRYPT_SALT_ROUNDS = 12;

// ── Types ────────────────────────────────────────────────

type SessionUser = {
  user: User & { operator: Operator };
  operatorId: string;
  isSuperadmin: boolean;
  actingAsOperator: boolean;
};

// ── Password hashing ────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Session management ──────────────────────────────────

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, token, expiresAt } });
  return { token, expiresAt };
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

// ── Cookie helpers ──────────────────────────────────────

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const cookieStore = await cookies();
  const isLocalhost = (process.env.NEXT_PUBLIC_APP_URL || "").includes("localhost");
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const isLocalhost = (process.env.NEXT_PUBLIC_APP_URL || "").includes("localhost");
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ── Core auth check ─────────────────────────────────────

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { operator: true } } },
  });

  if (!session) return null;

  // Check expiry
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  const { user } = session;
  const isSuperadmin = user.role === "superadmin";
  let operatorId = user.operatorId;
  let actingAsOperator = false;

  // Superadmin operator switching
  if (isSuperadmin) {
    const actingId = cookieStore.get("acting_operator_id")?.value;
    if (actingId) {
      const targetOp = await prisma.operator.findUnique({ where: { id: actingId } });
      if (targetOp) {
        operatorId = actingId;
        actingAsOperator = true;
      }
    }
  }

  // Enrich Sentry scope with user context (never breaks auth)
  try {
    const { setSentryContext } = await import("@/lib/sentry-context");
    setSentryContext({ id: user.id, operatorId, role: user.role, email: user.email });
  } catch {
    // Sentry not available, ignore
  }

  return { user, operatorId, isSuperadmin, actingAsOperator };
}

// Counts ALL users including superadmin. This means isFirstRun() returns false
// after superadmin setup via create-superadmin.ts. This is correct for our flow:
// superadmin is created first, then the first operator registers via /register.
export async function isFirstRun(): Promise<boolean> {
  const count = await prisma.user.count();
  return count === 0;
}

// ── Superadmin helpers ──────────────────────────────────

export function excludeSuperadmin() {
  return { role: { not: "superadmin" } };
}

// ── Exported constants ──────────────────────────────────

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
