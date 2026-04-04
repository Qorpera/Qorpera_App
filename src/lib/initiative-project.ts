// ── Initiative → Project ────────────────────────────────────────────────
// Creates a Project with members and deliverables from an approved
// Initiative's proposedProjectConfig, then queues AI generation.

import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

// ── Types ───────────────────────────────────────────────────────────────

interface ProjectConfig {
  title: string;
  description: string;
  coordinatorEmail: string;
  dueDate: string | null;
  members: Array<{
    email: string;
    name: string;
    role: string;
  }>;
  deliverables: Array<{
    title: string;
    description: string;
    assignedToEmail: string;
    format: string;
    suggestedDeadline: string | null;
  }>;
  sourceSignal?: {
    sourceType: string;
    sourceId: string;
    sender: string;
    subject: string | null;
    date: string;
    summary: string;
  };
}

// ── Main Function ───────────────────────────────────────────────────────

/**
 * Creates a Project from an approved Initiative's proposedProjectConfig.
 * Called when an initiative with proposedProjectConfig is approved.
 */
export async function createProjectFromInitiative(
  initiativeId: string,
  userId: string,
  configOverrides?: Partial<ProjectConfig>,
): Promise<string> {
  const initiative = await prisma.initiative.findUnique({
    where: { id: initiativeId },
    select: {
      id: true,
      operatorId: true,
      proposedProjectConfig: true,
      status: true,
    },
  });

  if (!initiative) throw new Error(`Initiative ${initiativeId} not found`);
  if (!initiative.proposedProjectConfig) {
    throw new Error(`Initiative ${initiativeId} has no proposedProjectConfig`);
  }

  const baseConfig = initiative.proposedProjectConfig as unknown as ProjectConfig;
  const config: ProjectConfig = {
    ...baseConfig,
    ...configOverrides,
    members: configOverrides?.members ?? baseConfig.members,
    deliverables: configOverrides?.deliverables ?? baseConfig.deliverables,
  };

  const operatorId = initiative.operatorId;

  // Helper: resolve email to userId
  async function resolveUserId(email: string): Promise<string | null> {
    const user = await prisma.user.findFirst({
      where: {
        operatorId,
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  // Create project, members, and deliverables in a transaction
  const project = await prisma.$transaction(async (tx) => {
    const proj = await tx.project.create({
      data: {
        operatorId,
        name: config.title,
        description: config.description,
        status: "active",
        createdById: userId,
        dueDate: config.dueDate ? new Date(config.dueDate) : null,
        config: {
          sourceInitiativeId: initiativeId,
          sourceSignal: config.sourceSignal ?? null,
        },
      },
    });

    // Add members
    const addedUserIds = new Set<string>();
    for (const member of config.members) {
      const memberId = await resolveUserId(member.email);
      if (memberId && !addedUserIds.has(memberId)) {
        await tx.projectMember.create({
          data: {
            projectId: proj.id,
            userId: memberId,
            role: member.role || "contributor",
            addedById: userId,
          },
        });
        addedUserIds.add(memberId);
      }
    }

    // Add approver as owner if they weren't in the member list
    if (!addedUserIds.has(userId)) {
      await tx.projectMember.create({
        data: {
          projectId: proj.id,
          userId,
          role: "owner",
          addedById: userId,
        },
      });
    }

    // Create deliverables
    for (const del of config.deliverables) {
      const assigneeId = await resolveUserId(del.assignedToEmail);
      await tx.projectDeliverable.create({
        data: {
          projectId: proj.id,
          title: del.title,
          description: del.description,
          stage: "intelligence",
          generationMode: "ai_generated",
          assignedToId: assigneeId,
        },
      });
    }

    return proj;
  });

  // Link initiative to the created project and mark completed
  await prisma.initiative.update({
    where: { id: initiativeId },
    data: {
      status: "completed",
      projectId: project.id,
    },
  });

  // Queue AI generation for each deliverable
  const deliverables = await prisma.projectDeliverable.findMany({
    where: { projectId: project.id },
    select: { id: true },
  });

  for (const del of deliverables) {
    await enqueueWorkerJob("generate_deliverable", operatorId, {
      deliverableId: del.id,
      projectId: project.id,
    }).catch((err) =>
      console.error(`[initiative-project] Failed to queue generation for deliverable ${del.id}:`, err),
    );
  }

  console.log(
    `[initiative-project] Created project "${config.title}" (${project.id}) with ${config.members.length} members and ${config.deliverables.length} deliverables from initiative ${initiativeId}`,
  );

  return project.id;
}
