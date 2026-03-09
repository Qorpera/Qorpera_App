import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST() {
  const su = await getSessionUser();
  if (!su?.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set("acting_operator_id", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ success: true });
}
