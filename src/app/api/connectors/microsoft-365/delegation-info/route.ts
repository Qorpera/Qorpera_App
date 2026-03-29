import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getMicrosoftAppClientId, REQUIRED_PERMISSIONS } from "@/lib/connectors/microsoft-365-delegation";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    clientId: getMicrosoftAppClientId(),
    permissions: REQUIRED_PERMISSIONS,
  });
}
