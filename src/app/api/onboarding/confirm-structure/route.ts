import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBaseUrl } from "@/lib/internal-api";

/**
 * POST /api/onboarding/confirm-structure
 *
 * Called when the user confirms/edits the company model produced by synthesis.
 * Applies any edits, advances to "complete", triggers detection sweep.
 */

export interface CompanyModelEdits {
  renamedDepartments?: Array<{ oldName: string; newName: string }>;
  deletedDepartments?: string[];
  movedPeople?: Array<{ email: string; toDepartment: string }>;
  deletedPeople?: string[];
  addedDepartments?: Array<{ name: string; description?: string }>;
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "admin" && session.user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { operatorId } = session;

  let body: { edits?: CompanyModelEdits; uncertaintyAnswers?: Record<number, string> } = {};
  try {
    body = await request.json();
  } catch {
    // No edits — just confirm
  }

  // Apply edits if provided
  if (body.edits) {
    await applyStructureEdits(operatorId, body.edits);
  }

  // Store uncertainty answers alongside the analysis record
  const updateData: Record<string, unknown> = { status: "complete" };
  if (body.uncertaintyAnswers && Object.keys(body.uncertaintyAnswers).length > 0) {
    // Merge answers into the existing uncertaintyLog entries
    const analysis = await prisma.onboardingAnalysis.findUnique({
      where: { operatorId },
      select: { uncertaintyLog: true },
    });
    if (analysis?.uncertaintyLog && Array.isArray(analysis.uncertaintyLog)) {
      const log = analysis.uncertaintyLog as Array<Record<string, unknown>>;
      for (const [idx, answer] of Object.entries(body.uncertaintyAnswers)) {
        const i = Number(idx);
        if (log[i]) {
          log[i].userAnswer = answer;
        }
      }
      updateData.uncertaintyLog = log;
    }
  }

  // Update analysis status to complete (with optional uncertainty answers)
  await prisma.onboardingAnalysis.updateMany({
    where: { operatorId },
    data: updateData,
  });

  // Trigger detection sweep (non-blocking)
  const baseUrl = getBaseUrl();
  fetch(`${baseUrl}/api/cron/detect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": process.env.INTERNAL_API_KEY || "",
      Origin: baseUrl,
    },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}

// ── Edit Application ─────────────────────────────────────────────────────────

async function applyStructureEdits(operatorId: string, edits: CompanyModelEdits): Promise<void> {
  // Rename departments
  if (edits.renamedDepartments) {
    for (const { oldName, newName } of edits.renamedDepartments) {
      const dept = await prisma.entity.findFirst({
        where: {
          operatorId,
          displayName: oldName,
          entityType: { slug: "department" },
          status: "active",
        },
      });
      if (dept) {
        await prisma.entity.update({
          where: { id: dept.id },
          data: { displayName: newName },
        });
      }
    }
  }

  // Delete departments (archive, don't hard delete)
  if (edits.deletedDepartments) {
    for (const name of edits.deletedDepartments) {
      const dept = await prisma.entity.findFirst({
        where: {
          operatorId,
          displayName: name,
          entityType: { slug: "department" },
          status: "active",
        },
      });
      if (dept) {
        await prisma.entity.update({
          where: { id: dept.id },
          data: { status: "archived" },
        });
      }
    }
  }

  // Move people between departments
  if (edits.movedPeople) {
    for (const { email, toDepartment } of edits.movedPeople) {
      const personPv = await prisma.propertyValue.findFirst({
        where: {
          value: email.toLowerCase(),
          property: { identityRole: "email" },
          entity: { operatorId, status: "active" },
        },
        include: { entity: true },
      });

      const targetDept = await prisma.entity.findFirst({
        where: {
          operatorId,
          displayName: toDepartment,
          entityType: { slug: "department" },
          status: "active",
        },
      });

      if (personPv?.entity && targetDept) {
        await prisma.entity.update({
          where: { id: personPv.entity.id },
          data: { parentDepartmentId: targetDept.id },
        });
      }
    }
  }

  // Delete people (archive)
  if (edits.deletedPeople) {
    for (const email of edits.deletedPeople) {
      const personPv = await prisma.propertyValue.findFirst({
        where: {
          value: email.toLowerCase(),
          property: { identityRole: "email" },
          entity: { operatorId, status: "active" },
        },
        include: { entity: true },
      });
      if (personPv?.entity) {
        await prisma.entity.update({
          where: { id: personPv.entity.id },
          data: { status: "archived" },
        });
      }
    }
  }

  // Add new departments
  if (edits.addedDepartments) {
    const deptType = await prisma.entityType.findFirst({
      where: { operatorId, slug: "department" },
    });
    if (deptType) {
      for (const { name, description } of edits.addedDepartments) {
        const existing = await prisma.entity.findFirst({
          where: { operatorId, displayName: name, entityTypeId: deptType.id, status: "active" },
        });
        if (!existing) {
          await prisma.entity.create({
            data: {
              operatorId,
              entityTypeId: deptType.id,
              displayName: name,
              category: "foundational",
              sourceSystem: "onboarding-intelligence",
            },
          });
        }
      }
    }
  }
}
