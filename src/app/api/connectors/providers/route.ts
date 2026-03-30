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
    shopify: () => !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET),
    linkedin: () => !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
    "meta-ads": () => !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    pipedrive: () => !!(process.env.PIPEDRIVE_CLIENT_ID && process.env.PIPEDRIVE_CLIENT_SECRET),
    salesforce: () => !!(process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET),
    intercom: () => !!(process.env.INTERCOM_CLIENT_ID && process.env.INTERCOM_CLIENT_SECRET),
    zendesk: () => !!(process.env.ZENDESK_CLIENT_ID && process.env.ZENDESK_CLIENT_SECRET),
    "dynamics-bc": () => !!(process.env.DYNAMICS_BC_CLIENT_ID && process.env.DYNAMICS_BC_CLIENT_SECRET),
    "sap-s4hana": () => true,
    "oracle-erp": () => true,
    maersk: () => true,
    cargowise: () => true,
    dinero: () => true,
    pleo: () => true,
    xero: () => !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET),
    fortnox: () => !!(process.env.FORTNOX_CLIENT_ID && process.env.FORTNOX_CLIENT_SECRET),
    vismanet: () => !!(process.env.VISMANET_CLIENT_ID && process.env.VISMANET_CLIENT_SECRET),
    "exact-online": () => !!(process.env.EXACT_CLIENT_ID && process.env.EXACT_CLIENT_SECRET),
    sage: () => !!(process.env.SAGE_CLIENT_ID && process.env.SAGE_CLIENT_SECRET),
    netsuite: () => true,
    "sap-b1": () => true,
    "hapag-lloyd": () => true,
    project44: () => true,
    xeneta: () => true,
    monday: () => !!(process.env.MONDAY_CLIENT_ID && process.env.MONDAY_CLIENT_SECRET),
    asana: () => !!(process.env.ASANA_CLIENT_ID && process.env.ASANA_CLIENT_SECRET),
    jira: () => !!(process.env.JIRA_CLIENT_ID && process.env.JIRA_CLIENT_SECRET),
    woocommerce: () => true,
  };

  const result = providers
    .filter((p) => p.id !== "google-sheets") // Hide legacy standalone connector
    .map((p) => ({
      ...p,
      configured: ENV_CHECKS[p.id]?.() ?? true,
    }));

  return NextResponse.json({ providers: result });
}
