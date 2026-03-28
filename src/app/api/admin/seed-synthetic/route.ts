import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runSyntheticSeed, cleanupSyntheticCompany } from "@/lib/demo/synthetic-seed-runner";

// Dynamic imports for company data packages (added in future prompts)
const COMPANY_LOADERS: Record<string, () => Promise<{ default: import("@/lib/demo/synthetic-types").SyntheticCompany }>> = {
  boltly: () => import("@/lib/demo/companies/boltly"),
  // tallyo: () => import("@/lib/demo/companies/tallyo"),
  // meridian: () => import("@/lib/demo/companies/meridian-teknik"),
};

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { company: companySlug, action } = await req.json().catch(() => ({ company: null, action: null }));

  if (!companySlug || typeof companySlug !== "string") {
    return NextResponse.json({ error: "company slug is required" }, { status: 400 });
  }

  // Delete action
  if (action === "delete") {
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
    // Clean up existing instance of this company
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
  const statuses: Record<string, { seeded: boolean; operatorId?: string; phase?: string; analysisStatus?: string }> = {};

  for (const slug of available) {
    const existing = await prisma.operator.findFirst({
      where: { isTestOperator: true, companyName: { contains: slug, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      const analysis = await prisma.onboardingAnalysis.findUnique({
        where: { operatorId: existing.id },
        select: { status: true, currentPhase: true },
      });
      const orientation = await prisma.orientationSession.findFirst({
        where: { operatorId: existing.id },
        select: { phase: true },
      });
      statuses[slug] = {
        seeded: true,
        operatorId: existing.id,
        phase: orientation?.phase ?? "unknown",
        analysisStatus: analysis?.status ?? "unknown",
      };
    } else {
      statuses[slug] = { seeded: false };
    }
  }

  return NextResponse.json({ companies: statuses });
}
