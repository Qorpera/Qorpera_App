import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDelegationClientId, DELEGATION_SCOPES_STRING } from "@/lib/connectors/google-workspace-delegation";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    clientId: getDelegationClientId(),
    scopes: DELEGATION_SCOPES_STRING,
  });
}
