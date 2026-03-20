import type { ConnectorProvider } from "./types";
import { googleProvider } from "./google-provider";
import { googleSheetsProvider } from "./google-sheets";
import { hubspotProvider } from "./hubspot";
import { stripeProvider } from "./stripe";
import { slackProvider } from "./slack-provider";
import { microsoftProvider } from "./microsoft-provider";
import { economicProvider } from "./economic-provider";
import { googleAdsProvider } from "./google-ads-provider";

const PROVIDERS: ConnectorProvider[] = [hubspotProvider, stripeProvider, googleProvider, googleSheetsProvider, slackProvider, microsoftProvider, economicProvider, googleAdsProvider];

export function getProvider(id: string): ConnectorProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function listProviders(): Array<{
  id: string;
  name: string;
  configSchema: ConnectorProvider["configSchema"];
}> {
  return PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    configSchema: p.configSchema,
  }));
}
