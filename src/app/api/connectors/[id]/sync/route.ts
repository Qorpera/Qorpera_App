import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runConnectorSync } from "@/lib/connector-sync";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (su.user.role === "member") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { operatorId } = su;
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
