import { redirect } from "next/navigation";
import { isFirstRun, getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function Home() {
  const firstRun = await isFirstRun();
  if (firstRun) redirect("/setup");

  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  // Check orientation state
  const orientation = await prisma.orientationSession.findFirst({
    where: { operatorId: session.operatorId },
    orderBy: { createdAt: "desc" },
  });

  if (!orientation || orientation.phase === "connecting" || orientation.phase === "learning") {
    redirect("/onboarding");
  }

  if (orientation.phase === "orienting") {
    redirect("/copilot");
  }

  // phase === "active" (completed) → normal app
  redirect("/dashboard");
}
