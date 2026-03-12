import { NextResponse } from "next/server";
import { deleteSession, clearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";

// Intentionally reads cookie directly instead of getSessionUser() —
// logout must work even if session is expired or corrupted
export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await deleteSession(token);
  }

  await clearSessionCookie();

  // Clear superadmin operator-switching cookie
  const isLocalhost = (process.env.NEXT_PUBLIC_APP_URL || "").includes("localhost");
  cookieStore.set("acting_operator_id", "", {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ success: true });
}
