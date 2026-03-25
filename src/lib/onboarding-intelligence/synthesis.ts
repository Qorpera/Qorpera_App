/**
 * Synthesis layer — transforms multi-agent findings into real database entities.
 *
 * After all agent rounds and organizer passes complete, this module:
 * 1. Loads all agent reports
 * 2. LLM call to produce unified company model
 * 3. Creates departments, people, relationships, situation types
 * 4. Sends email notification
 */

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { addProgressMessage } from "./progress";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";

// ── Company Model Types ──────────────────────────────────────────────────────

export interface CompanyModel {
  departments: Array<{
    name: string;
    description: string;
    confidence: "high" | "medium" | "low";
    suggestedLeadEmail?: string;
  }>;
  people: Array<{
    email: string;
    displayName: string;
    primaryDepartment: string;
    role: string;
    roleLevel: "ic" | "lead" | "manager" | "director" | "c_level";
    reportsToEmail?: string;
  }>;
  crossFunctionalPeople: Array<{
    email: string;
    departments: string[];
    evidence: string;
  }>;
  processes: Array<{
    name: string;
    description: string;
    department: string;
    ownerEmail?: string;
    frequency: string;
    steps: Array<{ order: number; actor: string; action: string }>;
  }>;
  keyRelationships: Array<{
    companyName?: string;
    contactName: string;
    contactEmail: string;
    type: "customer" | "prospect" | "partner" | "vendor";
    healthScore: "healthy" | "at_risk" | "cold" | "critical";
    primaryInternalContact: string;
  }>;
  financialSnapshot: {
    estimatedMonthlyRevenue?: number;
    currency: string;
    revenueTrend: string;
    overdueInvoiceCount: number;
    pipelineValue?: number;
    dataCompleteness: string;
  };
  situationTypeRecommendations: Array<{
    name: string;
    description: string;
    detectionLogic: string;
    department: string;
    severity: "high" | "medium" | "low";
    expectedFrequency: string;
  }>;
  uncertaintyLog: Array<{
    question: string;
    context: string;
    possibleAnswers?: string[];
    department?: string;
  }>;
}

// ── Synthesis Prompt ─────────────────────────────────────────────────────────

export const SYNTHESIS_PROMPT = `You are compiling the output of a multi-agent organizational intelligence analysis into a single, coherent company model. You have reports from:

- People Discovery (algorithmic): Master list of all discovered people
- Temporal Analyst: Document freshness and timeline
- Organizational Analyst: Department structure, team composition, reporting lines
- Process Analyst: Operational processes, handoffs, bottlenecks
- Relationship Analyst: External relationships, health scores, risk flags
- Knowledge Analyst: Information flow, knowledge bottlenecks, silos
- Financial Analyst: Revenue, payments, pipeline, performance

Plus one or more Organizer reports with confirmed overlaps, resolved contradictions, and synthesis notes.

## Your Task

Produce a SINGLE coherent company model that:

1. **Resolves conflicts** between agents (use Organizer's resolution where available)
2. **Merges overlapping findings** into unified entries (don't duplicate)
3. **Assigns every internal person to exactly one primary department** (cross-functional people get a primary + listed in crossFunctionalPeople)
4. **Produces actionable situation type recommendations** synthesized from all agents
5. **Generates the uncertainty log** — specific questions for the CEO that the data couldn't answer

## Critical Rules

- Every department MUST have at least one member. Don't create empty departments.
- People assignment priority: documented org structure > CRM teams > calendar cluster analysis > email patterns
- Department names should use the language most commonly found in the company's own documents (Danish companies often use Danish dept names internally)
- Situation type recommendations should be deduplicated across agents — if three agents recommend invoice overdue detection, merge them into one recommendation
- The uncertainty log should be formatted as direct questions: "Is Thomas the Finance team lead, or does he report to someone else?" — not agent jargon
- Include ALL internal people from the People Registry. If someone can't be confidently assigned, put them in an "Unassigned" group and flag in uncertainty log.`;

