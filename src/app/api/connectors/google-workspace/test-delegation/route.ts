import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { testDelegationAccess } from "@/lib/connectors/google-workspace-delegation";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { domain, adminEmail } = await req.json();
  if (!domain || typeof domain !== "string" || !adminEmail || typeof adminEmail !== "string") {
    return NextResponse.json({ error: "domain and adminEmail are required" }, { status: 400 });
  }
  if (!adminEmail.includes("@") || !adminEmail.includes(".")) {
    return NextResponse.json({ error: "adminEmail must be a valid email address" }, { status: 400 });
  }

  const result = await testDelegationAccess(domain, adminEmail);
  return NextResponse.json(result);
}
