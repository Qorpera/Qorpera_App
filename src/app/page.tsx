import { redirect } from "next/navigation";
import { isFirstRun, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function Home() {
  const firstRun = await isFirstRun();
  if (firstRun) redirect("/setup");

  const su = await getSessionUser();
  if (!su) redirect("/login");

  // Superadmin → admin dashboard
  if (su.isSuperadmin && !su.actingAsOperator) redirect("/admin");

  const orientation = await prisma.orientationSession.findFirst({
    where: { operatorId: su.operatorId },
    orderBy: { createdAt: "desc" },
  });

  if (orientation?.phase === "active") redirect("/map");
  if (orientation?.phase === "orienting") redirect("/copilot");

  redirect("/onboarding");
}
