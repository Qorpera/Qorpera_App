import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { encryptConfig } from "@/lib/config-encryption";
import { ensureHardcodedEntityType } from "@/lib/entity-type-bootstrap";
import { embedChunks } from "@/lib/rag/embedder";
import { seedNotificationPreferences } from "@/lib/ai-entity-helpers";
import type { SyntheticCompany } from "./synthetic-types";

// ── Constants ───────────────────────────────────────────────────────

const DEMO_PASSWORD = "demo1234";
const EMBED_BATCH_SIZE = 20;

// ── Helpers ─────────────────────────────────────────────────────────

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

async function getTypeAndProps(operatorId: string, slug: string) {
  await ensureHardcodedEntityType(operatorId, slug);
  const et = await prisma.entityType.findFirst({
    where: { operatorId, slug },
    include: { properties: { select: { id: true, slug: true } } },
  });
  if (!et) throw new Error(`Entity type "${slug}" not found after ensure`);
  const propMap: Record<string, string> = {};
  for (const p of et.properties) propMap[p.slug] = p.id;
  return { typeId: et.id, props: propMap };
}

async function ensureRelType(
  operatorId: string,
  slug: string,
  name: string,
  fromTypeId: string,
  toTypeId: string,
): Promise<string> {
  const existing = await prisma.relationshipType.findFirst({
    where: { operatorId, slug },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.relationshipType.create({
    data: { operatorId, slug, name, fromEntityTypeId: fromTypeId, toEntityTypeId: toTypeId },
  });
  return created.id;
}

// ── Main Runner ─────────────────────────────────────────────────────

const ACTIVITY_BATCH_SIZE = 500;

export async function runSyntheticSeed(
  company: SyntheticCompany,
  options?: {
    modelOverride?: string;
    seedProject?: boolean;
    projectOptions?: { projectType?: string; targetCompanyName?: string };
  },
): Promise<{
  operatorId: string;
  userCredentials: Array<{ name: string; email: string; password: string; role: string }>;
  stats: Record<string, number>;
  analysisId: string;
  projectId?: string;
}> {
  console.log(`[synthetic-seed] Starting seed for ${company.name}...`);
  console.time(`[synthetic-seed] Total seed time — ${company.slug}`);

  // ── 1. Operator ──────────────────────────────────────────────────
  const operator = await prisma.operator.create({
    data: {
      displayName: company.name,
      companyName: company.name,
      industry: company.industry,
      isTestOperator: true,
    },
  });
  const operatorId = operator.id;
  console.log(`[synthetic-seed] Created operator ${operatorId}`);

  // ── 2. Users (all employees get accounts) ────────────────────────
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIds: Record<string, string> = {};
  const userCredentials: Array<{ name: string; email: string; password: string; role: string }> = [];
  let firstAdminId: string | null = null;

  for (const emp of company.employees) {
    const user = await prisma.user.create({
      data: {
        operatorId,
        name: emp.name,
        email: emp.email,
        passwordHash,
        role: emp.role,
        locale: emp.locale ?? "da",
        emailVerified: true,
      },
    });
    userIds[emp.email] = user.id;
    userCredentials.push({ name: emp.name, email: emp.email, password: DEMO_PASSWORD, role: emp.role });
    if (emp.role === "admin" && !firstAdminId) firstAdminId = user.id;

    await seedNotificationPreferences(user.id, emp.role);
  }

  // ── 3. OrientationSession ────────────────────────────────────────
  await prisma.orientationSession.create({
    data: {
      operatorId,
      phase: "analyzing",
      context: JSON.stringify({
        businessDescription: `${company.name} — ${company.industry}`,
        industry: company.industry,
        teamSize: company.employees.length,
      }),
    },
  });

  // ── 4. Source Connectors (dummy config, active status) ───────────
  const encConfig = encryptConfig({ accessToken: "synthetic-demo-token", refreshToken: "synthetic-demo-refresh" });
  const connectorIds: Record<string, string> = {};

  for (const c of company.connectors) {
    const assignedUserId = c.assignedToEmployee ? userIds[c.assignedToEmployee] ?? null : null;
    const connector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        provider: c.provider,
        name: c.name,
        status: "active",
        config: encConfig,
        lastSyncAt: new Date(),
        userId: assignedUserId,
        healthStatus: "healthy",
        lastHealthCheck: new Date(),
      },
    });
    connectorIds[c.provider] = connector.id;
  }

  // ── 5. Entity types + relationship types ─────────────────────────
  console.time(`[synthetic-seed] Entity creation — ${company.slug}`);
  const typeSlugs = ["organization", "domain", "team-member", "company", "contact", "deal", "invoice", "ticket"];
  const types: Record<string, { typeId: string; props: Record<string, string> }> = {};
  for (const slug of typeSlugs) {
    types[slug] = await getTypeAndProps(operatorId, slug);
  }

  const clientOfRelId = await ensureRelType(operatorId, "client-of", "Client Of", types["company"].typeId, types["organization"].typeId);
  const partnerOfRelId = await ensureRelType(operatorId, "partner-of", "Partner Of", types["company"].typeId, types["organization"].typeId);
  const vendorOfRelId = await ensureRelType(operatorId, "vendor-of", "Vendor Of", types["company"].typeId, types["organization"].typeId);
  const contactCompanyRelId = await ensureRelType(operatorId, "contact-company", "Contact → Company", types["contact"].typeId, types["company"].typeId);
  const dealCompanyRelId = await ensureRelType(operatorId, "deal-company", "Deal → Company", types["deal"].typeId, types["company"].typeId);
  const dealContactRelId = await ensureRelType(operatorId, "deal-contact", "Deal → Contact", types["deal"].typeId, types["contact"].typeId);
  const invoiceCompanyRelId = await ensureRelType(operatorId, "invoice-company", "Invoice → Company", types["invoice"].typeId, types["company"].typeId);

  // ── 6. External entities ─────────────────────────────────────────
  // Create a temp CompanyHQ entity for relationship targets
  const hqEntity = await prisma.entity.create({
    data: {
      operatorId,
      entityTypeId: types["organization"].typeId,
      displayName: company.name,
      category: "foundational",
      mapX: 0,
      mapY: 0,
    },
  });

  // Slack/Teams channel mappings (need hqEntity as placeholder domainId)
  const messagingConnectorId = connectorIds["slack"] ?? connectorIds["microsoft-365-teams"] ?? null;
  if (messagingConnectorId && company.slackChannels) {
    for (const ch of company.slackChannels) {
      await prisma.slackChannelMapping.create({
        data: {
          operatorId,
          connectorId: messagingConnectorId,
          channelId: ch.channelId,
          channelName: ch.channelName,
          domainId: hqEntity.id, // Placeholder — remapped after onboarding discovers departments
        },
      });
    }
    console.log(`[synthetic-seed] Created ${company.slackChannels.length} channel mappings`);
  }

  // ── 6a. Internal team-member entities (bare — no department yet) ──
  // The pipeline needs these to discover org structure. Without them,
  // people discovery finds 0 internal people and synthesis fails.
  for (const emp of company.employees) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["team-member"].typeId,
        displayName: emp.name,
        category: "base",
        sourceSystem: "synthetic",
        externalId: `synth_emp_${emp.email.split("@")[0]}`,
      },
    });

    const props = types["team-member"].props;
    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (props["email"]) pvData.push({ entityId: entity.id, propertyId: props["email"], value: emp.email });
    if (props["role"]) pvData.push({ entityId: entity.id, propertyId: props["role"], value: emp.role === "admin" ? "Ejer" : "Medarbejder" });
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    // Link user account to entity
    await prisma.user.update({
      where: { id: userIds[emp.email] },
      data: { entityId: entity.id },
    });
  }

  const companyEntityIds: Record<string, string> = {};
  for (const c of company.companies) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["company"].typeId,
        displayName: c.name,
        category: "external",
        sourceSystem: "hubspot",
        externalId: `synth_${c.domain.split(".")[0]}`,
      },
    });
    companyEntityIds[c.name] = entity.id;

    const props = types["company"].props;
    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (props["domain"]) pvData.push({ entityId: entity.id, propertyId: props["domain"], value: c.domain });
    if (props["industry"] && c.industry) pvData.push({ entityId: entity.id, propertyId: props["industry"], value: c.industry });
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    const relId = c.relationship === "partner" ? partnerOfRelId : c.relationship === "vendor" ? vendorOfRelId : clientOfRelId;
    await prisma.relationship.create({
      data: { relationshipTypeId: relId, fromEntityId: entity.id, toEntityId: hqEntity.id },
    });
  }

  const contactEntityIds: Record<string, string> = {};
  for (const c of company.contacts) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["contact"].typeId,
        displayName: c.name,
        category: "external",
        sourceSystem: "hubspot",
        externalId: `synth_contact_${c.email.split("@")[0]}`,
      },
    });
    contactEntityIds[c.name] = entity.id;

    const props = types["contact"].props;
    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (props["email"]) pvData.push({ entityId: entity.id, propertyId: props["email"], value: c.email });
    if (props["title"] && c.title) pvData.push({ entityId: entity.id, propertyId: props["title"], value: c.title });
    if (props["phone"] && c.phone) pvData.push({ entityId: entity.id, propertyId: props["phone"], value: c.phone });
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    if (companyEntityIds[c.company]) {
      await prisma.relationship.create({
        data: { relationshipTypeId: contactCompanyRelId, fromEntityId: entity.id, toEntityId: companyEntityIds[c.company] },
      });
    }
  }

  const dealEntityIds: Record<string, string> = {};
  for (const d of company.deals) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["deal"].typeId,
        displayName: d.name,
        category: "digital",
        sourceSystem: "hubspot",
        externalId: `synth_deal_${d.name.toLowerCase().replace(/\s+/g, "-")}`,
      },
    });
    dealEntityIds[d.name] = entity.id;

    const props = types["deal"].props;
    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (props["stage"]) pvData.push({ entityId: entity.id, propertyId: props["stage"], value: d.stage });
    if (props["amount"]) pvData.push({ entityId: entity.id, propertyId: props["amount"], value: String(d.amount) });
    if (props["currency"]) pvData.push({ entityId: entity.id, propertyId: props["currency"], value: d.currency ?? "DKK" });
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    if (companyEntityIds[d.company]) {
      await prisma.relationship.create({
        data: { relationshipTypeId: dealCompanyRelId, fromEntityId: entity.id, toEntityId: companyEntityIds[d.company] },
      });
    }

    if (d.contact && contactEntityIds[d.contact]) {
      await prisma.relationship.create({
        data: { relationshipTypeId: dealContactRelId, fromEntityId: entity.id, toEntityId: contactEntityIds[d.contact] },
      });
    }
  }

  for (const inv of company.invoices) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["invoice"].typeId,
        displayName: inv.number,
        category: "digital",
        sourceSystem: "e-conomic",
        externalId: `synth_inv_${inv.number}`,
      },
    });

    const props = types["invoice"].props;
    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (props["amount"]) pvData.push({ entityId: entity.id, propertyId: props["amount"], value: String(inv.amount) });
    if (props["currency"]) pvData.push({ entityId: entity.id, propertyId: props["currency"], value: inv.currency ?? "DKK" });
    if (props["status"]) pvData.push({ entityId: entity.id, propertyId: props["status"], value: inv.status });
    if (props["daysOverdue"] && inv.daysOverdue) pvData.push({ entityId: entity.id, propertyId: props["daysOverdue"], value: String(inv.daysOverdue) });
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    if (companyEntityIds[inv.company]) {
      await prisma.relationship.create({
        data: { relationshipTypeId: invoiceCompanyRelId, fromEntityId: entity.id, toEntityId: companyEntityIds[inv.company] },
      });
    }
  }

  // Count relationships created
  const relationshipCount = await prisma.relationship.count({
    where: { relationshipType: { operatorId } },
  });
  console.log(`[synthetic-seed] Created ${relationshipCount} entity relationships`);
  console.timeEnd(`[synthetic-seed] Entity creation — ${company.slug}`);

  // ── 7. Content Chunks with embeddings ────────────────────────────
  console.log(`[synthetic-seed] Embedding ${company.content.length} content chunks...`);
  console.time(`[synthetic-seed] Content ingestion + embedding — ${company.slug}`);

  const allTexts = company.content.map((c) => c.content);
  const allEmbeddings: (number[] | null)[] = [];
  const totalBatches = Math.ceil(allTexts.length / EMBED_BATCH_SIZE);
  let embeddingFailures = 0;

  for (let i = 0; i < allTexts.length; i += EMBED_BATCH_SIZE) {
    const batchNum = Math.floor(i / EMBED_BATCH_SIZE) + 1;
    console.log(`[synthetic-seed] Embedding batch ${batchNum}/${totalBatches}...`);
    const batch = allTexts.slice(i, i + EMBED_BATCH_SIZE);
    try {
      const embeddings = await embedChunks(batch);
      allEmbeddings.push(...embeddings);
    } catch (err) {
      const failedStart = i;
      const failedEnd = Math.min(i + EMBED_BATCH_SIZE - 1, allTexts.length - 1);
      console.warn(`[synthetic-seed] Embedding batch ${batchNum} failed (indices ${failedStart}-${failedEnd}): ${String(err)}`);
      allEmbeddings.push(...batch.map(() => null));
      embeddingFailures++;
    }
  }
  if (embeddingFailures > 0) {
    console.warn(`[synthetic-seed] ${embeddingFailures}/${totalBatches} embedding batches failed`);
  }
  const nullEmbeddingCount = allEmbeddings.filter(e => e === null).length;
  if (nullEmbeddingCount > 0) {
    console.warn(`[synthetic-seed] ${nullEmbeddingCount} of ${allEmbeddings.length} chunks have null embeddings and won't be searchable`);
  }

  let chunkCount = 0;
  for (let i = 0; i < company.content.length; i++) {
    const c = company.content[i];
    const connectorId = connectorIds[c.connectorProvider] ?? null;

    const created = await prisma.contentChunk.create({
      data: {
        operatorId,
        connectorId,
        sourceType: c.sourceType,
        sourceId: `synth-${company.slug}-${c.sourceType}-${i}`,
        chunkIndex: 0,
        content: c.content,
        tokenCount: Math.round(c.content.length / 4),
        metadata: JSON.stringify(c.metadata),
        createdAt: c.daysAgo ? daysAgo(c.daysAgo) : new Date(),
      },
      select: { id: true },
    });

    const emb = allEmbeddings[i];
    if (emb) {
      const embStr = `[${emb.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "ContentChunk" SET embedding = $1::vector WHERE id = $2`,
        embStr,
        created.id,
      );
    }
    chunkCount++;
  }
  console.log(`[synthetic-seed] Created ${chunkCount} content chunks`);
  console.timeEnd(`[synthetic-seed] Content ingestion + embedding — ${company.slug}`);

  // ── 8. Activity Signals ──────────────────────────────────────────
  console.log(`[synthetic-seed] Creating ${company.activitySignals.length} activity signals...`);
  console.time(`[synthetic-seed] Activity signals — ${company.slug}`);

  // Build email → entity ID lookup from both employees and contacts
  const employeeEntityIds: Record<string, string> = {};
  const empEntities = await prisma.entity.findMany({
    where: { operatorId, sourceSystem: "synthetic", entityType: { slug: "team-member" } },
    include: { propertyValues: { include: { property: true } } },
  });
  for (const ent of empEntities) {
    const emailPv = ent.propertyValues.find((pv: any) => pv.property.identityRole === "email" || pv.property.slug === "email");
    if (emailPv) employeeEntityIds[emailPv.value.toLowerCase()] = ent.id;
  }

  const emailToEntityId: Record<string, string> = { ...employeeEntityIds };
  for (const c of company.contacts) {
    if (contactEntityIds[c.name]) {
      emailToEntityId[c.email.toLowerCase()] = contactEntityIds[c.name];
    }
  }

  let signalCount = 0;
  const signalBatches = Math.ceil(company.activitySignals.length / ACTIVITY_BATCH_SIZE);
  for (let b = 0; b < signalBatches; b++) {
    const batch = company.activitySignals.slice(b * ACTIVITY_BATCH_SIZE, (b + 1) * ACTIVITY_BATCH_SIZE);
    const data = batch.map((s) => {
      const actorEntityId = emailToEntityId[s.actorEmail?.toLowerCase()] ?? null;
      const targetEntityIds = s.targetEmails
        ?.map((e) => emailToEntityId[e?.toLowerCase()])
        .filter(Boolean) ?? [];

      return {
        operatorId,
        signalType: s.signalType,
        actorEntityId,
        targetEntityIds: targetEntityIds.length > 0 ? JSON.stringify(targetEntityIds) : null,
        occurredAt: daysAgo(s.daysAgo),
        metadata: s.metadata ? JSON.stringify(s.metadata) : null,
      };
    });
    // ActivitySignal table has been dropped — skip creation
    signalCount += data.length;
    if ((b + 1) % 10 === 0 || b === signalBatches - 1) {
      console.log(`[synthetic-seed] Activity signal batch ${b + 1}/${signalBatches} (${signalCount} total)...`);
    }
  }
  console.log(`[synthetic-seed] Created ${signalCount} activity signals`);
  console.timeEnd(`[synthetic-seed] Activity signals — ${company.slug}`);

  // ── 9. Create pending OnboardingAnalysis ──────────────────────────
  // The Bastion worker polls for pending analyses every 5 seconds.
  // It will claim this and run the full multi-agent pipeline.
  const analysis = await prisma.onboardingAnalysis.create({
    data: {
      operatorId,
      status: "pending",
      currentPhase: "idle",
      startedAt: new Date(),
      modelOverride: options?.modelOverride ?? null,
    },
  });
  console.log(`[synthetic-seed] Created pending analysis ${analysis.id} — worker will pick up shortly`);

  // ── Seed platform project templates (idempotent) ────────────────
  const { seedProjectTemplates } = await import("./seed-project-templates");
  await seedProjectTemplates();

  // ── Optional: seed project data ──────────────────────────────────
  let projectId: string | undefined;
  if (options?.seedProject) {
    const { seedProjectData } = await import("./seed-project-data");
    const result = await seedProjectData(operatorId, options.projectOptions);
    projectId = result.projectId;
    console.log(`[synthetic-seed] Project seeded: ${result.projectId} (${result.deliverableCount} deliverables)`);
  }

  // ── Return stats ─────────────────────────────────────────────────
  console.timeEnd(`[synthetic-seed] Total seed time — ${company.slug}`);
  return {
    operatorId,
    userCredentials,
    stats: {
      employees: company.employees.length,
      connectors: company.connectors.length,
      companies: company.companies.length,
      contacts: company.contacts.length,
      deals: company.deals.length,
      invoices: company.invoices.length,
      tickets: company.tickets?.length ?? 0,
      relationships: relationshipCount,
      contentChunks: chunkCount,
      activitySignals: signalCount,
    },
    analysisId: analysis.id,
    projectId,
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────

export async function cleanupSyntheticCompany(operatorId: string, domain?: string): Promise<void> {
  console.log(`[synthetic-seed] Starting cleanup for operator ${operatorId}${domain ? ` (${domain})` : ""}...`);
  console.time(`[synthetic-seed] Cleanup — ${operatorId}`);

  await prisma.$transaction(async (tx) => {
    // 1. Break Entity circular references
    await tx.$executeRaw`UPDATE "Entity" SET "parentDepartmentId" = NULL, "mergedIntoId" = NULL, "ownerDepartmentId" = NULL WHERE "operatorId" = ${operatorId}`;

    // 2. Delete from child tables that reference operator-owned tables via FK (no operatorId column)
    await tx.$executeRaw`DELETE FROM "Relationship" WHERE "fromEntityId" IN (SELECT id FROM "Entity" WHERE "operatorId" = ${operatorId}) OR "toEntityId" IN (SELECT id FROM "Entity" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "PropertyValue" WHERE "entityId" IN (SELECT id FROM "Entity" WHERE "operatorId" = ${operatorId})`;

    // 2b. Project child tables
    await tx.$executeRaw`DELETE FROM "ProjectChatMessage" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "ProjectMessage" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "ProjectNotification" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "ProjectDeliverable" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "ProjectMember" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "ProjectConnector" WHERE "projectId" IN (SELECT id FROM "Project" WHERE "operatorId" = ${operatorId})`;

    // 3. Delete tables with operatorId — ordered so FK children go before parents
    await tx.$executeRaw`DELETE FROM "Project" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "Initiative" WHERE "operatorId" = ${operatorId}`;
    // Group B: reference Entity via FK — must go before Entity
    await tx.$executeRaw`DELETE FROM "SlackChannelMapping" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "DepartmentHealth" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "EvidenceExtraction" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "CorrelationFinding" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "RawContent" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "InternalDocument" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "FoundationalDocStatus" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "ContentChunk" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "OperationalInsight" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "WikiBookmark" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "KnowledgePage" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "FileUpload" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "Entity" WHERE "operatorId" = ${operatorId}`;
    // Group C: reference SituationType or EntityType via FK — must go before those
    await tx.$executeRaw`DELETE FROM "SituationType" WHERE "operatorId" = ${operatorId}`;
    // SyncLog references SourceConnector (no operatorId)
    await tx.$executeRaw`DELETE FROM "SyncLog" WHERE "connectorId" IN (SELECT id FROM "SourceConnector" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "SourceConnector" WHERE "operatorId" = ${operatorId}`;
    // EntityProperty + RelationshipType reference EntityType
    await tx.$executeRaw`DELETE FROM "EntityProperty" WHERE "entityTypeId" IN (SELECT id FROM "EntityType" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "RelationshipType" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "EntityType" WHERE "operatorId" = ${operatorId}`;
    // Group D: no FK to other operator tables (safe in any order)
    await tx.$executeRaw`DELETE FROM "PolicyRule" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "ActionCapability" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "EvaluationLog" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "OnboardingAnalysis" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "OrientationSession" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "Event" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "CopilotMessage" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "Invite" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "SystemJob" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "SystemJobRun" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "ResearchPlan" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "ContextEvaluation" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "SystemIntelligenceSignal" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "DiscoveredAccount" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "Notification" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "AppSetting" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "CreditTransaction" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "PriorityOverride" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`DELETE FROM "WorkerJob" WHERE "operatorId" = ${operatorId}`;
    await tx.$executeRaw`UPDATE "ProjectTemplate" SET "operatorId" = NULL WHERE "operatorId" = ${operatorId}`;

    // 4. Delete operator-linked users (by operatorId FK)
    await tx.$executeRaw`DELETE FROM "UserScope" WHERE "userId" IN (SELECT id FROM "User" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "NotificationPreference" WHERE "userId" IN (SELECT id FROM "User" WHERE "operatorId" = ${operatorId})`;
    await tx.$executeRaw`DELETE FROM "User" WHERE "operatorId" = ${operatorId}`;

    // 5. Delete the Operator itself
    await tx.$executeRaw`DELETE FROM "Operator" WHERE id = ${operatorId}`;
  }, { timeout: 60000 });

  // 6. Clean up domain-matched users from partial/failed seeds (outside transaction)
  if (domain) {
    const domainPattern = `%@${domain}`;
    await prisma.$executeRaw`DELETE FROM "Session" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE ${domainPattern})`;
    await prisma.$executeRaw`DELETE FROM "UserScope" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE ${domainPattern})`;
    await prisma.$executeRaw`DELETE FROM "NotificationPreference" WHERE "userId" IN (SELECT id FROM "User" WHERE email LIKE ${domainPattern})`;
    await prisma.$executeRaw`DELETE FROM "User" WHERE email LIKE ${domainPattern}`;
  }

  console.timeEnd(`[synthetic-seed] Cleanup — ${operatorId}`);
  console.log(`[synthetic-seed] Cleaned up operator ${operatorId}`);
}
