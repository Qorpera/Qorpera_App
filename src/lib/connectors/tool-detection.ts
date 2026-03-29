import { prisma } from "@/lib/db";

/**
 * Mapping of sender email domains/patterns to connector provider IDs.
 * Each entry can match multiple domains (e.g., HubSpot sends from
 * several domains depending on the product).
 */
const SENDER_DOMAIN_MAP: Array<{
  provider: string;
  label: string;
  domains: string[];
}> = [
  // CRM
  { provider: "hubspot", label: "HubSpot", domains: ["hubspot.com", "hubspotemail.net", "hs-analytics.net"] },
  { provider: "pipedrive", label: "Pipedrive", domains: ["pipedrive.com", "pipedrivemail.com"] },
  { provider: "salesforce", label: "Salesforce", domains: ["salesforce.com", "force.com"] },

  // Communication
  { provider: "slack", label: "Slack", domains: ["slack.com", "slackbot.com"] },

  // Finance
  { provider: "stripe", label: "Stripe", domains: ["stripe.com"] },
  { provider: "economic", label: "e-conomic", domains: ["e-conomic.com", "visma.com"] },

  // Support
  { provider: "intercom", label: "Intercom", domains: ["intercom.io", "intercom-mail.com"] },
  { provider: "zendesk", label: "Zendesk", domains: ["zendesk.com", "zopim.com"] },

  // E-commerce
  { provider: "shopify", label: "Shopify", domains: ["shopify.com", "myshopify.com"] },

  // Marketing
  { provider: "google-ads", label: "Google Ads", domains: ["googleadservices.com"] },
  { provider: "linkedin", label: "LinkedIn", domains: ["linkedin.com", "licdn.com"] },
  { provider: "meta-ads", label: "Meta Ads", domains: ["facebookmail.com", "facebook.com", "instagram.com"] },

  // ERP
  { provider: "dynamics-bc", label: "Dynamics 365", domains: ["dynamics.com"] },

  // Logistics
  { provider: "maersk", label: "Maersk", domains: ["maersk.com"] },
  { provider: "cargowise", label: "CargoWise", domains: ["cargowise.com", "wisetech.com"] },
];

export interface DetectedTool {
  provider: string;
  label: string;
  emailCount: number;
  firstSeen: string;
  lastSeen: string;
  alreadyConnected: boolean;
}

/**
 * Scan ContentChunks with sourceType='email' to detect which SaaS tools
 * the company uses, based on sender email domains.
 *
 * Returns a list of detected tools sorted by email count (most active first).
 */
export async function detectToolsFromEmail(operatorId: string): Promise<DetectedTool[]> {
  // Query all unique sender domains from email metadata
  const senderData = await prisma.$queryRawUnsafe<
    Array<{ domain: string; cnt: bigint; first_seen: Date; last_seen: Date }>
  >(
    `SELECT
       LOWER(SPLIT_PART(metadata::jsonb->>'from', '@', 2)) as domain,
       COUNT(DISTINCT "sourceId") as cnt,
       MIN("createdAt") as first_seen,
       MAX("createdAt") as last_seen
     FROM "ContentChunk"
     WHERE "operatorId" = $1
       AND "sourceType" = 'email'
       AND metadata IS NOT NULL
       AND metadata::jsonb->>'from' LIKE '%@%'
     GROUP BY LOWER(SPLIT_PART(metadata::jsonb->>'from', '@', 2))
     HAVING COUNT(DISTINCT "sourceId") >= 2
     ORDER BY cnt DESC
     LIMIT 500`,
    operatorId,
  );

  // Build a domain → sender data lookup
  const domainStats = new Map<string, { count: number; firstSeen: Date; lastSeen: Date }>();
  for (const row of senderData) {
    if (!row.domain) continue;
    const parts = row.domain.split(".");
    domainStats.set(row.domain, {
      count: Number(row.cnt),
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
    });
    // Handle subdomains: mail.hubspot.com → also register under hubspot.com
    if (parts.length > 2) {
      const baseDomain = parts.slice(-2).join(".");
      const existing = domainStats.get(baseDomain);
      if (existing) {
        existing.count += Number(row.cnt);
        if (row.first_seen < existing.firstSeen) existing.firstSeen = row.first_seen;
        if (row.last_seen > existing.lastSeen) existing.lastSeen = row.last_seen;
      } else {
        domainStats.set(baseDomain, {
          count: Number(row.cnt),
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
        });
      }
    }
  }

  // Get already-connected providers
  const connectedProviders = new Set(
    (await prisma.sourceConnector.findMany({
      where: { operatorId, status: "active", deletedAt: null },
      select: { provider: true },
    })).map(c => c.provider),
  );

  // Match against known tool domains
  const detected: DetectedTool[] = [];
  for (const tool of SENDER_DOMAIN_MAP) {
    let totalCount = 0;
    let firstSeen: Date | null = null;
    let lastSeen: Date | null = null;

    for (const toolDomain of tool.domains) {
      const stats = domainStats.get(toolDomain);
      if (stats) {
        totalCount += stats.count;
        if (!firstSeen || stats.firstSeen < firstSeen) firstSeen = stats.firstSeen;
        if (!lastSeen || stats.lastSeen > lastSeen) lastSeen = stats.lastSeen;
      }
    }

    if (totalCount >= 2) {
      detected.push({
        provider: tool.provider,
        label: tool.label,
        emailCount: totalCount,
        firstSeen: firstSeen?.toISOString() || "",
        lastSeen: lastSeen?.toISOString() || "",
        alreadyConnected: connectedProviders.has(tool.provider),
      });
    }
  }

  // Sort: unconnected first by email count, connected last
  detected.sort((a, b) => {
    if (a.alreadyConnected !== b.alreadyConnected) return a.alreadyConnected ? 1 : -1;
    return b.emailCount - a.emailCount;
  });

  return detected;
}
