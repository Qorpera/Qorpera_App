import { NextResponse } from "next/server";
import { deleteSession, clearSessionCookie, SESSION_COOKIE_NAME } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await deleteSession(token);
  }

  await clearSessionCookie();

  return NextResponse.json({ success: true });
}