const SYNTHESIS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    departments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          suggestedLeadEmail: { type: "string" },
        },
        required: ["name", "description", "confidence"],
      },
    },
    people: {
      type: "array",
      items: {
        type: "object",
        properties: {
          email: { type: "string" },
          displayName: { type: "string" },
          primaryDepartment: { type: "string" },
          role: { type: "string" },
          roleLevel: { type: "string", enum: ["ic", "lead", "manager", "director", "c_level"] },
          reportsToEmail: { type: "string" },
        },
        required: ["email", "displayName", "primaryDepartment", "role", "roleLevel"],
      },
    },
    crossFunctionalPeople: {
      type: "array",
      items: {
        type: "object",
        properties: {
          email: { type: "string" },
          departments: { type: "array", items: { type: "string" } },
          evidence: { type: "string" },
        },
        required: ["email", "departments", "evidence"],
      },
    },
    processes: { type: "array", items: { type: "object" } },
    keyRelationships: { type: "array", items: { type: "object" } },
    financialSnapshot: { type: "object" },
    situationTypeRecommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          detectionLogic: { type: "string" },
          department: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          expectedFrequency: { type: "string" },
        },
        required: ["name", "description", "detectionLogic", "department", "severity", "expectedFrequency"],
      },
    },
    uncertaintyLog: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          context: { type: "string" },
          possibleAnswers: { type: "array", items: { type: "string" } },
          department: { type: "string" },
        },
        required: ["question", "context"],
      },
    },
  },
  required: ["departments", "people", "crossFunctionalPeople", "situationTypeRecommendations", "uncertaintyLog"],
};

// ── Launch Synthesis ─────────────────────────────────────────────────────────

export async function launchSynthesis(analysisId: string): Promise<void> {
  const synthesisRun = await prisma.onboardingAgentRun.create({
    data: {
      analysisId,
      agentName: "synthesis",
      round: 99,
      status: "running",
      maxIterations: 1,
      startedAt: new Date(),
    },
  });

  try {
    const analysis = await prisma.onboardingAnalysis.findUnique({
      where: { id: analysisId },
      include: { operator: true },
    });
    if (!analysis) throw new Error("Analysis not found");

    await addProgressMessage(analysisId, "Compiling all findings into your company model...", "synthesis");

    // 1. Load all completed reports
    const allRuns = await prisma.onboardingAgentRun.findMany({
      where: { analysisId, status: "complete" },
    });

    const reports = allRuns
      .filter((r) => r.agentName !== "synthesis")
      .map((r) => ({ agent: r.agentName, round: r.round, report: r.report }));

    // 2. Build synthesis input
    const synthesisInput = buildSynthesisInput(reports);

    // 3. LLM synthesis call
    const response = await callLLM({
      operatorId: analysis.operatorId,
      model: "gpt-5.4",
      instructions: SYNTHESIS_PROMPT,
      messages: [{ role: "user", content: synthesisInput }],
      thinking: true,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "company_model",
          strict: true,
          schema: SYNTHESIS_OUTPUT_SCHEMA,
        },
      },
    });

    const tokensUsed = (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0);

    let companyModel: CompanyModel;
    try {
      companyModel = JSON.parse(response.text);
    } catch {
      throw new Error("Synthesis LLM returned invalid JSON");
    }

    await addProgressMessage(
      analysisId,
      `Model complete: ${companyModel.departments.length} departments, ${companyModel.people.length} team members identified`,
      "synthesis",
    );

    // 4. Create real entities
    await addProgressMessage(analysisId, "Building your organizational map...", "synthesis");
    await createEntitiesFromModel(analysis.operatorId, companyModel);

    // 5. Create situation types
    await addProgressMessage(analysisId, "Setting up situation detection...", "synthesis");
    await createSituationTypesFromModel(analysis.operatorId, companyModel);

    // 6. Mark analysis complete
    await prisma.onboardingAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "confirming",
        currentPhase: "synthesis",
        synthesisOutput: companyModel as any,
        uncertaintyLog: companyModel.uncertaintyLog as any,
        completedAt: new Date(),
        totalTokensUsed: { increment: tokensUsed },
        totalCostCents: { increment: response.apiCostCents || 0 },
      },
    });

    await prisma.onboardingAgentRun.update({
      where: { id: synthesisRun.id },
      data: {
        status: "complete",
        report: companyModel as any,
        completedAt: new Date(),
        tokensUsed,
        costCents: response.apiCostCents || 0,
      },
    });

    // 7. Send email notification
    await sendAnalysisCompleteEmail(analysis.operatorId);

    await addProgressMessage(analysisId, "Your operational map is ready for review!", "synthesis");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Synthesis failed:", message);
    await prisma.onboardingAgentRun.update({
      where: { id: synthesisRun.id },
      data: { status: "failed", report: { error: message } as any, completedAt: new Date() },
    });
    await prisma.onboardingAnalysis.update({
      where: { id: analysisId },
      data: { status: "failed", failureReason: message, completedAt: new Date() },
    });
    await addProgressMessage(analysisId, `Synthesis failed: ${message}`, "synthesis");
  }
}

