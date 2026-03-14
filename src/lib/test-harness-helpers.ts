import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";

type SuperadminSession = {
  user: { id: string; operatorId: string; role: string; name: string };
  operatorId: string;
};

/**
 * Require superadmin access. Returns session or throws.
 */
export async function requireSuperadmin(): Promise<SuperadminSession> {
  const session = await getSessionUser();
  if (!session) throw new AuthError(401, "Unauthorized");
  if (session.user.role !== "superadmin") throw new AuthError(403, "Superadmin only");
  return {
    user: {
      id: session.user.id,
      operatorId: session.user.operatorId,
      role: session.user.role,
      name: session.user.name,
    },
    operatorId: session.operatorId,
  };
}

/**
 * Resolve operatorId from query param or session default.
 */
export function getOperatorId(req: NextRequest, sessionOperatorId: string): string {
  const fromQuery = req.nextUrl.searchParams.get("operatorId");
  return fromQuery?.trim() || sessionOperatorId;
}

/**
 * Resolve operatorId from JSON body or session default.
 */
export function getOperatorIdFromBody(body: Record<string, unknown>, sessionOperatorId: string): string {
  const fromBody = typeof body.operatorId === "string" ? body.operatorId.trim() : "";
  return fromBody || sessionOperatorId;
}

export function formatTimestamp(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString();
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
