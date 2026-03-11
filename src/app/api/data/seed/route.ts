import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, message: "Demo data seeded" });
}
