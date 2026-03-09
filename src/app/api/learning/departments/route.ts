import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

// TODO: Apply situationScopeFilter when multi-user access is enabled

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load all departments (foundational entities with type "department")
  const departments = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "foundational",
      entityType: { slug: "department" },
      status: "active",
    },
    select: { id: true, displayName: true },
  });

  // Load all situation types with scope info
  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId },
    select: {
      id: true,
      name: true,
      autonomyLevel: true,
      scopeEntityId: true,
      totalProposed: true,
      totalApproved: true,
    },
  });

  // Load all situations in the period
  const situations = await prisma.situation.findMany({
    where: { operatorId, createdAt: { gte: since } },
    select: {
      id: true,
      situationTypeId: true,
      status: true,
      outcome: true,
    },
  });

  // Index situations by situation type
  const sitsByType = new Map<string, typeof situations>();
  for (const s of situations) {
    const arr = sitsByType.get(s.situationTypeId) ?? [];
    arr.push(s);
    sitsByType.set(s.situationTypeId, arr);
  }

  // Index situation types by scope entity
  const stByScope = new Map<string | null, typeof situationTypes>();
  for (const st of situationTypes) {
    const key = st.scopeEntityId ?? null;
    const arr = stByScope.get(key) ?? [];
    arr.push(st);
    stByScope.set(key, arr);
  }

  const result: Array<{
    id: string | null;
    name: string;
    situationCount: number;
    approvalRate: number;
    outcomeDistribution: Record<string, number>;
    situationTypes: Array<{
      id: string;
      name: string;
      autonomyLevel: string;
      count: number;
    }>;
  }> = [];

  // Build department entries
  for (const dept of departments) {
    const types = stByScope.get(dept.id) ?? [];
    const deptResult = buildDepartmentEntry(dept.id, dept.displayName, types, sitsByType);
    result.push(deptResult);
  }

  // Unscoped entry
  const unscopedTypes = stByScope.get(null) ?? [];
  if (unscopedTypes.length > 0) {
    const unscopedResult = buildDepartmentEntry(null, "Unscoped", unscopedTypes, sitsByType);
    result.push(unscopedResult);
  }

  return NextResponse.json({ departments: result });
}

function buildDepartmentEntry(
  id: string | null,
  name: string,
  types: Array<{
    id: string;
    name: string;
    autonomyLevel: string;
    totalProposed: number;
    totalApproved: number;
  }>,
  sitsByType: Map<string, Array<{ status: string; outcome: string | null }>>,
) {
  let situationCount = 0;
  const outcomeDistribution: Record<string, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
    unknown: 0,
  };

  const stEntries = types.map((st) => {
    const sitsForType = sitsByType.get(st.id) ?? [];
    situationCount += sitsForType.length;

    for (const s of sitsForType) {
      if (s.status === "resolved") {
        const outcome = s.outcome ?? "unknown";
        if (outcome in outcomeDistribution) {
          outcomeDistribution[outcome]++;
        } else {
          outcomeDistribution.unknown++;
        }
      }
    }

    return {
      id: st.id,
      name: st.name,
      autonomyLevel: st.autonomyLevel ?? "supervised",
      count: sitsForType.length,
    };
  });

  // Approval rate from situation type aggregates
  const sumProposed = types.reduce((a, t) => a + t.totalProposed, 0);
  const sumApproved = types.reduce((a, t) => a + t.totalApproved, 0);
  const approvalRate = sumProposed > 0
    ? Math.round((sumApproved / sumProposed) * 100) / 100
    : 0;

  return {
    id,
    name,
    situationCount,
    approvalRate,
    outcomeDistribution,
    situationTypes: stEntries,
  };
}
