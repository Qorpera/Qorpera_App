import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { listProviders } from "@/lib/connectors/registry";

export async function GET() {
  await getOperatorId(); // ensure authenticated

  const providers = listProviders();

  // Annotate with env-var availability
  const result = providers.map((p) => ({
    ...p,
    configured:
      p.id === "google-sheets"
        ? !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
        : p.id === "hubspot"
          ? !!(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET)
          : p.id === "stripe"
            ? !!(process.env.STRIPE_CLIENT_ID && process.env.STRIPE_SECRET_KEY)
            : true,
  }));

  return NextResponse.json({ providers: result });
}
