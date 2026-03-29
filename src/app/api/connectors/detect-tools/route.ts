import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { detectToolsFromEmail } from "@/lib/connectors/tool-detection";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tools = await detectToolsFromEmail(session.operatorId);
  return NextResponse.json({ tools });
}
