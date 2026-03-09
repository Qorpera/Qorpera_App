import { NextResponse } from "next/server";
import { isFirstRun, getSessionUser } from "@/lib/auth";

export async function GET() {
  const firstRun = await isFirstRun();
  const su = await getSessionUser();
  return NextResponse.json({
    firstRun,
    authenticated: !!su,
    role: su?.user.role ?? null,
  });
}
