import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { encryptConfig } from "@/lib/config-encryption";
import { ensureHardcodedEntityType } from "@/lib/event-materializer";
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

export async function runSyntheticSeed(
  company: SyntheticCompany,
  options?: { modelOverride?: string },
): Promise<{
  operatorId: string;
  userCredentials: Array<{ name: string; email: string; password: string; role: string }>;
  stats: Record<string, number>;
  analysisId: string;
}> {
  console.log(`[synthetic-seed] Starting seed for ${company.name}...`);

  const modelLabel = options?.modelOverride
    ? ` (${options.modelOverride.includes("sonnet") ? "Sonnet" : options.modelOverride.includes("opus") ? "Opus" : options.modelOverride})`
    : "";

  // ── 1. Operator ──────────────────────────────────────────────────
  const operator = await prisma.operator.create({
    data: {
      displayName: company.name + modelLabel,
      companyName: company.name + modelLabel,
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
  const typeSlugs = ["organization", "department", "team-member", "company", "contact", "deal", "invoice", "ticket"];
  const types: Record<string, { typeId: string; props: Record<string, string> }> = {};
  for (const slug of typeSlugs) {
    types[slug] = await getTypeAndProps(operatorId, slug);
  }

  const clientOfRelId = await ensureRelType(operatorId, "client-of", "Client Of", types["company"].typeId, types["organization"].typeId);
  const partnerOfRelId = await ensureRelType(operatorId, "partner-of", "Partner Of", types["company"].typeId, types["organization"].typeId);
  const vendorOfRelId = await ensureRelType(operatorId, "vendor-of", "Vendor Of", types["company"].typeId, types["organization"].typeId);
  const contactCompanyRelId = await ensureRelType(operatorId, "contact-company", "Contact → Company", types["contact"].typeId, types["company"].typeId);
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

  // Slack channel mappings (need hqEntity as placeholder departmentId)
  if (connectorIds["slack"] && company.slackChannels) {
    for (const ch of company.slackChannels) {
      await prisma.slackChannelMapping.create({
        data: {
          operatorId,
          connectorId: connectorIds["slack"],
          channelId: ch.channelId,
          channelName: ch.channelName,
          departmentId: hqEntity.id, // Placeholder — remapped after onboarding discovers departments
        },
      });
    }
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

  // ── 7. Content Chunks with embeddings ────────────────────────────
  console.log(`[synthetic-seed] Embedding ${company.content.length} content chunks...`);

  const allTexts = company.content.map((c) => c.content);
  const allEmbeddings: (number[] | null)[] = [];

  for (let i = 0; i < allTexts.length; i += EMBED_BATCH_SIZE) {
    const batchNum = Math.floor(i / EMBED_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allTexts.length / EMBED_BATCH_SIZE);
    console.log(`[synthetic-seed] Embedding batch ${batchNum}/${totalBatches}...`);
    const batch = allTexts.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embedChunks(batch);
    allEmbeddings.push(...embeddings);
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

  // ── 8. Activity Signals ──────────────────────────────────────────
  // Build email → entity ID lookup (employees get looked up by email, contacts by name)
  const emailToEntityId: Record<string, string> = {};
  // We don't have entity IDs for employees yet (agents will create them),
  // but ActivitySignals need actorEntityId. For now, store null — the agents
  // query signals by signalType and time, not by entity ID.
  // Contacts DO have entity IDs since we created them above.
  for (const c of company.contacts) {
    emailToEntityId[c.email] = contactEntityIds[c.name] ?? "";
  }

  let signalCount = 0;
  for (const s of company.activitySignals) {
    const actorEntityId = emailToEntityId[s.actorEmail] ?? null;
    const targetEntityIds = s.targetEmails
      ?.map((e) => emailToEntityId[e])
      .filter(Boolean) ?? [];

    await prisma.activitySignal.create({
      data: {
        operatorId,
        signalType: s.signalType,
        actorEntityId,
        targetEntityIds: targetEntityIds.length > 0 ? JSON.stringify(targetEntityIds) : null,
        occurredAt: daysAgo(s.daysAgo),
        metadata: s.metadata ? JSON.stringify(s.metadata) : null,
      },
    });
    signalCount++;
  }
  console.log(`[synthetic-seed] Created ${signalCount} activity signals`);

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

  // ── Return stats ─────────────────────────────────────────────────
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
      contentChunks: chunkCount,
      activitySignals: signalCount,
    },
    analysisId: analysis.id,
  };
}

// ── Cleanup ─────────────────────────────────────────────────────────

export async function cleanupSyntheticCompany(operatorId: string): Promise<void> {
  // Reuse the cleanup pattern from seed-runner — same cascade order
  await prisma.entity.updateMany({
    where: { operatorId },
    data: { parentDepartmentId: null, mergedIntoId: null, ownerDepartmentId: null },
  });

  // Phase 3+ models
  await prisma.followUp.deleteMany({ where: { operatorId } });
  await prisma.recurringTask.deleteMany({ where: { operatorId } });
  await prisma.delegation.deleteMany({ where: { operatorId } });
  await prisma.workStreamItem.deleteMany({ where: { workStream: { operatorId } } });
  await prisma.workStream.deleteMany({ where: { operatorId } });
  await prisma.executionStep.deleteMany({ where: { plan: { operatorId } } });
  await prisma.executionPlan.deleteMany({ where: { operatorId } });
  await prisma.initiative.deleteMany({ where: { operatorId } });
  await prisma.goal.deleteMany({ where: { operatorId } });
  await prisma.planAutonomy.deleteMany({ where: { operatorId } });
  await prisma.operationalInsight.deleteMany({ where: { operatorId } });
  await prisma.departmentHealth.deleteMany({ where: { operatorId } });
  await prisma.priorityOverride.deleteMany({ where: { operatorId } });
  await prisma.onboardingAgentRun.deleteMany({ where: { analysis: { operatorId } } });
  await prisma.onboardingAnalysis.deleteMany({ where: { operatorId } });

  // Situations & detection
  await prisma.evaluationLog.deleteMany({ where: { operatorId } });
  await prisma.situationEvent.deleteMany({ where: { situation: { operatorId } } });
  await prisma.situation.deleteMany({ where: { operatorId } });
  await prisma.personalAutonomy.deleteMany({ where: { operatorId } });
  await prisma.situationType.deleteMany({ where: { operatorId } });

  // Notifications & copilot
  await prisma.notification.deleteMany({ where: { operatorId } });
  await prisma.copilotMessage.deleteMany({ where: { operatorId } });
  await prisma.orientationSession.deleteMany({ where: { operatorId } });

  // Policies & actions
  await prisma.policyRule.deleteMany({ where: { operatorId } });
  await prisma.actionCapability.deleteMany({ where: { operatorId } });

  // Events & activity
  await prisma.activitySignal.deleteMany({ where: { operatorId } });
  await prisma.event.deleteMany({ where: { operatorId } });

  // Worker jobs
  await prisma.workerJob.deleteMany({ where: { operatorId } });

  // Connectors
  await prisma.slackChannelMapping.deleteMany({ where: { operatorId } });
  await prisma.syncLog.deleteMany({ where: { connector: { operatorId } } });
  await prisma.sourceConnector.deleteMany({ where: { operatorId } });

  // Content
  await prisma.contentChunk.deleteMany({ where: { operatorId } });
  await prisma.internalDocument.deleteMany({ where: { operatorId } });

  // Entities & graph
  await prisma.entityMention.deleteMany({ where: { entity: { operatorId } } });
  await prisma.entityMergeLog.deleteMany({ where: { operatorId } });
  await prisma.propertyValue.deleteMany({ where: { entity: { operatorId } } });
  await prisma.relationship.deleteMany({ where: { relationshipType: { operatorId } } });
  await prisma.relationshipType.deleteMany({ where: { operatorId } });

  // Users & auth
  await prisma.invite.deleteMany({ where: { operatorId } });
  await prisma.notificationPreference.deleteMany({ where: { user: { operatorId } } });
  await prisma.passwordResetToken.deleteMany({ where: { user: { operatorId } } });
  await prisma.userScope.deleteMany({ where: { user: { operatorId } } });
  await prisma.session.deleteMany({ where: { user: { operatorId } } });
  await prisma.creditTransaction.deleteMany({ where: { operatorId } });
  await prisma.user.deleteMany({ where: { operatorId } });

  // Entities (after users)
  await prisma.entity.deleteMany({ where: { operatorId } });
  await prisma.entityProperty.deleteMany({ where: { entityType: { operatorId } } });
  await prisma.entityType.deleteMany({ where: { operatorId } });

  // Operator
  await prisma.operator.delete({ where: { id: operatorId } });

  console.log(`[synthetic-seed] Cleaned up operator ${operatorId}`);
}
