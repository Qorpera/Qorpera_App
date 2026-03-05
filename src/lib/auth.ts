import { prisma } from "./db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";

const SESSION_COOKIE = "qorpera_session";
const SESSION_EXPIRY_DAYS = 7;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === derived;
}

export async function createSession(operatorId: string, userId?: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { operatorId, userId: userId ?? null, token, expiresAt } });
  return token;
}

export async function getSessionFromCookies(): Promise<{ operatorId: string; userId: string | null } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return { operatorId: session.operatorId, userId: session.userId };
}

export async function getOperatorId(): Promise<string> {
  const session = await getSessionFromCookies();
  if (session) return session.operatorId;
  redirect("/login");
}

export async function getUserId(): Promise<string> {
  const session = await getSessionFromCookies();
  if (!session || !session.userId) redirect("/login");
  return session.userId;
}

export async function getUserRole(): Promise<string> {
  const session = await getSessionFromCookies();
  if (!session || !session.userId) return "admin"; // fallback for legacy sessions
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return "admin"; // fallback for legacy sessions
  return user.role;
}

export async function getUser() {
  const userId = await getUserId();
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

export async function getOperator() {
  const id = await getOperatorId();
  return prisma.operator.findUniqueOrThrow({ where: { id } });
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.delete({ where: { token } }).catch(() => {});
}

export async function isFirstRun(): Promise<boolean> {
  const count = await prisma.user.count();
  return count === 0;
}

export function setSessionCookie(token: string) {
  // Returns the cookie options for use with cookies().set()
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: false,
    maxAge: SESSION_EXPIRY_DAYS * 24 * 60 * 60,
  };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
