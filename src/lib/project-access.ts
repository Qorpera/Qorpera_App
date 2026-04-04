import { prisma } from "@/lib/db";
import type { Project } from "@prisma/client";

/**
 * Checks that a project exists for the given operator and that the user
 * has access. Admins/superadmins can access any project in their operator.
 * Members can only access projects they are a member of.
 *
 * Returns the project if access is granted, null if not.
 */
export async function assertProjectAccess(
  projectId: string,
  operatorId: string,
  userId: string,
  role: string,
): Promise<Project | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, operatorId },
  });
  if (!project) return null;

  if (role === "member") {
    const membership = await prisma.projectMember.findFirst({
      where: { projectId, userId },
      select: { id: true },
    });
    if (!membership) return null;
  }

  return project;
}
