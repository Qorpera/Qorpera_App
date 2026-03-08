import { redirect } from "next/navigation";
import { isFirstRun, getSessionFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function Home() {
  const firstRun = await isFirstRun();
  if (firstRun) redirect("/setup");

  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const orientation = await prisma.orientationSession.findFirst({
    where: { operatorId: session.operatorId },
    orderBy: { createdAt: "desc" },
  });

  // Active = completed onboarding
  if (orientation?.phase === "active") redirect("/map");

  // Orienting = in copilot conversation
  if (orientation?.phase === "orienting") redirect("/copilot");

  // Everything else (including old phases "connecting", "learning", and new phases
  // "mapping", "populating", "connecting", "syncing") = onboarding in progress
  redirect("/onboarding");
}
