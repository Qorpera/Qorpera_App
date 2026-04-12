/**
 * Shared wiki page content builder for system jobs.
 * Used by: API POST, API PATCH sync, copilot create_system_job, internal capabilities.
 */
export function buildSystemJobWikiContent(opts: {
  description: string;
  cronExpression: string;
  scope: string;
  domainPageSlug?: string | null;
  ownerPageSlug?: string | null;
}): string {
  const domain = opts.domainPageSlug ? `[[${opts.domainPageSlug}]]` : "Company-wide";
  const owner = opts.ownerPageSlug ? `[[${opts.ownerPageSlug}]]` : "All domain operators";
  return `## What This Job Does\n\n${opts.description}\n\n## Schedule\n\n\`${opts.cronExpression}\`\n\n## Domain\n\n${domain}\n\n## Findings Go To\n\n${owner}`;
}
