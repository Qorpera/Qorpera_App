import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ACTIVE_CONNECTOR } from "@/lib/connector-filters";

const OAUTH_PROVIDERS = new Set(["google", "microsoft", "slack", "hubspot", "stripe", "pipedrive", "salesforce", "zendesk", "intercom", "google-ads", "linkedin", "meta-ads", "shopify"]);

const AUTH_URL_ROUTES: Record<string, string> = {
  google: "/api/connectors/google/auth",
  microsoft: "/api/connectors/microsoft/auth",
  slack: "/api/connectors/slack/auth-url",
  hubspot: "/api/connectors/hubspot/auth-url",
  stripe: "/api/connectors/stripe/auth-url",
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;
  const { id } = await params;

  const connector = await prisma.sourceConnector.findFirst({
    where: { ...ACTIVE_CONNECTOR, id, operatorId },
  });

  if (!connector) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (OAUTH_PROVIDERS.has(connector.provider)) {
    const authRoute = AUTH_URL_ROUTES[connector.provider];
    if (authRoute) {
      return NextResponse.json({ authUrl: authRoute });
    }
    // For providers without a known auth route, return generic guidance
    return NextResponse.json({ authUrl: `/settings?tab=connections` });
  }

  // Non-OAuth connector — tell frontend to show config form
  return NextResponse.json({ requiresConfig: true });
}
