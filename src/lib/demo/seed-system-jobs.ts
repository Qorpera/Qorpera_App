import { prisma } from "@/lib/db";

/**
 * Seed default system jobs for a new operator.
 * Called after onboarding confirmation. Idempotent — skips jobs that already exist by title.
 */
export async function seedDefaultSystemJobs(operatorId: string): Promise<number> {
  const hqAi = await prisma.entity.findFirst({
    where: { operatorId, entityType: { slug: { in: ["hq-ai", "ai-agent"] } }, status: "active" },
    select: { id: true },
  });
  if (!hqAi) return 0;

  const defaults: Array<{
    title: string;
    description: string;
    cronExpression: string;
    scope: string;
    importanceThreshold?: number;
  }> = [
    {
      title: "Competitive Intelligence Monitor",
      description: `Monitor the competitive landscape for this company.
Investigate: What are competitors doing? Are there new entrants? What are the pricing trends?
Search the web for competitor announcements, product launches, pricing changes, funding rounds.
Read our wiki strategy pages to understand our positioning and identify threats or opportunities.
Propose initiatives when you find something that requires a strategic response.`,
      cronExpression: "0 8 * * 1,4",
      scope: "company_wide",
    },
    {
      title: "Marketing & Growth Tracker",
      description: `Track marketing and growth activities for this company.
Investigate: What marketing activities should be happening? What content should be published? Are we meeting our outreach targets?
Read wiki pages about marketing strategy, target audience, and content plans.
Compare what SHOULD be happening against what IS happening (check activity signals, communications).
Propose initiatives for content creation, campaign launches, outreach improvements.
Search the web for industry trends and marketing best practices relevant to our market.`,
      cronExpression: "0 9 * * 1,3,5",
      scope: "company_wide",
    },
    {
      title: "Financial Health Review",
      description: `Monitor the financial health of this company.
Investigate: What is the current runway? Are there cost optimization opportunities? Are billing/pricing assumptions holding?
Read wiki pages about financial strategy, pricing model, cost structure.
Check financial signals and accounting data for anomalies.
Propose initiatives for cost reductions, pricing adjustments, or financial process improvements.`,
      cronExpression: "0 7 * * 1",
      scope: "company_wide",
    },
    {
      title: "Legal & Compliance Watch",
      description: `Monitor legal and regulatory compliance for this company.
Investigate: What legal steps are pending (incorporation, contracts, IP)? Are there regulatory changes affecting us?
Read wiki pages about legal status, compliance requirements, data protection.
Search the web for regulatory updates (EU AI Act, GDPR changes, Danish business law).
Propose initiatives for legal actions, compliance updates, or contract needs.`,
      cronExpression: "0 8 * * 3",
      scope: "company_wide",
    },
    {
      title: "Product & Engineering Health",
      description: `Monitor the product and engineering health of this company.
Investigate: Are there architectural decisions that need revisiting? Bug patterns? Performance concerns? Feature gaps?
Read wiki pages about product strategy, technical architecture, known issues.
Check activity signals for development patterns.
Propose initiatives for technical improvements, feature development, or architecture changes.`,
      cronExpression: "0 9 * * 2,4",
      scope: "company_wide",
    },
    {
      title: "Strategic Planning Review",
      description: `Conduct a strategic review of the company's overall direction.
Investigate: Are we executing on our strategy? What are the biggest risks and opportunities?
Read ALL wiki pages to build a comprehensive picture.
Search the web for market developments, funding landscape, potential partners.
Compare stated strategy against actual execution signals.
Propose initiatives for strategic pivots, partnership opportunities, or priority changes.
This job should have a higher bar — only propose when something genuinely warrants strategic attention.`,
      cronExpression: "0 7 * * 5",
      scope: "company_wide",
      importanceThreshold: 0.5,
    },
  ];

  let created = 0;
  const { CronExpressionParser } = await import("cron-parser");

  for (const job of defaults) {
    const existing = await prisma.systemJob.findFirst({
      where: { operatorId, title: job.title },
    });
    if (existing) continue;

    const interval = CronExpressionParser.parse(job.cronExpression);
    const nextTrigger = interval.next().toDate();

    await prisma.systemJob.create({
      data: {
        operatorId,
        aiEntityId: hqAi.id,
        title: job.title,
        description: job.description,
        cronExpression: job.cronExpression,
        scope: job.scope,
        status: "active",
        importanceThreshold: job.importanceThreshold ?? 0.3,
        nextTriggerAt: nextTrigger,
        source: "onboarding",
      },
    });
    created++;
  }

  return created;
}