// ── Build Synthesis Input ────────────────────────────────────────────────────

export function buildSynthesisInput(
  reports: Array<{ agent: string; round: number; report: unknown }>,
): string {
  const parts: string[] = ["## All Agent Reports\n"];

  // Group by round
  const byRound = new Map<number, typeof reports>();
  for (const r of reports) {
    const list = byRound.get(r.round) || [];
    list.push(r);
    byRound.set(r.round, list);
  }

  for (const [round, roundReports] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
    parts.push(`### Round ${round}\n`);
    for (const { agent, report } of roundReports) {
      const name = agent
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      parts.push(`#### ${name}\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`);
    }
  }

  parts.push(
    "\nProduce the unified company model. Merge findings, resolve conflicts, " +
      "deduplicate situation type recommendations, and generate the uncertainty log.",
  );

  return parts.join("\n");
}

// ── Entity Creation ──────────────────────────────────────────────────────────

export async function createEntitiesFromModel(
  operatorId: string,
  model: CompanyModel,
): Promise<void> {
  // 1. Ensure required entity types exist
  const deptTypeId = await ensureEntityType(operatorId, "department");
  const teamMemberTypeId = await ensureEntityType(operatorId, "team-member");

  // 2. Create departments
  const departmentMap = new Map<string, string>(); // name → entityId

  for (const dept of model.departments) {
    let deptEntity = await prisma.entity.findFirst({
      where: {
        operatorId,
        displayName: dept.name,
        entityTypeId: deptTypeId,
        status: "active",
      },
    });

    if (!deptEntity) {
      deptEntity = await prisma.entity.create({
        data: {
          operatorId,
          entityTypeId: deptTypeId,
          displayName: dept.name,
          category: "foundational",
          sourceSystem: "onboarding-intelligence",
        },
      });
    }

    departmentMap.set(dept.name, deptEntity.id);
  }

  // Pre-fetch relationship types (avoid N+1 queries inside the loop)
  const deptMemberTypeId = await ensureRelationshipType(
    operatorId, "department-member", "Department Member", deptTypeId, teamMemberTypeId,
  );

  // 3. Create people and assign to departments
  for (const person of model.people) {
    const deptEntityId = departmentMap.get(person.primaryDepartment);
    if (!deptEntityId) continue;

    let personEntity = await findEntityByEmail(operatorId, person.email);

    if (!personEntity) {
      personEntity = await prisma.entity.create({
        data: {
          operatorId,
          entityTypeId: teamMemberTypeId,
          displayName: person.displayName,
          category: "base",
          parentDepartmentId: deptEntityId,
          sourceSystem: "onboarding-intelligence",
        },
      });

      // Set email identity property
      const emailProp = await prisma.entityProperty.findFirst({
        where: { entityTypeId: teamMemberTypeId, identityRole: "email" },
      });
      if (emailProp) {
        await prisma.propertyValue.create({
          data: { entityId: personEntity.id, propertyId: emailProp.id, value: person.email },
        });
      }
    } else if (!personEntity.parentDepartmentId) {
      await prisma.entity.update({
        where: { id: personEntity.id },
        data: { parentDepartmentId: deptEntityId },
      });
    }

    // Set role property
    if (person.role) {
      const roleProp = await prisma.entityProperty.findFirst({
        where: { entityTypeId: personEntity.entityTypeId, slug: "role" },
      });
      if (roleProp) {
        await prisma.propertyValue.upsert({
          where: { entityId_propertyId: { entityId: personEntity.id, propertyId: roleProp.id } },
          create: { entityId: personEntity.id, propertyId: roleProp.id, value: person.role },
          update: { value: person.role },
        });
      }
    }

    // Create department-member relationship
    await prisma.relationship.upsert({
      where: {
        relationshipTypeId_fromEntityId_toEntityId: {
          relationshipTypeId: deptMemberTypeId,
          fromEntityId: deptEntityId,
          toEntityId: personEntity.id,
        },
      },
      create: {
        relationshipTypeId: deptMemberTypeId,
        fromEntityId: deptEntityId,
        toEntityId: personEntity.id,
      },
      update: {},
    });
  }

  // 4. Create reporting relationships
  const reportsToType = await ensureRelationshipType(
    operatorId, "reports-to", "Reports To", teamMemberTypeId, teamMemberTypeId,
  );

  for (const person of model.people.filter((p) => p.reportsToEmail)) {
    const reportEntity = await findEntityByEmail(operatorId, person.email);
    const managerEntity = await findEntityByEmail(operatorId, person.reportsToEmail!);

    if (reportEntity && managerEntity) {
      await prisma.relationship.upsert({
        where: {
          relationshipTypeId_fromEntityId_toEntityId: {
            relationshipTypeId: reportsToType,
            fromEntityId: reportEntity.id,
            toEntityId: managerEntity.id,
          },
        },
        create: {
          relationshipTypeId: reportsToType,
          fromEntityId: reportEntity.id,
          toEntityId: managerEntity.id,
        },
        update: {},
      });
    }
  }
}

