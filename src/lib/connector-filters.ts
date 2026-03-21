/** Filter for non-soft-deleted connectors. Spread into Prisma where clauses. */
export const ACTIVE_CONNECTOR = { deletedAt: null } as const;
