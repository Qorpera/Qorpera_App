import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import archiver from "archiver";
import { PassThrough } from "stream";

const MAX_ROWS = 50_000;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: targetOperatorId } = await params;

  // Admin of the target operator or superadmin
  if (!su.isSuperadmin && (su.user.role !== "admin" || su.operatorId !== targetOperatorId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const operator = await prisma.operator.findUnique({ where: { id: targetOperatorId } });
  if (!operator) {
    return NextResponse.json({ error: "Operator not found" }, { status: 404 });
  }

  // Size check
  const counts = await Promise.all([
    prisma.user.count({ where: { operatorId: targetOperatorId } }),
    prisma.entity.count({ where: { operatorId: targetOperatorId } }),
    prisma.knowledgePage.count({ where: { operatorId: targetOperatorId, pageType: "situation_instance" } }),
    prisma.operationalInsight.count({ where: { operatorId: targetOperatorId } }),
    prisma.appSetting.count({ where: { operatorId: targetOperatorId } }),
    prisma.sourceConnector.count({ where: { operatorId: targetOperatorId } }),
  ]);
  const totalRows = counts.reduce((a, b) => a + b, 1);

  if (totalRows > MAX_ROWS) {
    return NextResponse.json(
      { error: "Export too large for immediate download. Contact support." },
      { status: 413 },
    );
  }

  // Gather data
  const [users, entities, situations, insights, settings, connectors] = await Promise.all([
    prisma.user.findMany({
      where: { operatorId: targetOperatorId, role: { not: "superadmin" } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        // Exclude passwordHash
      },
    }),
    prisma.entity.findMany({
      where: { operatorId: targetOperatorId },
      select: {
        id: true,
        displayName: true,
        category: true,
        sourceSystem: true,
        status: true,
        createdAt: true,
        entityType: { select: { name: true, slug: true } },
        propertyValues: { select: { property: { select: { name: true } }, value: true } },
      },
    }),
    prisma.knowledgePage.findMany({
      where: { operatorId: targetOperatorId, pageType: "situation_instance", scope: "operator" },
      select: {
        id: true,
        slug: true,
        title: true,
        properties: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.operationalInsight.findMany({
      where: { operatorId: targetOperatorId },
      select: {
        insightType: true,
        description: true,
        evidence: true,
        confidence: true,
        shareScope: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.appSetting.findMany({
      where: { operatorId: targetOperatorId },
      select: { key: true, value: true },
    }),
    prisma.sourceConnector.findMany({
      where: { operatorId: targetOperatorId, deletedAt: null },
      select: {
        id: true,
        provider: true,
        name: true,
        status: true,
        healthStatus: true,
        createdAt: true,
        config: true,
      },
    }),
  ]);

  // Redact OAuth tokens in connector configs
  const redactedConnectors = connectors.map((c) => ({
    ...c,
    config: "[REDACTED]",
  }));

  // Operator record (exclude passwordHash)
  const operatorData = {
    id: operator.id,
    displayName: operator.displayName,
    email: operator.email,
    companyName: operator.companyName,
    industry: operator.industry,
    createdAt: operator.createdAt,
    billingStatus: operator.billingStatus,
  };

  // Create ZIP
  const passThrough = new PassThrough();
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(passThrough);

  archive.append(JSON.stringify(operatorData, null, 2), { name: "operator.json" });
  archive.append(JSON.stringify(users, null, 2), { name: "users.json" });
  archive.append(JSON.stringify(entities, null, 2), { name: "entities.json" });
  archive.append(JSON.stringify(situations, null, 2), { name: "situations.json" });
  archive.append(JSON.stringify(insights, null, 2), { name: "insights.json" });
  archive.append(JSON.stringify(settings, null, 2), { name: "settings.json" });
  archive.append(JSON.stringify(redactedConnectors, null, 2), { name: "connectors.json" });

  archive.finalize();

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `qorpera-export-${targetOperatorId}-${dateStr}.zip`;

  const readable = new ReadableStream({
    start(controller) {
      passThrough.on("data", (chunk) => controller.enqueue(chunk));
      passThrough.on("end", () => controller.close());
      passThrough.on("error", (err) => controller.error(err));
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
