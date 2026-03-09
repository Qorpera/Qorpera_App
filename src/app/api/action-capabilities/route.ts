import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { operatorId } = su;

  const capabilities = await prisma.actionCapability.findMany({
    where: { operatorId, enabled: true },
    include: { connector: { select: { provider: true, name: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    capabilities.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      connectorProvider: c.connector?.provider ?? null,
      connectorName: c.connector?.name ?? null,
    })),
  );
}
