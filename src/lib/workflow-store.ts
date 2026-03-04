import { prisma } from "@/lib/db";

export async function listWorkflows(operatorId: string) {
  return prisma.workflow.findMany({
    where: { operatorId },
    include: { _count: { select: { runs: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWorkflow(operatorId: string, id: string) {
  return prisma.workflow.findFirst({
    where: { id, operatorId },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 10 } },
  });
}

export async function createWorkflow(
  operatorId: string,
  input: { name: string; description?: string; triggerType?: string; graph?: unknown },
) {
  return prisma.workflow.create({
    data: {
      operatorId,
      name: input.name,
      description: input.description ?? "",
      triggerType: input.triggerType ?? "manual",
      graph: input.graph ? JSON.stringify(input.graph) : null,
    },
  });
}

export async function updateWorkflow(
  operatorId: string,
  id: string,
  fields: Partial<{ name: string; description: string; status: string; graph: unknown }>,
) {
  const existing = await prisma.workflow.findFirst({ where: { id, operatorId } });
  if (!existing) return null;
  return prisma.workflow.update({
    where: { id },
    data: {
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.description !== undefined && { description: fields.description }),
      ...(fields.status !== undefined && { status: fields.status }),
      ...(fields.graph !== undefined && { graph: JSON.stringify(fields.graph) }),
    },
  });
}

export async function deleteWorkflow(operatorId: string, id: string) {
  const existing = await prisma.workflow.findFirst({ where: { id, operatorId } });
  if (!existing) return false;
  await prisma.workflow.delete({ where: { id } });
  return true;
}

export async function createWorkflowRun(workflowId: string) {
  return prisma.workflowRun.create({
    data: { workflowId },
  });
}

export async function completeWorkflowRun(
  runId: string,
  status: "completed" | "failed",
  result?: unknown,
) {
  return prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status,
      completedAt: new Date(),
      result: result ? JSON.stringify(result) : null,
    },
  });
}
