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
  // Try wiki page first (slug or initiative_id property)
  const page = await prisma.knowledgePage.findFirst({
    where: {
      OR: [
        { slug: initiativeId },
        { properties: { path: ["initiative_id"], equals: initiativeId } },
      ],
      pageType: "initiative",
    },
    select: { slug: true, title: true, properties: true, content: true, operatorId: true },
  });

  if (page && page.operatorId) {
    const props = (page.properties ?? {}) as Record<string, unknown>;
    const wikiConfig = (props.project_config ?? {}) as Record<string, unknown>;

    const project = await prisma.project.create({
      data: {
        operatorId: page.operatorId,
        name: (wikiConfig.title as string) ?? page.title,
        description: (wikiConfig.description as string) ?? page.content.slice(0, 500),
        status: "active",
        createdById: userId,
        config: { sourceInitiativeSlug: page.slug },
      },
    });

    // Mark wiki page as completed
    const { updatePageWithLock } = await import("@/lib/wiki-engine");
    await updatePageWithLock(page.operatorId, page.slug, (p) => ({
      properties: { ...(p.properties ?? {}), status: "completed", project_id: project.id },
    }));

    return project.id;
  }

  // Fallback: legacy Initiative table
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childProjects = (config as any).childProjects as Array<{
    title: string;
    description: string;
    deliverables: Array<{
      title: string;
      description: string;
      assignedToEmail: string;
      format: string;
      suggestedDeadline: string | null;
    }>;
  }> | undefined;

  // Resolve all emails to userIds BEFORE entering the transaction
  const allEmails = new Set<string>();
  for (const m of config.members) allEmails.add(m.email);
  for (const d of config.deliverables) if (d.assignedToEmail) allEmails.add(d.assignedToEmail);
  if (childProjects) {
    for (const child of childProjects) {
      for (const d of child.deliverables) if (d.assignedToEmail) allEmails.add(d.assignedToEmail);
    }
  }

  const emailToUserId = new Map<string, string>();
  for (const email of allEmails) {
    const user = await prisma.user.findFirst({
      where: { operatorId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (user) emailToUserId.set(email.toLowerCase(), user.id);
  }

  function resolvedUserId(email: string): string | null {
    return emailToUserId.get(email.toLowerCase()) ?? null;
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
      const memberId = resolvedUserId(member.email);
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
      const assigneeId = resolvedUserId(del.assignedToEmail);
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

    if (childProjects && childProjects.length > 0) {
      for (const child of childProjects) {
        const childProj = await tx.project.create({
          data: {
            operatorId,
            parentProjectId: proj.id,
            name: child.title,
            description: child.description,
            status: "active",
            createdById: userId,
            config: { sourceInitiativeId: initiativeId, parentProjectId: proj.id },
          },
        });

        // Add the same owner to child project
        await tx.projectMember.create({
          data: {
            projectId: childProj.id,
            userId,
            role: "owner",
            addedById: userId,
          },
        });

        // Create child deliverables
        for (const del of child.deliverables) {
          const assigneeId = del.assignedToEmail ? resolvedUserId(del.assignedToEmail) : null;
          await tx.projectDeliverable.create({
            data: {
              projectId: childProj.id,
              title: del.title,
              description: del.description,
              stage: "intelligence",
              generationMode: "ai_generated",
              assignedToId: assigneeId,
            },
          });
        }
      }
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

  // Queue generation for child project deliverables too
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((config as any).childProjects?.length > 0) {
    const childProjectRecords = await prisma.project.findMany({
      where: { parentProjectId: project.id, operatorId },
      select: { id: true },
    });

    for (const child of childProjectRecords) {
      const childDeliverables = await prisma.projectDeliverable.findMany({
        where: { projectId: child.id },
        select: { id: true },
      });

      for (const del of childDeliverables) {
        await enqueueWorkerJob("generate_deliverable", operatorId, {
          deliverableId: del.id,
          projectId: child.id,
        }).catch((err) =>
          console.error(`[initiative-project] Failed to queue generation for child deliverable ${del.id}:`, err),
        );
      }
    }
  }

  console.log(
    `[initiative-project] Created project "${config.title}" (${project.id}) with ${config.members.length} members and ${config.deliverables.length} deliverables from initiative ${initiativeId}`,
  );

  return project.id;
}
