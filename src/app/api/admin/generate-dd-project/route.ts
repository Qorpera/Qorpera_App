import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { syntheticDDSeedProjectData, generateDDBatch } from "@/lib/demo/synthetic-dd-generator";
import type { TargetCompanyProfile } from "@/lib/demo/synthetic-dd-generator";

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session?.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    count,
    seed,
    targetProfile,
    operatorId: targetOperatorId,
  } = body as {
    count?: number;
    seed?: number;
    targetProfile?: Partial<TargetCompanyProfile>;
    operatorId?: string;
  };

  const operatorId = targetOperatorId ?? session.operatorId;

  try {
    if (count && count > 1) {
      const results = await generateDDBatch(operatorId, Math.min(count, 20), { seedStart: seed });
      return NextResponse.json({
        success: true,
        count: results.length,
        projects: results.map((r) => ({
          projectId: r.projectId,
          name: r.targetProfile.name,
          industry: r.targetProfile.industry,
          riskProfile: r.targetProfile.riskProfile,
        })),
      });
    }

    const result = await syntheticDDSeedProjectData(operatorId, {
      seed,
      targetCompanyProfile: targetProfile,
    });

    return NextResponse.json({
      success: true,
      projectId: result.projectId,
      targetProfile: result.targetProfile,
    });
  } catch (error) {
    console.error("[generate-dd-project] Failed:", error);
    return NextResponse.json(
      { error: "Failed to generate DD project", details: String(error) },
      { status: 500 },
    );
  }
}
