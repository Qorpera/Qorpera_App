import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { detectEmailProvider } from "@/lib/connectors/mx-detection";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { domain: rawDomain } = await req.json();
  if (!rawDomain || typeof rawDomain !== "string") {
    return NextResponse.json({ error: "domain is required" }, { status: 400 });
  }

  // Extract domain from email if full email provided
  const domain = rawDomain.includes("@") ? rawDomain.split("@")[1] : rawDomain;

  // Basic domain format validation
  if (!domain || !domain.includes(".") || domain.length < 3) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  const result = await detectEmailProvider(domain.trim().toLowerCase());
  return NextResponse.json(result);
}
