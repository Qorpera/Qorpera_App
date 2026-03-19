import { processFollowUps } from "@/lib/follow-up-scheduler";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await processFollowUps();
  return Response.json(result);
}
