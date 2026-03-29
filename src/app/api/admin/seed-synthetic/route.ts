import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runSyntheticSeed, cleanupSyntheticCompany } from "@/lib/demo/synthetic-seed-runner";

// Dynamic imports for company data packages (added in future prompts)
const COMPANY_LOADERS: Record<string, () => Promise<{ default: import("@/lib/demo/synthetic-types").SyntheticCompany }>> = {
  boltly: () => import("@/lib/demo/companies/boltly"),
  tallyo: () => import("@/lib/demo/companies/tallyo"),
  "meridian-teknik": () => import("@/lib/demo/companies/meridian-teknik"),
};

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { company: companySlug, action, operatorId: targetOperatorId } = await req.json().catch(() => ({ company: null, action: null, operatorId: null }));

  // ── seed-all action — seeds all companies sequentially ──────────
  if (action === "seed-all") {
    const results = [];
    for (const [slug, loader] of Object.entries(COMPANY_LOADERS)) {
      try {
        const existing = await prisma.operator.findFirst({
          where: { isTestOperator: true, companyName: { contains: slug, mode: "insensitive" } },
        });
        if (existing) await cleanupSyntheticCompany(existing.id);

        const { default: companyData } = await loader();
        const result = await runSyntheticSeed(companyData);
        results.push({ slug, success: true, operatorId: result.operatorId, stats: result.stats });
      } catch (error) {
        console.error(`[synthetic-seed] Failed to seed ${slug}:`, error);
        results.push({ slug, success: false, error: String(error) });
      }
    }
    return NextResponse.json({ results });
  }

  if (!companySlug || typeof companySlug !== "string") {
    return NextResponse.json({ error: "company slug is required" }, { status: 400 });
  }

  // Delete action
  if (action === "delete") {
    if (targetOperatorId) {
      // Direct delete by operatorId — verify it's a test operator
      const target = await prisma.operator.findUnique({ where: { id: targetOperatorId }, select: { isTestOperator: true } });
      if (!target?.isTestOperator) return NextResponse.json({ error: "Not a test operator" }, { status: 403 });
      await cleanupSyntheticCompany(targetOperatorId);
      return NextResponse.json({ success: true, deleted: companySlug });
    }
    // Fallback to name search
    const existing = await prisma.operator.findFirst({
      where: { isTestOperator: true, companyName: { contains: companySlug, mode: "insensitive" } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    await cleanupSyntheticCompany(existing.id);
    return NextResponse.json({ success: true, deleted: companySlug });
  }

  // Seed action
  const loader = COMPANY_LOADERS[companySlug];
  if (!loader) {
    return NextResponse.json({
      error: `Unknown company: ${companySlug}. Available: ${Object.keys(COMPANY_LOADERS).join(", ")}`,
    }, { status: 400 });
  }

  try {
    // Clean up existing seeded operator for this company
    const existing = await prisma.operator.findFirst({
      where: { isTestOperator: true, companyName: { contains: companySlug, mode: "insensitive" } },
    });
    if (existing) {
      console.log(`[synthetic-seed] Removing existing ${companySlug} operator...`);
      await cleanupSyntheticCompany(existing.id);
    }

    const { default: companyData } = await loader();
    const result = await runSyntheticSeed(companyData);

    return NextResponse.json({
      success: true,
      company: companySlug,
      operatorId: result.operatorId,
      analysisId: result.analysisId,
      credentials: result.userCredentials,
      stats: result.stats,
      message: `${companyData.name} seeded. Onboarding analysis queued — worker will start within 5 seconds.`,
    });
  } catch (error) {
    console.error(`[synthetic-seed] Failed to seed ${companySlug}:`, error);
    return NextResponse.json(
      { error: `Failed to seed ${companySlug}`, details: String(error) },
      { status: 500 },
    );
  }
}

export async function GET() {
  const session = await getSessionUser();
  if (!session?.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Return available companies and their current seed status
  const available = Object.keys(COMPANY_LOADERS);
  const statuses: Record<string, { seeded: boolean; variants: Array<{ operatorId: string; displayName: string; phase: string; analysisStatus: string }> }> = {};

  for (const slug of available) {
    const matchingOps = await prisma.operator.findMany({
      where: { isTestOperator: true, companyName: { contains: slug, mode: "insensitive" } },
      select: { id: true, companyName: true },
    });

    if (matchingOps.length === 0) {
      statuses[slug] = { seeded: false, variants: [] };
    } else {
      const variants = [];
      for (const op of matchingOps) {
        const [analysis, orientation, contentCount, activityCount, entityCount] = await Promise.all([
          prisma.onboardingAnalysis.findUnique({
            where: { operatorId: op.id },
            select: { status: true, currentPhase: true },
          }),
          prisma.orientationSession.findFirst({
            where: { operatorId: op.id },
            select: { phase: true },
          }),
          prisma.contentChunk.count({ where: { operatorId: op.id } }),
          prisma.activitySignal.count({ where: { operatorId: op.id } }),
          prisma.entity.count({ where: { operatorId: op.id, status: "active" } }),
        ]);
        variants.push({
          operatorId: op.id,
          displayName: op.companyName ?? slug,
          phase: orientation?.phase ?? "unknown",
          analysisStatus: analysis?.status ?? "unknown",
          contentChunks: contentCount,
          activitySignals: activityCount,
          entities: entityCount,
        });
      }
      statuses[slug] = { seeded: true, variants };
    }
  }

  return NextResponse.json({ companies: statuses });
}
