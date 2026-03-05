import { NextResponse } from "next/server";
import { isFirstRun, getSessionFromCookies } from "@/lib/auth";

export async function GET() {
  const firstRun = await isFirstRun();
  const session = await getSessionFromCookies();

  return NextResponse.json({
    firstRun,
    authenticated: !!session,
  });
}
