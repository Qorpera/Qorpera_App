import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST() {
  const su = await getSessionUser();
  if (!su?.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookieStore = await cookies();
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
