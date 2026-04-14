import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { daysParam, parseQuery } from "@/lib/api-validation";
import { getVisibleDomainIds, getVisibleDomainSlugs } from "@/lib/domain-scope";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const visibleDomains = await getVisibleDomainIds(operatorId, user.id);
  const daysSchema = z.object({ days: daysParam });
  const parsed = parseQuery(daysSchema, req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load departments from wiki domain_hub pages
  const visibleDomainSlugs = await getVisibleDomainSlugs(operatorId, user.id);
  const domainHubs = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      pageType: "domain_hub",
      ...(visibleDomainSlugs !== "all" ? { slug: { in: visibleDomainSlugs } } : {}),
    },
    select: { slug: true, title: true },
  });

  // Map wiki slugs to entity IDs for scope matching (situation types still use scopeEntityId)
  // Also keep entity-based departments for backward compat with situation type scoping
  const departments = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "foundational",
      entityType: { slug: "domain" },
      status: "active",
      ...(visibleDomains !== "all" ? { id: { in: visibleDomains } } : {}),
    },
    select: { id: true, displayName: true },
  });
  // Prefer wiki page titles for display names
  const hubNameMap = new Map(domainHubs.map(h => [h.title.toLowerCase(), h.title]));
  for (const dept of departments) {
    const hubTitle = hubNameMap.get(dept.displayName.toLowerCase());
    if (hubTitle) dept.displayName = hubTitle;
  }

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

  // Load situation instances from KnowledgePage
  const sitPages = await prisma.knowledgePage.findMany({
    where: { operatorId, pageType: "situation_instance", scope: "operator", createdAt: { gte: since } },
    select: { properties: true },
  });

  // Map to a compatible shape and apply domain visibility
  const situations = sitPages
    .map((p) => {
      const props = p.properties as Record<string, unknown> | null;
      return {
        id: (props?.situation_id as string) ?? "",
        situationTypeId: (props?.situation_type_id as string) ?? "",
        status: (props?.status as string) ?? "detected",
        outcome: (props?.outcome as string) ?? null,
      };
    })
    .filter((s) => {
      if (visibleDomains === "all") return true;
      // situation type scoping is handled below via stByScope
      return true;
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

  return NextResponse.json({ domains: result });
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
