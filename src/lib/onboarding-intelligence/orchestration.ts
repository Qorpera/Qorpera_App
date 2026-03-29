import type { PeopleRegistryEntry } from "./agents/people-discovery";
import type { TemporalReport } from "./agents/temporal-analyst";

// ── Round 1 Preamble ─────────────────────────────────────────────────────────

export function buildRound1Preamble(
  peopleReport?: PeopleRegistryEntry[],
  temporalReport?: TemporalReport,
): string {
  const parts: string[] = ["## Foundation Data (from Round 0 analysis)\n"];

  if (peopleReport && peopleReport.length > 0) {
    // Directory-verified employees section
    const verifiedEntries = peopleReport.filter(p => p.adminApiVerified);
    if (verifiedEntries.length > 0) {
      const hasGoogle = verifiedEntries.some(p => p.sources.some(s => s.system === "google-admin-sdk"));
      const hasMicrosoft = verifiedEntries.some(p => p.sources.some(s => s.system === "microsoft-graph"));
      const sourceLabel = hasGoogle && hasMicrosoft
        ? "Google Workspace + Microsoft 365"
        : hasGoogle ? "Google Workspace" : "Microsoft 365";

      parts.push(`### Directory-Verified Employees (${sourceLabel})`);
      parts.push(`The following ${verifiedEntries.length} employees were verified via the company directory. Treat these as high-confidence ground truth for identity and department membership. Communication patterns may reveal organizational realities that differ from the official directory — flag any significant contradictions you find.\n`);

      for (const entry of verifiedEntries.slice(0, 100)) {
        const lineParts = [entry.displayName, `<${entry.email}>`];
        if (entry.adminDepartment) lineParts.push(`dept: ${entry.adminDepartment}`);
        if (entry.adminTitle) lineParts.push(`title: ${entry.adminTitle}`);
        if (entry.adminOrgUnit && entry.adminOrgUnit !== "/") lineParts.push(`org: ${entry.adminOrgUnit}`);
        if (entry.adminIsAdmin) lineParts.push(`(admin)`);
        const total = entry.activityMetrics.emailsSent + entry.activityMetrics.emailsReceived +
          entry.activityMetrics.slackMessages + entry.activityMetrics.meetingsAttended +
          entry.activityMetrics.documentsAuthored;
        if (total > 0) lineParts.push(`activity: ${total}`);
        parts.push(`- ${lineParts.join(" | ")}`);
      }
      if (verifiedEntries.length > 100) {
        parts.push(`- ... and ${verifiedEntries.length - 100} more`);
      }
      parts.push("");
    }

    // Non-verified internal team members (exclude already-listed verified entries)
    const internal = peopleReport.filter((p) => p.isInternal && !p.adminApiVerified);
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
