import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);

export type EmailProvider = "google" | "microsoft" | "unknown";

/**
 * Detect whether a domain uses Google Workspace or Microsoft 365
 * by inspecting its MX records.
 *
 * Google MX records contain: aspmx.l.google.com, alt[1-4].aspmx.l.google.com,
 *   *.googlemail.com, google.com
 * Microsoft MX records contain: *.mail.protection.outlook.com
 */
export async function detectEmailProvider(domain: string): Promise<{
  provider: EmailProvider;
  mxRecords: string[];
}> {
  try {
    const records = await resolveMx(domain);
    const exchanges = records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange.toLowerCase());

    if (exchanges.some((mx) => mx.includes("google") || mx.includes("googlemail"))) {
      return { provider: "google", mxRecords: exchanges };
    }

    if (exchanges.some((mx) => mx.includes("outlook.com") || mx.includes("microsoft"))) {
      return { provider: "microsoft", mxRecords: exchanges };
    }

    return { provider: "unknown", mxRecords: exchanges };
  } catch {
    // DNS lookup failure — domain doesn't exist or no MX records
    return { provider: "unknown", mxRecords: [] };
  }
}
