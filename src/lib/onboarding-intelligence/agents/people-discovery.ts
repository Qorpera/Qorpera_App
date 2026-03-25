/**
 * People Discovery — algorithmic (no LLM) Round 0 agent.
 *
 * Scans all connected sources to build a master list of every person
 * the company interacts with: entities, email participants, Slack authors,
 * calendar attendees. Deduplicates by email, classifies internal vs external.
 */

import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PeopleRegistryEntry {
  email: string;
  displayName: string;
  sources: Array<{
    system: string;
    externalId?: string;
    role?: string;
    title?: string;
  }>;
  isInternal: boolean;
  activityMetrics: {
    emailsSent: number;
    emailsReceived: number;
    slackMessages: number;
    meetingsAttended: number;
    documentsAuthored: number;
  };
  entityId?: string;
}

// ── Algorithm ────────────────────────────────────────────────────────────────

export async function buildPeopleRegistry(operatorId: string): Promise<PeopleRegistryEntry[]> {
  // 1. Get operator's internal email domains
  const internalDomains = await getInternalDomains(operatorId);

  // Accumulator: email → partial entry
  const people = new Map<string, PeopleRegistryEntry>();

  const getOrCreate = (email: string, name?: string): PeopleRegistryEntry => {
    const key = email.toLowerCase();
    let entry = people.get(key);
    if (!entry) {
      entry = {
        email: key,
        displayName: name || key.split("@")[0],
        sources: [],
        isInternal: false,
        activityMetrics: {
          emailsSent: 0,
          emailsReceived: 0,
          slackMessages: 0,
          meetingsAttended: 0,
          documentsAuthored: 0,
        },
      };
      people.set(key, entry);
    }
    // Update display name if we get a better one
    if (name && name !== key.split("@")[0] && (!entry.displayName || entry.displayName === key.split("@")[0])) {
      entry.displayName = name;
    }
    return entry;
  };

  // 2. Scan entities (contacts, team members) for people with email identity
  const entityPeople = await prisma.entity.findMany({
    where: {
      operatorId,
      status: "active",
      mergedIntoId: null,
      entityType: { slug: { in: ["contact", "team-member"] } },
    },
    include: {
      entityType: { select: { slug: true } },
      propertyValues: {
        include: { property: { select: { slug: true, identityRole: true } } },
      },
    },
  });

  for (const entity of entityPeople) {
    const emailProp = entity.propertyValues.find((pv) => pv.property.identityRole === "email");
    if (!emailProp) continue;

    const email = emailProp.value.toLowerCase();
    const entry = getOrCreate(email, entity.displayName);
    entry.entityId = entity.id;

    const roleProp = entity.propertyValues.find((pv) => pv.property.slug === "role");
    const titleProp = entity.propertyValues.find((pv) => pv.property.slug === "title" || pv.property.slug === "job-title");

    entry.sources.push({
      system: entity.sourceSystem || entity.entityType.slug,
      externalId: entity.externalId || undefined,
      role: roleProp?.value,
      title: titleProp?.value,
    });
  }

  // 3. Scan ContentChunk metadata for email participants
  // Use DISTINCT ON sourceId to get one metadata row per email thread (avoid over-counting
  // from multiple chunks of the same email)
  const emailChunks = await prisma.$queryRawUnsafe<
    Array<{ metadata: string }>
  >(
    `SELECT DISTINCT ON ("sourceId") metadata FROM "ContentChunk"
     WHERE "operatorId" = $1 AND "sourceType" = 'email' AND metadata IS NOT NULL
     ORDER BY "sourceId", "chunkIndex"
     LIMIT 5000`,
    operatorId,
  );

  for (const row of emailChunks) {
    try {
      const meta = JSON.parse(row.metadata);
      if (meta.sender) {
        const senderEmail = extractEmail(meta.sender);
        if (senderEmail) {
          const entry = getOrCreate(senderEmail, extractName(meta.sender));
          entry.activityMetrics.emailsSent++;
          if (!entry.sources.find((s) => s.system === "gmail")) {
            entry.sources.push({ system: "gmail" });
          }
        }
      }
      const recipients = [...(meta.to || []), ...(meta.cc || [])];
      for (const r of recipients) {
        const recipEmail = extractEmail(r);
        if (recipEmail) {
          const entry = getOrCreate(recipEmail, extractName(r));
          entry.activityMetrics.emailsReceived++;
          if (!entry.sources.find((s) => s.system === "gmail")) {
            entry.sources.push({ system: "gmail" });
          }
        }
      }
    } catch {
      // Skip malformed metadata
    }
  }

  // 4. Scan Slack message metadata for authors
  const slackChunks = await prisma.$queryRawUnsafe<
    Array<{ sender: string; cnt: bigint }>
  >(
    `SELECT metadata::jsonb->>'sender' as sender, COUNT(*) as cnt
     FROM "ContentChunk"
     WHERE "operatorId" = $1 AND "sourceType" = 'slack_message'
       AND metadata::jsonb->>'sender' IS NOT NULL
     GROUP BY metadata::jsonb->>'sender'
     LIMIT 1000`,
    operatorId,
  );

  for (const row of slackChunks) {
    const email = extractEmail(row.sender);
    if (email) {
      const entry = getOrCreate(email, extractName(row.sender));
      entry.activityMetrics.slackMessages += Number(row.cnt);
      if (!entry.sources.find((s) => s.system === "slack")) {
        entry.sources.push({ system: "slack" });
      }
    }
  }

  // 5. Scan ActivitySignals for actors and meeting attendees
  const signals = await prisma.activitySignal.findMany({
    where: { operatorId },
    select: { signalType: true, metadata: true },
    take: 5000,
  });

  for (const sig of signals) {
    if (!sig.metadata) continue;
    try {
      const meta = JSON.parse(sig.metadata);
      if (sig.signalType.includes("meeting") && Array.isArray(meta.attendees)) {
        for (const attendee of meta.attendees) {
          const email = extractEmail(attendee);
          if (email) {
            const entry = getOrCreate(email, extractName(attendee));
            entry.activityMetrics.meetingsAttended++;
            if (!entry.sources.find((s) => s.system === "calendar")) {
              entry.sources.push({ system: "calendar" });
            }
          }
        }
      }
      if (sig.signalType.includes("doc") && meta.author_email) {
        const entry = getOrCreate(meta.author_email, meta.author_name);
        entry.activityMetrics.documentsAuthored++;
        if (!entry.sources.find((s) => s.system === "drive")) {
          entry.sources.push({ system: "drive" });
        }
      }
    } catch {
      // Skip malformed
    }
  }

  // 6. Classify internal vs external
  for (const entry of people.values()) {
    const domain = entry.email.split("@")[1];
    entry.isInternal = domain ? internalDomains.has(domain.toLowerCase()) : false;
  }

  // 7. Sort: internal first (by total activity), then external (by interaction frequency)
  const registry = [...people.values()];
  registry.sort((a, b) => {
    if (a.isInternal !== b.isInternal) return a.isInternal ? -1 : 1;
    const aTotal = totalActivity(a);
    const bTotal = totalActivity(b);
    return bTotal - aTotal;
  });

  return registry;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getInternalDomains(operatorId: string): Promise<Set<string>> {
  const users = await prisma.user.findMany({
    where: { operatorId, role: { not: "superadmin" } },
    select: { email: true },
  });

  const domains = new Set<string>();
  for (const user of users) {
    const domain = user.email.split("@")[1];
    if (domain) domains.add(domain.toLowerCase());
  }

  // Also check operator's email
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { email: true },
  });
  if (operator?.email) {
    const domain = operator.email.split("@")[1];
    if (domain) domains.add(domain.toLowerCase());
  }

  return domains;
}

/** Extract email from strings like "John Doe <john@example.com>" or just "john@example.com" */
function extractEmail(input: string): string | null {
  if (!input) return null;
  const match = input.match(/<([^>]+@[^>]+)>/);
  if (match) return match[1].toLowerCase();
  if (input.includes("@")) return input.trim().toLowerCase();
  return null;
}

/** Extract name from "John Doe <john@example.com>" format */
function extractName(input: string): string | undefined {
  if (!input) return undefined;
  const match = input.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return undefined;
}

function totalActivity(entry: PeopleRegistryEntry): number {
  const m = entry.activityMetrics;
  return m.emailsSent + m.emailsReceived + m.slackMessages + m.meetingsAttended + m.documentsAuthored;
}
