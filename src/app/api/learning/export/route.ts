import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { daysParam, parseQuery } from "@/lib/api-validation";

// TODO: Apply situationScopeFilter when multi-user access is enabled

export async function GET(req: NextRequest) {
  const operatorId = await getOperatorId();
  const exportSchema = z.object({ days: daysParam, format: z.enum(["csv"]).default("csv") });
  const parsed = parseQuery(exportSchema, req.nextUrl.searchParams);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { days } = parsed.data;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Load situations with related data
  const situations = await prisma.situation.findMany({
    where: { operatorId, createdAt: { gte: since } },
    include: {
      situationType: {
        select: {
          name: true,
          scopeEntityId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Resolve trigger entity display names
  const entityIds = [
    ...new Set(
      situations
        .map((s) => s.triggerEntityId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const entities = entityIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const entityNameMap = new Map(entities.map((e) => [e.id, e.displayName]));

  // Resolve department names
  const scopeIds = [
    ...new Set(
      situations
        .map((s) => s.situationType.scopeEntityId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const deptEntities = scopeIds.length > 0
    ? await prisma.entity.findMany({
        where: { id: { in: scopeIds } },
        select: { id: true, displayName: true },
      })
    : [];
  const deptNameMap = new Map(deptEntities.map((e) => [e.id, e.displayName]));

  // Build CSV
  const header = "date,situation_type,department,entity,status,outcome,severity,confidence,reasoning_summary,feedback_category,feedback_text";
  const rows = situations.map((s) => {
    const date = s.createdAt.toISOString().slice(0, 10);
    const sitType = csvEscape(s.situationType.name);
    const dept = csvEscape(
      s.situationType.scopeEntityId
        ? deptNameMap.get(s.situationType.scopeEntityId) ?? ""
        : "",
    );
    const entity = csvEscape(
      s.triggerEntityId
        ? entityNameMap.get(s.triggerEntityId) ?? s.triggerEntityId
        : "",
    );
    const status = s.status;
    const outcome = s.outcome ?? "";
    const severity = s.severity.toFixed(2);
    const confidence = s.confidence.toFixed(2);

    let reasoningSummary = "";
    if (s.reasoning) {
      try {
        const parsed = JSON.parse(s.reasoning);
        if (typeof parsed.analysis === "string") {
          reasoningSummary = parsed.analysis.slice(0, 200);
        }
      } catch {
        // ignore parse errors
      }
    }

    const feedbackCategory = s.feedbackCategory ?? "";
    const feedbackText = csvEscape(s.feedback ?? "");

    return `${date},${sitType},${dept},${entity},${status},${outcome},${severity},${confidence},${csvEscape(reasoningSummary)},${feedbackCategory},${feedbackText}`;
  });

  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="learning-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
