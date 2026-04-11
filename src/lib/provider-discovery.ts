import { promises as dns } from "dns";

const CONSUMER_DOMAINS = new Set([
  // Google consumer
  "gmail.com", "googlemail.com",
  // Microsoft consumer
  "outlook.com", "outlook.dk", "hotmail.com", "hotmail.dk", "live.com", "live.dk", "msn.com",
  // Yahoo
  "yahoo.com", "yahoo.co.uk", "yahoo.dk", "yahoo.de", "yahoo.fr", "ymail.com", "rocketmail.com",
  // Apple
  "icloud.com", "me.com", "mac.com",
  // Privacy-focused
  "protonmail.com", "protonmail.ch", "proton.me", "tutanota.com", "tutanota.de", "tutamail.com",
  // Other international
  "zoho.com", "aol.com", "mail.com", "email.com",
  "gmx.com", "gmx.de", "gmx.net", "gmx.at",
  "web.de", "freenet.de", "t-online.de",
  // Nordic consumer ISP domains
  "jubii.dk", "ofir.dk", "tdcadsl.dk", "stofanet.dk", "youmail.dk",
  "telia.com", "comhem.se", "bredband.net",
  "online.no", "broadpark.no",
]);

export function isConsumerDomain(domain: string): boolean {
  return CONSUMER_DOMAINS.has(domain.toLowerCase());
}

export async function discoverEmailProvider(domain: string): Promise<{
  provider: "microsoft-365" | "google-workspace" | "self-hosted" | "unknown";
  providerLabel: string;
  mxRecords: Array<{ priority: number; exchange: string }>;
  isConsumerDomain: boolean;
}> {
  if (CONSUMER_DOMAINS.has(domain.toLowerCase())) {
    return {
      provider: "unknown",
      providerLabel: "Personal email provider",
      mxRecords: [],
      isConsumerDomain: true,
    };
  }

  let mxRecords: Array<{ priority: number; exchange: string }> = [];
  try {
    const records = await dns.resolveMx(domain);
    mxRecords = records
      .map((r) => ({
        priority: r.priority,
        exchange: r.exchange.toLowerCase(),
      }))
      .sort((a, b) => a.priority - b.priority);
  } catch (err) {
    console.warn(`[provider-discovery] MX lookup failed for ${domain}:`, err);
    return {
      provider: "unknown",
      providerLabel: "Could not detect email provider",
      mxRecords: [],
      isConsumerDomain: false,
    };
  }

  const exchanges = mxRecords.map((r) => r.exchange);

  if (exchanges.some((e) => e.includes(".protection.outlook.com") || e.includes(".outlook.com"))) {
    return { provider: "microsoft-365", providerLabel: "Microsoft 365", mxRecords, isConsumerDomain: false };
  }

  if (exchanges.some((e) => e.includes("google.com") || e.includes("googlemail.com"))) {
    return { provider: "google-workspace", providerLabel: "Google Workspace", mxRecords, isConsumerDomain: false };
  }

  if (exchanges.some((e) => e.includes(".pphosted.com") || e.includes(".mimecast.com") || e.includes(".barracudanetworks.com"))) {
    return { provider: "unknown", providerLabel: "Email security gateway detected — provider unclear", mxRecords, isConsumerDomain: false };
  }

  return { provider: "self-hosted", providerLabel: "Self-hosted email", mxRecords, isConsumerDomain: false };
}
