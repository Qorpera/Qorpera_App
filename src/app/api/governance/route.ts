import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const operatorId = await getOperatorId();
  const config = await prisma.governanceConfig.findUnique({ where: { operatorId } });
  return NextResponse.json(config ?? {
    autoApproveReadActions: true,
    maxPendingProposals: 50,
    approvalExpiryHours: 72,
  });
}

export async function PUT(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();
  const config = await prisma.governanceConfig.upsert({
    where: { operatorId },
    create: {
      operatorId,
      requireApprovalAboveAmount: body.requireApprovalAboveAmount ?? null,
      autoApproveReadActions: body.autoApproveReadActions ?? true,
      maxPendingProposals: body.maxPendingProposals ?? 50,
      approvalExpiryHours: body.approvalExpiryHours ?? 72,
    },
    update: {
      ...(body.requireApprovalAboveAmount !== undefined && { requireApprovalAboveAmount: body.requireApprovalAboveAmount }),
      ...(body.autoApproveReadActions !== undefined && { autoApproveReadActions: body.autoApproveReadActions }),
      ...(body.maxPendingProposals !== undefined && { maxPendingProposals: body.maxPendingProposals }),
      ...(body.approvalExpiryHours !== undefined && { approvalExpiryHours: body.approvalExpiryHours }),
    },
  });
  return NextResponse.json(config);
}
