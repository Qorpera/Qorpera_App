import { runScheduledInitiativeEvaluation } from "@/lib/initiative-reasoning";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runScheduledInitiativeEvaluation();
  return Response.json(result);
}
