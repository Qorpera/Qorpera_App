import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const operatorId = await getOperatorId();

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
