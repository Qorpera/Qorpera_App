import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";

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
    await applyWikiEdits(operatorId, body.edits);
  }

  // Mark all onboarding wiki pages as verified
  const verified = await prisma.knowledgePage.updateMany({
    where: {
      operatorId,
      scope: "operator",
      synthesisPath: "onboarding",
      status: "draft",
    },
    data: {
      status: "verified",
      verifiedAt: new Date(),
    },
  });
  if (verified.count > 0) {
    console.log(`[confirm-structure] Verified ${verified.count} onboarding wiki pages`);
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

  // Advance orientation session to active (skip orienting — copilot orientation is optional)
  // TODO: Once copilot 403 is resolved, change to phase: "orienting" and let the
  // copilot conversation advance to "active". Currently skipping to "active"
  // so users aren't blocked by the broken copilot.
  await prisma.orientationSession.updateMany({
    where: { operatorId },
    data: { phase: "active" },
  });

  // Apply uncertainty log answers to entity graph
  try {
    const analysisForAnswers = await prisma.onboardingAnalysis.findUnique({
      where: { operatorId },
      select: { uncertaintyLog: true },
    });

    if (analysisForAnswers?.uncertaintyLog && Array.isArray(analysisForAnswers.uncertaintyLog)) {
      const answeredQuestions = (analysisForAnswers.uncertaintyLog as Array<Record<string, unknown>>)
        .filter((q) => q.userAnswer && q.userAnswer !== "unknown");

      if (answeredQuestions.length > 0) {
        const { applyAnswersToGraph } = await import("@/lib/onboarding-intelligence/answer-applicator");
        const result = await applyAnswersToGraph(operatorId, answeredQuestions);
        console.log(`[confirm-structure] Applied answers: ${result.propertiesUpdated} properties, ${result.relationshipsCreated} relationships, ${result.contextStored} business rules`);

        // Integrate answers into wiki pages
        try {
          const { updateWikiFromAnswers } = await import("@/lib/wiki-answer-integration");
          const wikiResult = await updateWikiFromAnswers(operatorId, answeredQuestions);
          console.log(`[confirm-structure] Wiki answer integration: ${wikiResult.pagesUpdated} updated, ${wikiResult.pagesCreated} created, ${wikiResult.skipped} skipped`);
        } catch (err) {
          console.error("[confirm-structure] Wiki answer integration failed:", err);
          // Non-fatal — onboarding continues
        }
      }
    }
  } catch (err) {
    console.error("[confirm-structure] Answer application failed:", err);
  }

  // Only enqueue detection if post-synthesis pipeline hasn't already run it
  const existingPipelineJob = await prisma.workerJob.findFirst({
    where: { operatorId, jobType: "post_synthesis_pipeline" },
  });

  let detectionJobsQueued = 0;

  if (!existingPipelineJob) {
    // Post-synthesis pipeline didn't run — enqueue detection as before
    await enqueueWorkerJob("detect_situations", operatorId, {
      operatorId,
      trigger: "onboarding_complete",
    });
    detectionJobsQueued++;

    const existingContentJob = await prisma.workerJob.findFirst({
      where: {
        operatorId,
        jobType: "evaluate_recent_content",
        status: { in: ["pending", "running"] },
      },
    });
    if (!existingContentJob) {
      await enqueueWorkerJob("evaluate_recent_content", operatorId, {
        operatorId,
        trigger: "onboarding_complete",
      });
      detectionJobsQueued++;
    }
  }

  // Seed default system jobs (fire-and-forget)
  import("@/lib/demo/seed-system-jobs")
    .then(({ seedDefaultSystemJobs }) => seedDefaultSystemJobs(operatorId))
    .then(count => { if (count > 0) console.log(`[confirm-structure] Seeded ${count} default system jobs`); })
    .catch(err => console.error("[confirm-structure] System job seeding failed:", err));

  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
    select: { name: true },
  });

  return NextResponse.json({
    success: true,
    detectionJobsQueued,
    situationTypeNames: situationTypes.map(st => st.name),
  });
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
          entityType: { slug: "domain" },
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
          entityType: { slug: "domain" },
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
          entityType: { slug: "domain" },
          status: "active",
        },
      });

      if (personPv?.entity && targetDept) {
        await prisma.entity.update({
          where: { id: personPv.entity.id },
          data: { primaryDomainId: targetDept.id },
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
      where: { operatorId, slug: "domain" },
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

// ── Wiki Edit Application ───────────────────────────────────────────────────

async function applyWikiEdits(operatorId: string, edits: CompanyModelEdits): Promise<void> {
  // Rename domain_hub wiki pages
  if (edits.renamedDepartments) {
    for (const { oldName, newName } of edits.renamedDepartments) {
      const hubPage = await prisma.knowledgePage.findFirst({
        where: {
          operatorId,
          scope: "operator",
          pageType: "domain_hub",
          title: { equals: oldName, mode: "insensitive" },
        },
        select: { id: true, slug: true },
      });
      if (hubPage) {
        const oldSlug = hubPage.slug;
        const newSlug = "domain-" + newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        // Update the hub page title and slug
        await prisma.knowledgePage.update({
          where: { id: hubPage.id },
          data: { title: newName, slug: newSlug },
        });

        // Update cross-references in all pages that referenced the old slug
        if (oldSlug !== newSlug) {
          const referencing = await prisma.knowledgePage.findMany({
            where: { operatorId, scope: "operator", crossReferences: { has: oldSlug } },
            select: { id: true, crossReferences: true },
          });
          for (const page of referencing) {
            await prisma.knowledgePage.update({
              where: { id: page.id },
              data: { crossReferences: page.crossReferences.map(ref => ref === oldSlug ? newSlug : ref) },
            });
          }
        }
      }
    }
  }

  // Archive deleted domain_hub wiki pages
  if (edits.deletedDepartments) {
    for (const name of edits.deletedDepartments) {
      const hubPage = await prisma.knowledgePage.findFirst({
        where: {
          operatorId,
          scope: "operator",
          pageType: "domain_hub",
          title: { equals: name, mode: "insensitive" },
        },
        select: { id: true, slug: true },
      });
      if (hubPage) {
        await prisma.knowledgePage.update({
          where: { id: hubPage.id },
          data: { status: "archived" },
        });
        // Remove cross-references to this domain from all pages
        const referencing = await prisma.knowledgePage.findMany({
          where: { operatorId, scope: "operator", crossReferences: { has: hubPage.slug } },
          select: { id: true, crossReferences: true },
        });
        for (const page of referencing) {
          await prisma.knowledgePage.update({
            where: { id: page.id },
            data: { crossReferences: page.crossReferences.filter(ref => ref !== hubPage.slug) },
          });
        }
      }
    }
  }

  // Move people: update person_profile cross-references
  if (edits.movedPeople) {
    for (const { email, toDepartment } of edits.movedPeople) {
      // Find person wiki page by searching content for the email
      const personPage = await prisma.knowledgePage.findFirst({
        where: {
          operatorId,
          scope: "operator",
          pageType: "person_profile",
          content: { contains: email.toLowerCase(), mode: "insensitive" },
        },
        select: { id: true, crossReferences: true },
      });

      // Find target domain hub slug
      const targetHub = await prisma.knowledgePage.findFirst({
        where: {
          operatorId,
          scope: "operator",
          pageType: "domain_hub",
          title: { equals: toDepartment, mode: "insensitive" },
        },
        select: { slug: true },
      });

      if (personPage && targetHub) {
        // Remove old domain-* refs, add the new one
        const newRefs = personPage.crossReferences.filter(ref => !ref.startsWith("domain-"));
        newRefs.push(targetHub.slug);
        await prisma.knowledgePage.update({
          where: { id: personPage.id },
          data: { crossReferences: newRefs },
        });
      }
    }
  }

  // Archive deleted people wiki pages
  if (edits.deletedPeople) {
    for (const email of edits.deletedPeople) {
      const personPage = await prisma.knowledgePage.findFirst({
        where: {
          operatorId,
          scope: "operator",
          pageType: "person_profile",
          content: { contains: email.toLowerCase(), mode: "insensitive" },
        },
        select: { id: true },
      });
      if (personPage) {
        await prisma.knowledgePage.update({
          where: { id: personPage.id },
          data: { status: "archived" },
        });
      }
    }
  }

  // Add new domain_hub wiki pages
  if (edits.addedDepartments) {
    for (const { name, description } of edits.addedDepartments) {
      const slug = "domain-" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const existing = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug, scope: "operator" },
      });
      if (!existing) {
        await prisma.knowledgePage.create({
          data: {
            operatorId,
            scope: "operator",
            pageType: "domain_hub",
            title: name.trim(),
            slug,
            content: description || "",
            confidence: 0.5,
            status: "draft",
            trustLevel: "provisional",
            crossReferences: [],
            synthesisPath: "onboarding",
            synthesizedByModel: "manual",
            lastSynthesizedAt: new Date(),
            sourceAuthority: "foundational",
          },
        });
      }
    }
  }
}
