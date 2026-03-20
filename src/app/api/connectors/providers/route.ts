import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listProviders } from "@/lib/connectors/registry";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const providers = listProviders();

  // Annotate with env-var availability
  const ENV_CHECKS: Record<string, () => boolean> = {
    google: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    "google-sheets": () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    gmail: () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    hubspot: () => !!(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET),
    stripe: () => !!(process.env.STRIPE_CLIENT_ID && process.env.STRIPE_SECRET_KEY),
    slack: () => !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET),
    microsoft: () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    economic: () => !!process.env.ECONOMIC_APP_SECRET_TOKEN,
    "google-ads": () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
  };

  const result = providers.map((p) => ({
    ...p,
    configured: ENV_CHECKS[p.id]?.() ?? true,
  }));

  return NextResponse.json({ providers: result });
}
