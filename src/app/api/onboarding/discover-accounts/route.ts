import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { discoverOrganizationAccounts } from "@/lib/account-discovery";

export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  try {
    const accounts = await discoverOrganizationAccounts(session.operatorId);
    return NextResponse.json({ accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
