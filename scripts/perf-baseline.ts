import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function header(title: string) {
  console.log(`\n--- ${title} ---`);
}

function table(headers: string[], rows: string[][]) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] || "").length))
  );
  const sep = widths.map((w) => "-".repeat(w + 2)).join("|");
  const fmt = (row: string[]) =>
    row.map((c, i) => ` ${(c || "").padEnd(widths[i])} `).join("|");
  console.log(`|${fmt(headers)}|`);
  console.log(`|${sep}|`);
  for (const row of rows) {
    console.log(`|${fmt(row)}|`);
  }
}

async function main() {
  console.log("=== Qorpera v0.2.0 Performance Baseline ===");
  console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);

  // Find all operators
  const operators = await prisma.operator.findMany({
    select: { id: true, displayName: true },
  });

  if (operators.length === 0) {
    console.log("\nNo operators found.");
    await prisma.$disconnect();
    return;
  }

  const testOperatorId = operators[0].id;

  // 1. pgvector Query Performance
  header("pgvector Query Plan");
  try {
    const zeroVector = `[${new Array(1536).fill(0).join(",")}]`;
    const plan = await prisma.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
      `EXPLAIN ANALYZE
       SELECT id, content, "sourceType", "sourceId", metadata,
              embedding <=> $1::vector AS distance
       FROM "ContentChunk"
       WHERE "operatorId" = $2
       ORDER BY embedding <=> $1::vector
       LIMIT 8`,
      zeroVector,
      testOperatorId
    );
    const planText = plan.map((r) => r["QUERY PLAN"]).join("\n");
    console.log(planText);
    const indexUsed = planText.includes("Index Scan using");
    console.log(`\nIndex used: ${indexUsed ? "YES" : "NO"}`);
    const timeMatch = planText.match(/Execution Time:\s*([\d.]+)\s*ms/);
    if (timeMatch) {
      console.log(`Execution time: ${timeMatch[1]}ms`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`Query failed: ${msg}`);
  }

  // 2. ActivitySignal Query Performance
  header("ActivitySignal Query");
  try {
    const signalPlan = await prisma.$queryRawUnsafe<
      { "QUERY PLAN": string }[]
    >(
      `EXPLAIN ANALYZE
       SELECT * FROM "ActivitySignal"
       WHERE "operatorId" = $1
         AND "occurredAt" > NOW() - INTERVAL '30 days'
       ORDER BY "occurredAt" DESC
       LIMIT 500`,
      testOperatorId
    );
    const signalPlanText = signalPlan.map((r) => r["QUERY PLAN"]).join("\n");
    console.log(signalPlanText);
    const rowMatch = signalPlanText.match(/rows=(\d+)/);
    const timeMatch = signalPlanText.match(/Execution Time:\s*([\d.]+)\s*ms/);
    if (rowMatch) console.log(`\nRows returned: ${rowMatch[1]}`);
    if (timeMatch) console.log(`Execution time: ${timeMatch[1]}ms`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`Query failed: ${msg}`);
  }

  // 3. Data Volume
  header("Data Volume");
  const volRows: string[][] = [];
  for (const op of operators) {
    const [entities, chunks, signals, situations] = await Promise.all([
      prisma.entity.count({
        where: { operatorId: op.id, mergedIntoId: null },
      }),
      prisma.contentChunk.count({ where: { operatorId: op.id } }),
      prisma.activitySignal.count({ where: { operatorId: op.id } }),
      prisma.situation.count({ where: { operatorId: op.id } }),
    ]);
    volRows.push([
      op.displayName || op.id,
      String(entities),
      String(chunks),
      String(signals),
      String(situations),
    ]);
  }
  table(
    ["Operator", "Entities", "Chunks", "Signals", "Situations"],
    volRows
  );

  // 4. Recent Sync Performance
  header("Recent Sync Performance");
  try {
    const syncLogs = await prisma.$queryRaw<
      {
        connectorId: string;
        status: string;
        eventsCreated: number;
        durationMs: number | null;
        createdAt: Date;
        provider: string | null;
      }[]
    >(Prisma.sql`
      SELECT sl."connectorId", sl.status, sl."eventsCreated",
             sl."durationMs", sl."createdAt", sc.provider
      FROM "SyncLog" sl
      LEFT JOIN "SourceConnector" sc ON sc.id = sl."connectorId"
      ORDER BY sl."createdAt" DESC
      LIMIT 10
    `);
    if (syncLogs.length === 0) {
      console.log("No sync logs found.");
    } else {
      table(
        ["Connector", "Provider", "Duration", "Events", "Status"],
        syncLogs.map((s) => [
          s.connectorId.slice(0, 8),
          s.provider || "?",
          s.durationMs != null ? `${s.durationMs}ms` : "n/a",
          String(s.eventsCreated),
          s.status,
        ])
      );
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`Query failed: ${msg}`);
  }

  // 5. Connector Health
  header("Connector Health");
  const connectors = await prisma.sourceConnector.findMany({
    where: { status: { not: "deleted" } },
    select: {
      provider: true,
      lastSyncAt: true,
      consecutiveFailures: true,
      status: true,
    },
    orderBy: { lastSyncAt: { sort: "desc", nulls: "last" } },
  });
  if (connectors.length === 0) {
    console.log("No active connectors found.");
  } else {
    table(
      ["Provider", "Last Sync", "Failures", "Status"],
      connectors.map((c) => [
        c.provider,
        c.lastSyncAt
          ? c.lastSyncAt.toISOString().slice(0, 19).replace("T", " ")
          : "never",
        String(c.consecutiveFailures),
        c.status,
      ])
    );
  }

  console.log("\n=== Baseline complete ===\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Fatal:", e);
  prisma.$disconnect();
  process.exit(1);
});
