import { computePriorityScores } from "@/lib/prioritization-engine";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const operators = await prisma.operator.findMany({ select: { id: true } });
  const results = await Promise.all(
    operators.map((op) =>
      computePriorityScores(op.id).catch((err) => ({
        error: err.message,
        operatorId: op.id,
      })),
    ),
  );

  return Response.json({ operators: results });
}