// ── Situation Type Creation ──────────────────────────────────────────────────

export async function createSituationTypesFromModel(
  operatorId: string,
  model: CompanyModel,
): Promise<void> {
  for (const rec of model.situationTypeRecommendations) {
    const slug = rec.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Find department for scoping
    const deptEntity = await prisma.entity.findFirst({
      where: {
        operatorId,
        displayName: rec.department,
        entityType: { slug: "department" },
        status: "active",
      },
    });

    const detectionLogicJson = JSON.stringify({
      mode: "natural",
      naturalLanguage: rec.detectionLogic,
      severity: rec.severity,
    });

    await prisma.situationType.upsert({
      where: { operatorId_slug: { operatorId, slug } },
      create: {
        operatorId,
        slug,
        name: rec.name,
        description: rec.description,
        detectionLogic: detectionLogicJson,
        autonomyLevel: "supervised",
        scopeEntityId: deptEntity?.id,
      },
      update: {
        description: rec.description,
        detectionLogic: detectionLogicJson,
      },
    });
  }
}

// ── Email Notification ───────────────────────────────────────────────────────

export async function sendAnalysisCompleteEmail(operatorId: string): Promise<void> {
  await sendNotificationToAdmins({
    operatorId,
    type: "system_alert",
    title: "Your operational map is ready",
    body: "Qorpera has finished analyzing your connected tools and built your company model. Review and confirm your organizational map to start receiving operational intelligence.",
    linkUrl: "/onboarding",
    emailContext: {
      templateType: "system-alert",
      ctaText: "Review Your Map",
      ctaUrl: "/onboarding",
    },
  });

  await prisma.onboardingAnalysis.updateMany({
    where: { operatorId },
    data: { notifiedAt: new Date() },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function findEntityByEmail(operatorId: string, email: string) {
  const pv = await prisma.propertyValue.findFirst({
    where: {
      value: email.toLowerCase(),
      property: { identityRole: "email" },
      entity: { operatorId, status: "active" },
    },
    include: { entity: true },
  });
  return pv?.entity || null;
}

async function ensureEntityType(operatorId: string, slug: string): Promise<string> {
  const existing = await prisma.entityType.findFirst({
    where: { operatorId, slug },
  });
  if (existing) return existing.id;

  // Create from hardcoded definitions
  const def = HARDCODED_TYPE_DEFS[slug];
  if (!def) throw new Error(`No hardcoded definition for entity type: ${slug}`);

  const entityType = await prisma.entityType.create({
    data: {
      operatorId,
      slug: def.slug,
      name: def.name,
      description: def.description || "",
    },
  });

  // Create properties
  for (let i = 0; i < (def.properties || []).length; i++) {
    const prop = def.properties[i];
    await prisma.entityProperty.create({
      data: {
        entityTypeId: entityType.id,
        slug: prop.slug,
        name: prop.name,
        dataType: prop.dataType || "STRING",
        identityRole: prop.identityRole || null,
        displayOrder: i,
      },
    });
  }

  return entityType.id;
}

async function ensureRelationshipType(
  operatorId: string,
  slug: string,
  name: string,
  fromEntityTypeId: string,
  toEntityTypeId: string,
): Promise<string> {
  const existing = await prisma.relationshipType.findFirst({
    where: { operatorId, slug },
  });
  if (existing) return existing.id;

  const created = await prisma.relationshipType.create({
    data: { operatorId, slug, name, fromEntityTypeId, toEntityTypeId },
  });
  return created.id;
}
