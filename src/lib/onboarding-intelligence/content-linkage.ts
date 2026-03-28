import { prisma } from "@/lib/db";

/**
 * After onboarding confirms the org structure, existing ContentChunks
 * and ActivitySignals need department/entity IDs that didn't exist at
 * sync time. This backfill resolves email addresses in content metadata
 * to the now-known team members and their departments.
 *
 * This runs once per operator after confirm-structure.
 * Also needed for real customers where connectors sync before onboarding finishes.
 */
export async function backfillContentLinkage(operatorId: string): Promise<{
  chunksUpdated: number;
  signalsUpdated: number;
}> {
  console.log(`[content-linkage] Starting backfill for operator ${operatorId}...`);

  // ── 1. Build email → entity/department lookup ────────────────────
  // Find all team-member entities with email properties and department assignments
  const teamMembers = await prisma.entity.findMany({
    where: {
      operatorId,
      entityType: { slug: "team-member" },
      status: "active",
      parentDepartmentId: { not: null },
    },
    include: {
      propertyValues: {
        include: { property: true },
      },
    },
  });

  const emailToDept: Record<string, string> = {};
  const emailToEntityId: Record<string, string> = {};

  for (const member of teamMembers) {
    const emailPv = member.propertyValues.find(
      (pv) => pv.property.identityRole === "email" || pv.property.slug === "email",
    );
    if (emailPv && member.parentDepartmentId) {
      const email = emailPv.value.toLowerCase();
      emailToDept[email] = member.parentDepartmentId;
      emailToEntityId[email] = member.id;
    }
  }

  if (Object.keys(emailToDept).length === 0) {
    console.log("[content-linkage] No team members with departments found — skipping backfill");
    return { chunksUpdated: 0, signalsUpdated: 0 };
  }

  console.log(`[content-linkage] Found ${Object.keys(emailToDept).length} team members with departments`);

  // ── 2. Backfill ContentChunk departmentIds ───────────────────────
  // Find chunks without department IDs that have email metadata
  const chunks = await prisma.contentChunk.findMany({
    where: {
      operatorId,
      OR: [
        { departmentIds: null },
        { departmentIds: "null" },
        { departmentIds: "[]" },
      ],
    },
    select: { id: true, metadata: true },
  });

  let chunksUpdated = 0;
  for (const chunk of chunks) {
    const deptIds = new Set<string>();

    if (chunk.metadata) {
      let meta: Record<string, unknown>;
      try {
        meta = typeof chunk.metadata === "string" ? JSON.parse(chunk.metadata) : chunk.metadata as Record<string, unknown>;
      } catch {
        continue;
      }

      // Extract all email addresses from metadata
      const emails = extractEmailsFromMetadata(meta);
      for (const email of emails) {
        const deptId = emailToDept[email.toLowerCase()];
        if (deptId) deptIds.add(deptId);
      }
    }

    if (deptIds.size > 0) {
      await prisma.contentChunk.update({
        where: { id: chunk.id },
        data: { departmentIds: JSON.stringify([...deptIds]) },
      });
      chunksUpdated++;
    }
  }

  console.log(`[content-linkage] Updated ${chunksUpdated}/${chunks.length} content chunks with department IDs`);

  // ── 3. Backfill ActivitySignal actorEntityId + departmentIds ─────
  const signals = await prisma.activitySignal.findMany({
    where: {
      operatorId,
      OR: [
        { actorEntityId: null },
        { departmentIds: null },
      ],
    },
    select: { id: true, metadata: true, actorEntityId: true, departmentIds: true },
  });

  let signalsUpdated = 0;
  for (const signal of signals) {
    const updates: Record<string, unknown> = {};

    if (signal.metadata) {
      let meta: Record<string, unknown>;
      try {
        meta = typeof signal.metadata === "string" ? JSON.parse(signal.metadata) : signal.metadata as Record<string, unknown>;
      } catch {
        continue;
      }

      // Try to resolve actor from metadata
      if (!signal.actorEntityId) {
        const actorEmail = extractActorEmail(meta);
        if (actorEmail) {
          const entityId = emailToEntityId[actorEmail.toLowerCase()];
          if (entityId) updates.actorEntityId = entityId;
        }
      }

      // Resolve department IDs from all participants
      if (!signal.departmentIds) {
        const emails = extractEmailsFromMetadata(meta);
        const deptIds = new Set<string>();
        for (const email of emails) {
          const deptId = emailToDept[email.toLowerCase()];
          if (deptId) deptIds.add(deptId);
        }
        if (deptIds.size > 0) updates.departmentIds = JSON.stringify([...deptIds]);
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.activitySignal.update({
        where: { id: signal.id },
        data: updates,
      });
      signalsUpdated++;
    }
  }

  console.log(`[content-linkage] Updated ${signalsUpdated}/${signals.length} activity signals`);

  return { chunksUpdated, signalsUpdated };
}

// ── Helpers ─────────────────────────────────────────────────────────

function extractEmailsFromMetadata(meta: Record<string, unknown>): string[] {
  const emails: string[] = [];

  // Common metadata fields that contain email addresses
  const emailFields = ["from", "to", "cc", "bcc", "sender", "authorEmail", "author"];
  for (const field of emailFields) {
    const val = meta[field];
    if (typeof val === "string") {
      // Handle comma-separated email lists (common in CC/BCC fields)
      const parts = val.split(",").map(s => s.trim());
      for (const part of parts) {
        if (part.includes("@")) emails.push(part);
      }
    }
    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "string") {
          const parts = v.split(",").map(s => s.trim());
          for (const part of parts) {
            if (part.includes("@")) emails.push(part);
          }
        }
      }
    }
  }

  // Calendar attendees
  if (Array.isArray(meta.attendees)) {
    for (const a of meta.attendees) {
      if (typeof a === "string" && a.includes("@")) emails.push(a);
    }
  }

  return [...new Set(emails)];
}

function extractActorEmail(meta: Record<string, unknown>): string | null {
  // For email signals, the actor is the sender
  if (typeof meta.from === "string" && meta.from.includes("@")) return meta.from;
  if (typeof meta.sender === "string" && meta.sender.includes("@")) return meta.sender;
  if (typeof meta.authorEmail === "string" && meta.authorEmail.includes("@")) return meta.authorEmail;
  // For meetings, the organizer
  if (Array.isArray(meta.attendees) && meta.attendees.length > 0) {
    const first = meta.attendees[0];
    if (typeof first === "string" && first.includes("@")) return first;
  }
  return null;
}
