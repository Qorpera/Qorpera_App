import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getVisibleDomainSlugs,
  wikiSituationScopeFilter,
  buildWikiSituationDomainClause,
} from "@/lib/domain-scope";
import type { SituationProperties } from "@/lib/situation-wiki-helpers";

export async function GET(req: NextRequest) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, operatorId } = su;
  const visibleDomains = await getVisibleDomainSlugs(operatorId, su.effectiveUserId);

  const params = req.nextUrl.searchParams;
  const statusParam = params.get("status");
  const typeSlug = params.get("typeId");
  const severityMin = params.get("severity_min");
  const severityMax = params.get("severity_max");
  const limit = Math.min(Math.max(parseInt(params.get("limit") ?? "50", 10) || 50, 1), 200);
  const offset = Math.max(parseInt(params.get("offset") ?? "0", 10) || 0, 0);
  const showAll = params.get("showAll");

  // ── Build parameterized WHERE clause ──────────────────────────────────────
  const conditions: string[] = [
    `kp."operatorId" = $1`,
    `kp."pageType" = 'situation_instance'`,
  ];
  const queryParams: unknown[] = [operatorId];
  let paramIdx = 1; // tracks the last used $N

  // Status filter
  if (statusParam) {
    const statuses = statusParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== "detected" && s !== "reasoning");
    if (statuses.length > 0) {
      const placeholders = statuses.map((_, i) => `$${paramIdx + i + 1}`).join(", ");
      conditions.push(`kp.properties->>'status' IN (${placeholders})`);
      queryParams.push(...statuses);
      paramIdx += statuses.length;
    }
  } else {
    conditions.push(`kp.properties->>'status' NOT IN ('closed', 'resolved')`);
  }

  // Domain scoping
  const domainScope = wikiSituationScopeFilter(visibleDomains);
  if (domainScope.needed) {
    const { clause, params: domainParams } = buildWikiSituationDomainClause(
      domainScope.domainSlugs,
      paramIdx,
    );
    conditions.push(clause);
    queryParams.push(...domainParams);
    paramIdx += domainParams.length;
  }

  // Assigned user filter
  if (su.effectiveRole === "member" || showAll === "false") {
    const userRecord = await prisma.user.findUnique({
      where: { id: su.effectiveUserId },
      select: { wikiPageSlug: true },
    });
    if (userRecord?.wikiPageSlug) {
      paramIdx++;
      conditions.push(`kp.properties->>'assigned_to' = $${paramIdx}`);
      queryParams.push(userRecord.wikiPageSlug);
    }
  }

  // Severity filter
  if (severityMin) {
    const v = parseFloat(severityMin);
    if (isFinite(v)) {
      paramIdx++;
      conditions.push(`(kp.properties->>'severity')::float >= $${paramIdx}`);
      queryParams.push(v);
    }
  }
  if (severityMax) {
    const v = parseFloat(severityMax);
    if (isFinite(v)) {
      paramIdx++;
      conditions.push(`(kp.properties->>'severity')::float <= $${paramIdx}`);
      queryParams.push(v);
    }
  }

  // Situation type filter (slug)
  if (typeSlug) {
    paramIdx++;
    conditions.push(`kp.properties->>'situation_type' = $${paramIdx}`);
    queryParams.push(typeSlug);
  }

  const whereClause = conditions.join("\n  AND ");

  // ── Execute list + count in parallel ──────────────────────────────────────
  const listSQL = `
SELECT kp.id, kp.slug, kp.title, kp.properties, kp."crossReferences", kp."createdAt"
FROM "KnowledgePage" kp
WHERE ${whereClause}
ORDER BY (kp.properties->>'severity')::float DESC NULLS LAST, kp."createdAt" DESC
LIMIT $${paramIdx + 1} OFFSET $${paramIdx + 2}`;

  const countSQL = `
SELECT COUNT(*) as count
FROM "KnowledgePage" kp
WHERE ${whereClause}`;

  const listParams = [...queryParams, limit, offset];

  type WikiRow = {
    id: string;
    slug: string;
    title: string;
    properties: SituationProperties | null;
    crossReferences: string[];
    createdAt: Date;
  };

  const [rows, countResult] = await Promise.all([
    prisma.$queryRawUnsafe<WikiRow[]>(listSQL, ...listParams),
    prisma.$queryRawUnsafe<[{ count: bigint }]>(countSQL, ...queryParams),
  ]);

  const total = Number(countResult[0]?.count ?? 0);

  // ── Resolve display names ─────────────────────────────────────────────────
  const domainSlugs = new Set<string>();
  for (const row of rows) {
    if (row.properties?.domain) {
      domainSlugs.add(row.properties.domain);
    }
  }

  const situationIds = rows
    .map((r) => r.properties?.situation_id)
    .filter(Boolean) as string[];
  const typeSlugs = [
    ...new Set(
      rows.map((r) => r.properties?.situation_type).filter(Boolean) as string[],
    ),
  ];

  const [domainPages, types, views] = await Promise.all([
    domainSlugs.size > 0
      ? prisma.knowledgePage.findMany({
          where: { operatorId, slug: { in: [...domainSlugs] }, scope: "operator" },
          select: { slug: true, title: true },
        })
      : Promise.resolve([]),
    typeSlugs.length > 0
      ? prisma.situationType.findMany({
          where: { operatorId, slug: { in: typeSlugs } },
          select: { slug: true, name: true, autonomyLevel: true },
        })
      : Promise.resolve([]),
    // SituationView table dropped — no view tracking
    Promise.resolve([] as Array<{ situationId: string; viewedAt: Date }>),
  ]);

  const domainMap = new Map(domainPages.map((p) => [p.slug, p.title]));
  const typeMap = new Map(types.map((t) => [t.slug, t]));
  const viewMap = new Map(views.map((v) => [v.situationId, v.viewedAt]));

  // ── Build response items ──────────────────────────────────────────────────
  const items = rows.map((row) => {
    const props = row.properties;
    if (!props) return null;

    const typeInfo = props.situation_type ? typeMap.get(props.situation_type) : undefined;

    return {
      id: row.id,
      slug: row.slug,
      status: props.status,
      severity: props.severity,
      confidence: props.confidence,
      situationType: typeInfo
        ? { slug: typeInfo.slug, name: typeInfo.name, autonomyLevel: typeInfo.autonomyLevel }
        : props.situation_type
          ? { slug: props.situation_type, name: props.situation_type, autonomyLevel: null }
          : null,
      source: props.source,
      triggerSummary: row.title,
      triggerPageSlug: findTriggerSlug(row.crossReferences, props.domain),
      domainName: props.domain ? domainMap.get(props.domain) ?? null : null,
      domainPageSlug: props.domain ?? null,
      assignedTo: props.assigned_to ?? null,
      autonomyLevel: props.autonomy_level ?? null,
      createdAt: props.detected_at ?? row.createdAt.toISOString(),
      resolvedAt: props.resolved_at ?? null,
      viewedAt: viewMap.get(props.situation_id)?.toISOString() ?? null,
      _wikiFirst: true,
    };
  }).filter(Boolean);

  return NextResponse.json({ items, total, limit, offset });
}

/** Pick the first cross-reference that isn't the domain slug itself. */
function findTriggerSlug(
  crossReferences: string[] | null,
  domainSlug: string | undefined,
): string | null {
  if (!crossReferences || crossReferences.length === 0) return null;
  for (const ref of crossReferences) {
    if (ref !== domainSlug) return ref;
  }
  return null;
}
