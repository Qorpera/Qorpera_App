import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runConnectorSync } from "@/lib/connector-sync";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const operatorId = await getOperatorId();
  const { id } = await params;

  // Verify connector belongs to this operator
  const connector = await prisma.sourceConnector.findFirst({
    where: { id, operatorId },
  });

  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  if (connector.status !== "active") {
    return NextResponse.json(
      { error: `Connector is ${connector.status}, not active` },
      { status: 400 }
    );
  }

  const result = await runConnectorSync(operatorId, id);

  return NextResponse.json(result);
}
