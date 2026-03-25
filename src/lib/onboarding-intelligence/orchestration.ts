import type { PeopleRegistryEntry } from "./agents/people-discovery";
import type { TemporalReport } from "./agents/temporal-analyst";

// ── Round 1 Preamble ─────────────────────────────────────────────────────────

export function buildRound1Preamble(
  peopleReport?: PeopleRegistryEntry[],
  temporalReport?: TemporalReport,
): string {
  const parts: string[] = ["## Foundation Data (from Round 0 analysis)\n"];

  if (peopleReport && peopleReport.length > 0) {
    const internal = peopleReport.filter((p) => p.isInternal);
    parts.push(`### People Registry (${internal.length} internal team members discovered)`);
    for (const p of internal.slice(0, 50)) {
      const roleInfo = p.sources[0]?.role ? ` — Role: ${p.sources[0].role}` : "";
      parts.push(`- ${p.displayName} <${p.email}> — Sources: ${p.sources.map((s) => s.system).join(", ")}${roleInfo}`);
    }
    if (internal.length > 50) {
      parts.push(`- ... and ${internal.length - 50} more`);
    }
    parts.push("");
  }

  if (temporalReport) {
    parts.push("### Temporal Context");
    const majorEvents = temporalReport.temporalMap?.filter((e) => e.significance === "major") || [];
    if (majorEvents.length > 0) {
      parts.push("Key recent changes:");
      for (const e of majorEvents.slice(0, 10)) {
        parts.push(`- ${e.date}: ${e.event}`);
      }
    }
    if (temporalReport.recencyWarnings?.length > 0) {
      parts.push("\nDocument freshness warnings:");
      for (const w of temporalReport.recencyWarnings) {
        parts.push(`- ${w}`);
      }
    }
    parts.push(
      "\nUse the freshness scores when weighing evidence from documents. " +
      "Scores below 0.4 are historical context only — don't base structural conclusions on them without corroboration from recent data.",
    );
  }

  return parts.join("\n");
}
