import { prisma } from "./db";

// QorperaAPP is single-operator. Auto-create or fetch the local operator.
let cachedOperatorId: string | null = null;

export async function getOperatorId(): Promise<string> {
  if (cachedOperatorId) return cachedOperatorId;

  const existing = await prisma.operator.findFirst();
  if (existing) {
    cachedOperatorId = existing.id;
    return existing.id;
  }

  const op = await prisma.operator.create({
    data: { displayName: "Operator" },
  });
  cachedOperatorId = op.id;
  return op.id;
}

export async function getOperator() {
  const id = await getOperatorId();
  return prisma.operator.findUniqueOrThrow({ where: { id } });
}
