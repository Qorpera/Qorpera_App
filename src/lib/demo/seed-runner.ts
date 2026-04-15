// ── Demo Seed Runner ─────────────────────────────────────────────────
// Database operations for the test company generator.
// Called by the route and (in Prompt 5) by the onboarding demo flow.

import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { encryptConfig } from "@/lib/config-encryption";
import { ensureHardcodedEntityType } from "@/lib/entity-type-bootstrap";
import { ensureHqAi, ensureDepartmentAi, seedNotificationPreferences } from "@/lib/ai-entity-helpers";
import { embedChunks } from "@/lib/rag/embedder";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import {
  COMPANY,
  ADMIN_USER,
  MEMBER_USER,
  DEPARTMENTS,
  TEAM_MEMBERS,
  CROSS_DEPARTMENT,
  DEPARTMENT_HEADS,
  CEO_NAME,
  PLACEHOLDER_SITUATION_TYPES,
  POLICY_RULES,
  SOURCE_CONNECTORS,
  SLACK_CHANNEL_MAPPINGS,
  EXTERNAL_COMPANIES,
  CRM_CONTACTS,
  DEALS,
  INVOICES,
  TICKETS,
  daysAgo,
  hoursAgo,
} from "./seed-data";
import { CONTENT_CHUNKS } from "./seed-content";
import { SITUATION_TYPE_UPDATES, SITUATIONS, ACTION_CAPABILITIES } from "./seed-situations";
import {
  INITIATIVES, OPERATIONAL_INSIGHTS,
  NOTIFICATIONS, COPILOT_SESSIONS,
} from "./seed-phase3";
// ── Cleanup ──────────────────────────────────────────────────────────

export async function cleanupTestOperators(): Promise<void> {
  const testOperators = await prisma.operator.findMany({
    where: { isTestOperator: true },
    select: { id: true },
  });

  for (const op of testOperators) {
    await cleanupOperator(op.id);
  }
}

async function cleanupOperator(operatorId: string): Promise<void> {
  // Break entity self-references to avoid circular FK issues
  await prisma.entity.updateMany({
    where: { operatorId },
    data: { primaryDomainId: null, mergedIntoId: null, ownerDomainId: null },
  });

  // Phase 3 models
  await prisma.initiative.deleteMany({ where: { operatorId } });
  await prisma.operationalInsight.deleteMany({ where: { operatorId } });
  await prisma.domainHealth.deleteMany({ where: { operatorId } });
  await prisma.priorityOverride.deleteMany({ where: { operatorId } });
  await prisma.onboardingAgentRun.deleteMany({ where: { analysis: { operatorId } } });
  await prisma.onboardingAnalysis.deleteMany({ where: { operatorId } });

  // Evaluation logs
  await prisma.evaluationLog.deleteMany({ where: { operatorId } });

  // Detection
  await prisma.situationType.deleteMany({ where: { operatorId } });

  // Notifications & copilot
  await prisma.notification.deleteMany({ where: { operatorId } });
  await prisma.copilotMessage.deleteMany({ where: { operatorId } });
  await prisma.orientationSession.deleteMany({ where: { operatorId } });

  // Policies & actions
  await prisma.policyRule.deleteMany({ where: { operatorId } });
  await prisma.actionCapability.deleteMany({ where: { operatorId } });

  // Events
  await prisma.event.deleteMany({ where: { operatorId } });

  // Connectors
  await prisma.slackChannelMapping.deleteMany({ where: { operatorId } });
  await prisma.syncLog.deleteMany({ where: { connector: { operatorId } } });
  await prisma.sourceConnector.deleteMany({ where: { operatorId } });

  // Content
  await prisma.contentChunk.deleteMany({ where: { operatorId } });
  await prisma.internalDocument.deleteMany({ where: { operatorId } });

  // Entities & graph
  await prisma.entityMention.deleteMany({ where: { entity: { operatorId } } });
  await prisma.propertyValue.deleteMany({ where: { entity: { operatorId } } });
  await prisma.relationship.deleteMany({ where: { relationshipType: { operatorId } } });
  await prisma.relationshipType.deleteMany({ where: { operatorId } });

  // Users & auth
  await prisma.invite.deleteMany({ where: { operatorId } });
  await prisma.notificationPreference.deleteMany({ where: { user: { operatorId } } });
  await prisma.passwordResetToken.deleteMany({ where: { user: { operatorId } } });
  await prisma.session.deleteMany({ where: { user: { operatorId } } });
  await prisma.creditTransaction.deleteMany({ where: { operatorId } });
  await prisma.user.deleteMany({ where: { operatorId } });

  // Entities & types (after users, since User.entityId → Entity)
  await prisma.entity.deleteMany({ where: { operatorId } });
  await prisma.entityProperty.deleteMany({ where: { entityType: { operatorId } } });
  await prisma.entityType.deleteMany({ where: { operatorId } });

  // Operator
  await prisma.operator.delete({ where: { id: operatorId } });
}

// ── Helpers ──────────────────────────────────────────────────────────

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

// ── Main Seed Function ───────────────────────────────────────────────

export async function runDemoSeed(operatorId: string) {
  // ─── Entity Types ────────────────────────────────────────────────
  const typeSlugs = ["organization", "department", "team-member", "ai-agent", "domain-ai", "hq-ai"];
  const types: Record<string, { typeId: string; props: Record<string, string> }> = {};
  for (const slug of typeSlugs) {
    types[slug] = await getTypeAndProps(operatorId, slug);
  }

  // ─── Relationship Types ──────────────────────────────────────────
  const deptMemberRelId = await ensureRelType(
    operatorId, "domain-member", "Domain Member",
    types["team-member"].typeId, types["department"].typeId,
  );
  const reportsToRelId = await ensureRelType(
    operatorId, "reports-to", "Reports To",
    types["team-member"].typeId, types["team-member"].typeId,
  );

  // ─── Layer 2: Departments ────────────────────────────────────────
  const deptIds: Record<string, string> = {};

  for (const d of DEPARTMENTS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types[d.entityTypeSlug].typeId,
        displayName: d.name,
        category: "foundational",
        description: d.description,
        mapX: d.mapX,
        mapY: d.mapY,
      },
    });
    deptIds[d.name] = entity.id;
  }

  // ─── Layer 3: People ─────────────────────────────────────────────
  const memberIds: Record<string, string> = {};
  const tmProps = types["team-member"].props;

  for (const m of TEAM_MEMBERS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["team-member"].typeId,
        displayName: m.name,
        category: "base",
        primaryDomainId: deptIds[m.department],
      },
    });
    memberIds[m.name] = entity.id;

    // Property values
    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (tmProps["email"]) pvData.push({ entityId: entity.id, propertyId: tmProps["email"], value: m.email });
    if (tmProps["role"]) pvData.push({ entityId: entity.id, propertyId: tmProps["role"], value: m.role });
    if (pvData.length > 0) {
      await prisma.propertyValue.createMany({ data: pvData });
    }

    // Primary department-member relationship
    await prisma.relationship.create({
      data: {
        relationshipTypeId: deptMemberRelId,
        fromEntityId: entity.id,
        toEntityId: deptIds[m.department],
        metadata: JSON.stringify({ role: m.role }),
      },
    });
  }

  // Cross-department memberships
  for (const cd of CROSS_DEPARTMENT) {
    await prisma.relationship.create({
      data: {
        relationshipTypeId: deptMemberRelId,
        fromEntityId: memberIds[cd.member],
        toEntityId: deptIds[cd.department],
        metadata: JSON.stringify({ role: cd.role, crossDomain: true }),
      },
    });
  }

  // Reports-to relationships
  for (const [deptName, headName] of Object.entries(DEPARTMENT_HEADS)) {
    // Head → CEO
    if (headName !== CEO_NAME) {
      await prisma.relationship.create({
        data: {
          relationshipTypeId: reportsToRelId,
          fromEntityId: memberIds[headName],
          toEntityId: memberIds[CEO_NAME],
          metadata: JSON.stringify({ label: "reports to" }),
        },
      });
    }

    // Members → Head
    for (const m of TEAM_MEMBERS) {
      if (m.department === deptName && m.name !== headName) {
        await prisma.relationship.create({
          data: {
            relationshipTypeId: reportsToRelId,
            fromEntityId: memberIds[m.name],
            toEntityId: memberIds[headName],
            metadata: JSON.stringify({ label: "reports to" }),
          },
        });
      }
    }
  }

  // ─── Layer 1: Users ──────────────────────────────────────────────
  const pwHash = await hashPassword(ADMIN_USER.password);

  const adminUser = await prisma.user.create({
    data: {
      operatorId,
      email: ADMIN_USER.email,
      name: ADMIN_USER.name,
      passwordHash: pwHash,
      role: ADMIN_USER.role,
      locale: ADMIN_USER.locale,
      emailVerified: true,
      entityId: memberIds[ADMIN_USER.name],
    },
  });

  const memberUser = await prisma.user.create({
    data: {
      operatorId,
      email: MEMBER_USER.email,
      name: MEMBER_USER.name,
      passwordHash: pwHash, // same password
      role: MEMBER_USER.role,
      locale: MEMBER_USER.locale,
      emailVerified: true,
      entityId: memberIds[MEMBER_USER.name],
    },
  });

  const userIds: Record<string, string> = {
    admin: adminUser.id,
    member: memberUser.id,
  };

  // Session for admin (so superadmin can switch to this operator)
  await createSession(adminUser.id);

  // Orientation session (completed — onboarding done)
  await prisma.orientationSession.create({
    data: {
      operatorId,
      phase: "active",
      context: COMPANY.orientationContext,
      completedAt: daysAgo(21),
    },
  });

  // ─── Layer 4: AI Entities ────────────────────────────────────────
  // Operator AI (HQ level)
  const hqAiId = await ensureHqAi(operatorId, COMPANY.name);

  // Department AIs (one per department, skip CompanyHQ which is organization type)
  const deptAiIds: Record<string, string> = {};
  for (const d of DEPARTMENTS) {
    if (d.entityTypeSlug === "domain") {
      deptAiIds[d.name] = await ensureDepartmentAi(operatorId, deptIds[d.name], d.name);
    }
  }

  // Personal AIs for users (ai-agent entities with ownerUserId)
  const personalAiIds: Record<string, string> = {};

  const adminAi = await prisma.entity.create({
    data: {
      operatorId,
      entityTypeId: types["ai-agent"].typeId,
      displayName: `${ADMIN_USER.name}'s Assistant`,
      category: "base",
      primaryDomainId: deptIds["Økonomi & Admin"],
      ownerUserId: adminUser.id,
    },
  });
  personalAiIds[ADMIN_USER.name] = adminAi.id;

  const memberAi = await prisma.entity.create({
    data: {
      operatorId,
      entityTypeId: types["ai-agent"].typeId,
      displayName: `${MEMBER_USER.name}'s Assistant`,
      category: "base",
      primaryDomainId: deptIds["Salg"],
      ownerUserId: memberUser.id,
    },
  });
  personalAiIds[MEMBER_USER.name] = memberAi.id;

  // ─── Layer 5: Placeholder Situation Types ─────────────────────────
  const sitTypeIds: Record<string, string> = {};

  for (const st of PLACEHOLDER_SITUATION_TYPES) {
    const sitType = await prisma.situationType.create({
      data: {
        operatorId,
        slug: st.slug,
        name: st.name,
        description: st.description,
        detectionLogic: JSON.stringify({ mode: "placeholder", note: "Full detection logic added by Prompt 3" }),
        autonomyLevel: "supervised",
        enabled: false, // Disabled until Prompt 3 fills in detection logic
      },
    });
    sitTypeIds[st.slug] = sitType.id;
  }

  // ─── Layer 6: Policy Rules ───────────────────────────────────────
  const threeWeeksAgo = daysAgo(21);
  await prisma.policyRule.createMany({
    data: POLICY_RULES.map((p) => ({
      operatorId,
      name: p.name,
      scope: p.scope,
      scopeTargetId: p.scopeTargetId ?? null,
      actionType: p.actionType,
      effect: p.effect,
      conditions: p.conditions ? JSON.stringify(p.conditions) : null,
      priority: p.priority,
      enabled: true,
      lastModifiedById: adminUser.id,
      lastModifiedAt: threeWeeksAgo,
    })),
  });

  // ─── Layer 7: Source Connectors ──────────────────────────────────
  const encConfig = encryptConfig({ simulated: true });
  const connectorIds: Record<string, string> = {};

  for (const c of SOURCE_CONNECTORS) {
    const connector = await prisma.sourceConnector.create({
      data: {
        operatorId,
        provider: c.provider,
        name: c.name,
        status: "active",
        config: encConfig,
        lastSyncAt: hoursAgo(c.hoursAgo),
        userId: c.assignedToUser ? userIds[c.assignedToUser] : null,
        healthStatus: "healthy",
        lastHealthCheck: hoursAgo(c.hoursAgo),
      },
    });
    connectorIds[c.provider] = connector.id;
  }

  // Slack channel mappings
  if (connectorIds["slack"]) {
    for (const m of SLACK_CHANNEL_MAPPINGS) {
      await prisma.slackChannelMapping.create({
        data: {
          operatorId,
          connectorId: connectorIds["slack"],
          channelId: m.channelId,
          channelName: m.channelName,
          domainId: deptIds[m.department],
        },
      });
    }
  }

  // ─── Layer 8: Notification Preferences ───────────────────────────
  await seedNotificationPreferences(adminUser.id, "admin");
  await seedNotificationPreferences(memberUser.id, "member");

  // ═══════════════════════════════════════════════════════════════════
  // Prompt 2 layers: Entity graph + RAG content + Activity signals
  // ═══════════════════════════════════════════════════════════════════

  // ─── Additional Entity Types ───────────────────────────────────────
  const p2Slugs = ["company", "contact", "deal", "invoice", "ticket"];
  for (const slug of p2Slugs) {
    types[slug] = await getTypeAndProps(operatorId, slug);
  }

  // ─── Additional Relationship Types ─────────────────────────────────
  const clientOfRelId = await ensureRelType(
    operatorId, "client-of", "Client Of",
    types["company"].typeId, types["organization"].typeId,
  );
  const partnerOfRelId = await ensureRelType(
    operatorId, "partner-of", "Partner Of",
    types["company"].typeId, types["organization"].typeId,
  );
  const contactCompanyRelId = await ensureRelType(
    operatorId, "contact-company", "Contact → Company",
    types["contact"].typeId, types["company"].typeId,
  );
  const dealContactRelId = await ensureRelType(
    operatorId, "deal-contact", "Deal → Contact",
    types["deal"].typeId, types["contact"].typeId,
  );
  const invoiceCompanyRelId = await ensureRelType(
    operatorId, "invoice-company", "Invoice → Company",
    types["invoice"].typeId, types["company"].typeId,
  );
  const ticketCompanyRelId = await ensureRelType(
    operatorId, "ticket-company", "Ticket → Company",
    types["ticket"].typeId, types["company"].typeId,
  );

  // ─── P2 Layer 1: External Companies ────────────────────────────────
  const companyIds: Record<string, string> = {};
  const companyProps = types["company"].props;

  for (const c of EXTERNAL_COMPANIES) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["company"].typeId,
        displayName: c.name,
        category: "external",
        sourceSystem: "hubspot",
        externalId: `hs_company_${c.domain.split(".")[0]}`,
      },
    });
    companyIds[c.name] = entity.id;

    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (companyProps["domain"]) pvData.push({ entityId: entity.id, propertyId: companyProps["domain"], value: c.domain });
    if (companyProps["industry"]) pvData.push({ entityId: entity.id, propertyId: companyProps["industry"], value: c.industry });
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    // Company → CompanyHQ relationship
    const relId = c.type === "partner" ? partnerOfRelId : clientOfRelId;
    await prisma.relationship.create({
      data: {
        relationshipTypeId: relId,
        fromEntityId: entity.id,
        toEntityId: deptIds["CompanyHQ"],
        metadata: JSON.stringify({ relationship: c.relationship }),
      },
    });
  }

  // ─── P2 Layer 2: CRM Contacts ─────────────────────────────────────
  const contactIds: Record<string, string> = {};
  const contactProps = types["contact"].props;

  for (const c of CRM_CONTACTS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["contact"].typeId,
        displayName: c.name,
        category: "digital",
        sourceSystem: "hubspot",
        externalId: `hs_contact_${c.email.split("@")[0].replace(/\./g, "_")}`,
      },
    });
    contactIds[c.name] = entity.id;

    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (contactProps["email"]) pvData.push({ entityId: entity.id, propertyId: contactProps["email"], value: c.email });
    if (contactProps["phone"]) pvData.push({ entityId: entity.id, propertyId: contactProps["phone"], value: c.phone });
    if (contactProps["job-title"]) pvData.push({ entityId: entity.id, propertyId: contactProps["job-title"], value: c.title });
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    // Contact → Company
    if (companyIds[c.company]) {
      await prisma.relationship.create({
        data: {
          relationshipTypeId: contactCompanyRelId,
          fromEntityId: entity.id,
          toEntityId: companyIds[c.company],
        },
      });
    }

    // Route to Salg department
    await prisma.relationship.create({
      data: {
        relationshipTypeId: deptMemberRelId,
        fromEntityId: entity.id,
        toEntityId: deptIds["Salg"],
      },
    });
  }

  // ─── P2 Layer 3: Deals ─────────────────────────────────────────────
  const dealIds: Record<string, string> = {};
  const dealProps = types["deal"].props;

  for (const d of DEALS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["deal"].typeId,
        displayName: d.name,
        category: "digital",
        sourceSystem: "hubspot",
        externalId: `hs_deal_${d.name.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 40)}`,
        metadata: JSON.stringify({ owner: d.owner, createdAt: daysAgo(d.daysAgoCreated).toISOString() }),
      },
    });
    dealIds[d.name] = entity.id;

    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (dealProps["amount"]) pvData.push({ entityId: entity.id, propertyId: dealProps["amount"], value: String(d.amount) });
    if (dealProps["stage"]) pvData.push({ entityId: entity.id, propertyId: dealProps["stage"], value: d.stage });
    if (dealProps["pipeline"]) pvData.push({ entityId: entity.id, propertyId: dealProps["pipeline"], value: "default" });
    if (d.closeDateDaysFromNow !== undefined && dealProps["close-date"]) {
      pvData.push({ entityId: entity.id, propertyId: dealProps["close-date"], value: daysAgo(-d.closeDateDaysFromNow).toISOString().slice(0, 10) });
    }
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    // Deal → key contact of company
    const company = EXTERNAL_COMPANIES.find((ec) => ec.name === d.company);
    if (company && contactIds[company.keyContact]) {
      await prisma.relationship.create({
        data: {
          relationshipTypeId: dealContactRelId,
          fromEntityId: entity.id,
          toEntityId: contactIds[company.keyContact],
        },
      });
    }

    // Route to Salg
    await prisma.relationship.create({
      data: {
        relationshipTypeId: deptMemberRelId,
        fromEntityId: entity.id,
        toEntityId: deptIds["Salg"],
      },
    });
  }

  // ─── P2 Layer 4: Invoices ──────────────────────────────────────────
  const invoiceIds: Record<string, string> = {};
  const invProps = types["invoice"].props;

  for (const inv of INVOICES) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["invoice"].typeId,
        displayName: inv.ref,
        category: "digital",
        sourceSystem: "e-conomic",
        externalId: `eco_inv_${inv.ref.toLowerCase().replace(/-/g, "_")}`,
      },
    });
    invoiceIds[inv.ref] = entity.id;

    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (invProps["amount"]) pvData.push({ entityId: entity.id, propertyId: invProps["amount"], value: String(inv.amount) });
    if (invProps["status"]) pvData.push({ entityId: entity.id, propertyId: invProps["status"], value: inv.status });
    if (invProps["currency"]) pvData.push({ entityId: entity.id, propertyId: invProps["currency"], value: "DKK" });
    if (invProps["due-date"]) pvData.push({ entityId: entity.id, propertyId: invProps["due-date"], value: daysAgo(inv.dueDateDaysAgo).toISOString().slice(0, 10) });
    if (inv.paidDateDaysAgo !== undefined) {
      if (invProps["paid-date"]) pvData.push({ entityId: entity.id, propertyId: invProps["paid-date"], value: daysAgo(inv.paidDateDaysAgo).toISOString().slice(0, 10) });
      if (invProps["amount-paid"]) pvData.push({ entityId: entity.id, propertyId: invProps["amount-paid"], value: String(inv.amount) });
    }
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    // Invoice → Company
    if (companyIds[inv.company]) {
      await prisma.relationship.create({
        data: {
          relationshipTypeId: invoiceCompanyRelId,
          fromEntityId: entity.id,
          toEntityId: companyIds[inv.company],
        },
      });
    }

    // Route to Økonomi & Admin
    await prisma.relationship.create({
      data: {
        relationshipTypeId: deptMemberRelId,
        fromEntityId: entity.id,
        toEntityId: deptIds["Økonomi & Admin"],
      },
    });
  }

  // ─── P2 Layer 5: Tickets ───────────────────────────────────────────
  const ticketIds: Record<string, string> = {};
  const tkProps = types["ticket"].props;

  for (const tk of TICKETS) {
    const entity = await prisma.entity.create({
      data: {
        operatorId,
        entityTypeId: types["ticket"].typeId,
        displayName: `${tk.ref}: ${tk.subject}`,
        category: "digital",
        metadata: JSON.stringify({ company: tk.company }),
      },
    });
    ticketIds[tk.ref] = entity.id;

    const pvData: Array<{ entityId: string; propertyId: string; value: string }> = [];
    if (tkProps["number"]) pvData.push({ entityId: entity.id, propertyId: tkProps["number"], value: tk.ref });
    if (tkProps["subject"]) pvData.push({ entityId: entity.id, propertyId: tkProps["subject"], value: tk.subject });
    if (tkProps["status"]) pvData.push({ entityId: entity.id, propertyId: tkProps["status"], value: tk.status });
    if (tkProps["priority"]) pvData.push({ entityId: entity.id, propertyId: tkProps["priority"], value: tk.priority });
    if (tkProps["assignee"]) pvData.push({ entityId: entity.id, propertyId: tkProps["assignee"], value: tk.assignedTo });
    if (tkProps["created-date"]) pvData.push({ entityId: entity.id, propertyId: tkProps["created-date"], value: daysAgo(tk.daysAgoCreated).toISOString().slice(0, 10) });
    if (pvData.length > 0) await prisma.propertyValue.createMany({ data: pvData });

    // Ticket → Company
    if (companyIds[tk.company]) {
      await prisma.relationship.create({
        data: {
          relationshipTypeId: ticketCompanyRelId,
          fromEntityId: entity.id,
          toEntityId: companyIds[tk.company],
        },
      });
    }

    // Route to Levering
    await prisma.relationship.create({
      data: {
        relationshipTypeId: deptMemberRelId,
        fromEntityId: entity.id,
        toEntityId: deptIds["Levering"],
      },
    });
  }

  // ─── P2 Layer 6: Content Chunks with Embeddings ────────────────────
  console.log("[demo-seed] Creating content chunks with live embeddings...");

  // Map connector providers to connector IDs
  const providerToConnector: Record<string, string | undefined> = {
    gmail: connectorIds["gmail"],
    "google-calendar": connectorIds["google-calendar"],
    "google-drive": connectorIds["google-drive"],
    hubspot: connectorIds["hubspot"],
    "e-conomic": connectorIds["e-conomic"],
    slack: connectorIds["slack"],
  };

  const EMBED_BATCH = 20;
  const allTexts = CONTENT_CHUNKS.map((c) => c.content);
  const allEmbeddings: (number[] | null)[] = [];

  for (let i = 0; i < allTexts.length; i += EMBED_BATCH) {
    const batchNum = Math.floor(i / EMBED_BATCH) + 1;
    const totalBatches = Math.ceil(allTexts.length / EMBED_BATCH);
    console.log(`[demo-seed] Embedding batch ${batchNum}/${totalBatches}...`);

    const batch = allTexts.slice(i, i + EMBED_BATCH);
    const embeddings = await embedChunks(batch);
    allEmbeddings.push(...embeddings);
  }

  let chunkCount = 0;
  for (let i = 0; i < CONTENT_CHUNKS.length; i++) {
    const c = CONTENT_CHUNKS[i];
    const deptId = c.department ? deptIds[c.department] : undefined;

    const created = await prisma.contentChunk.create({
      data: {
        operatorId,
        connectorId: providerToConnector[c.connectorProvider] ?? null,
        userId: c.personal ? adminUser.id : null,
        sourceType: c.sourceType,
        sourceId: `demo-${c.sourceType}-${i}`,
        domainIds: deptId ? JSON.stringify([deptId]) : null,
        chunkIndex: 0,
        content: c.content,
        tokenCount: Math.round(c.content.length / 4),
        metadata: c.metadata ? JSON.stringify(c.metadata) : null,
      },
      select: { id: true },
    });

    // Write embedding if available
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
  console.log(`[demo-seed] Created ${chunkCount} content chunks`);

  // ═══════════════════════════════════════════════════════════════════
  // Prompt 3 layers: Situation Types + Action Capabilities + Situations
  // ═══════════════════════════════════════════════════════════════════

  // ─── P3 Layer 1: Update Situation Types ────────────────────────────
  for (const stu of SITUATION_TYPE_UPDATES) {
    if (sitTypeIds[stu.slug]) {
      // Update existing placeholder
      await prisma.situationType.update({
        where: { id: sitTypeIds[stu.slug] },
        data: {
          name: stu.name,
          description: stu.description,
          detectionLogic: JSON.stringify(stu.detectionLogic),
          autonomyLevel: stu.autonomyLevel,
          scopeEntityId: deptIds[stu.scopeDepartment] ?? null,
          enabled: stu.enabled,
          detectedCount: stu.detectedCount,
          confirmedCount: stu.confirmedCount,
          dismissedCount: stu.dismissedCount,
        },
      });
    } else {
      // Create new type
      const newType = await prisma.situationType.create({
        data: {
          operatorId,
          slug: stu.slug,
          name: stu.name,
          description: stu.description,
          detectionLogic: JSON.stringify(stu.detectionLogic),
          autonomyLevel: stu.autonomyLevel,
          scopeEntityId: deptIds[stu.scopeDepartment] ?? null,
          enabled: stu.enabled,
          detectedCount: stu.detectedCount,
          confirmedCount: stu.confirmedCount,
          dismissedCount: stu.dismissedCount,
        },
      });
      sitTypeIds[stu.slug] = newType.id;
    }
  }
  console.log(`[demo-seed] Updated/created ${SITUATION_TYPE_UPDATES.length} situation types`);

  // ─── P3 Layer 2: Action Capabilities ───────────────────────────────
  const capabilityIds: Record<string, string> = {};
  for (const cap of ACTION_CAPABILITIES) {
    const ac = await prisma.actionCapability.create({
      data: {
        operatorId,
        slug: cap.slug,
        name: cap.name,
        description: cap.description,
        connectorId: cap.connectorProvider ? connectorIds[cap.connectorProvider] ?? null : null,
        enabled: true,
        writeBackStatus: "enabled",
      },
    });
    capabilityIds[cap.slug] = ac.id;
  }
  console.log(`[demo-seed] Created ${ACTION_CAPABILITIES.length} action capabilities`);

  // ─── P3 Layer 3: Situation Wiki Pages ──────────────────────────────
  const allEntityIds: Record<string, string> = { ...memberIds, ...contactIds, ...companyIds, ...dealIds, ...invoiceIds, ...ticketIds };

  function hoursAgoDate(h: number): Date {
    return new Date(Date.now() - h * 3_600_000);
  }

  function daysFromNow(d: number): Date {
    return new Date(Date.now() + d * 86_400_000);
  }

  let situationCount = 0;
  for (const s of SITUATIONS) {
    const triggerEntityId = allEntityIds[s.triggerEntityName] ?? null;

    const createdAt = hoursAgoDate(s.hoursAgo);
    await prisma.knowledgePage.create({
      data: {
        operatorId,
        pageType: "situation_instance",
        scope: "operator",
        subjectEntityId: triggerEntityId,
        title: s.reasoning?.analysis?.slice(0, 80) ?? `Situation: ${s.typeSlug}`,
        slug: `demo-situation-${s.typeSlug}-${situationCount}`,
        content: `## Analysis\n\n${JSON.stringify(s.reasoning ?? {})}\n\n## Context\n\n${JSON.stringify(s.contextSnapshot ?? {})}`,
        contentTokens: 100,
        properties: {
          situation_id: `demo-sit-${situationCount}`,
          status: s.status,
          severity: 0.5,
          confidence: s.confidence,
          situation_type: s.typeSlug,
          detected_at: createdAt.toISOString(),
          source: "demo",
          outcome: s.outcome ?? null,
        },
        confidence: s.confidence,
        status: s.status === "resolved" ? "published" : "draft",
        sourceCount: 1,
        synthesisPath: "demo",
        synthesizedByModel: "demo",
        lastSynthesizedAt: createdAt,
        createdAt,
      },
    });

    situationCount++;
  }
  console.log(`[demo-seed] Created ${situationCount} situation wiki pages`);

  // ═══════════════════════════════════════════════════════════════════
  // Prompt 4 layers: Initiatives, Insights, etc.
  // ═══════════════════════════════════════════════════════════════════

  // ─── P4 Layer 1: Initiatives ──────────────────────────────────────
  console.log("[demo-seed] Creating initiatives...");

  for (const init of INITIATIVES) {
    // Resolve AI entity ID
    const aiEntityId = init.aiEntityType === "hq"
      ? hqAiId
      : deptAiIds[init.aiEntityDept ?? ""] ?? hqAiId;

    await prisma.initiative.create({
      data: {
        operatorId,
        aiEntityId,
        proposalType: "general",
        triggerSummary: init.rationale.slice(0, 120),
        evidence: [],
        proposal: {},
        status: init.status,
        rationale: init.rationale,
        impactAssessment: init.impactAssessment ?? null,
      },
    });
  }

  // ─── P4 Layer 2: Operational Insights ─────────────────────────────
  console.log("[demo-seed] Creating operational insights...");
  for (const ins of OPERATIONAL_INSIGHTS) {
    const aiEntityId = ins.aiEntityType === "hq"
      ? hqAiId
      : deptAiIds[ins.aiEntityDept ?? ""] ?? hqAiId;

    await prisma.operationalInsight.create({
      data: {
        operatorId,
        aiEntityId,
        domainId: ins.department ? deptIds[ins.department] ?? null : null,
        insightType: ins.insightType,
        description: ins.description,
        evidence: JSON.stringify(ins.evidence),
        confidence: ins.confidence,
        promptModification: ins.promptModification ?? null,
        shareScope: ins.shareScope,
        status: ins.invalidated ? "invalidated" : "active",
        createdAt: daysAgo(ins.daysAgoCreated),
      },
    });
  }

  // ─── P4 Layer 7: Notifications ────────────────────────────────────
  console.log("[demo-seed] Creating notifications...");
  for (const n of NOTIFICATIONS) {
    await prisma.notification.create({
      data: {
        operatorId,
        userId: adminUser.id,
        title: n.title,
        body: n.body,
        sourceType: n.sourceType,
        read: n.read,
        createdAt: hoursAgoDate(n.hoursAgo),
      },
    });
  }

  // ─── P4 Layer 8: Copilot Sessions ────────────────────────────────
  console.log("[demo-seed] Creating copilot chat history...");
  for (const session of COPILOT_SESSIONS) {
    for (const msg of session.messages) {
      await prisma.copilotMessage.create({
        data: {
          operatorId,
          userId: adminUser.id,
          sessionId: session.sessionId,
          role: msg.role,
          content: msg.content,
          apiCostCents: msg.apiCostCents ?? null,
          createdAt: hoursAgoDate(session.hoursAgo),
        },
      });
    }
  }

  console.log("[demo-seed] Phase 3+4 complete.");

  // ─── Living Research (replaces background synthesis) ─────────────
  try {
    await enqueueWorkerJob("run_living_research", operatorId, { operatorId });
    console.log(`[seed] Living research job enqueued for ${operatorId}`);
  } catch (err) {
    console.error(`[seed] Failed to enqueue living research:`, err);
  }

  // ─── Return Stats ────────────────────────────────────────────────
  return {
    success: true,
    operator: { id: operatorId, companyName: COMPANY.name },
    credentials: {
      admin: { email: ADMIN_USER.email, password: ADMIN_USER.password },
      member: { email: MEMBER_USER.email, password: MEMBER_USER.password },
    },
    stats: {
      domains: DEPARTMENTS.length,
      teamMembers: TEAM_MEMBERS.length,
      users: 2,
      aiEntities: {
        hqAi: 1,
        departmentAis: Object.keys(deptAiIds).length,
        personalAis: Object.keys(personalAiIds).length,
      },
      situationTypes: PLACEHOLDER_SITUATION_TYPES.length,
      policyRules: POLICY_RULES.length,
      connectors: SOURCE_CONNECTORS.length,
      slackChannelMappings: SLACK_CHANNEL_MAPPINGS.length,
      companies: EXTERNAL_COMPANIES.length,
      contacts: CRM_CONTACTS.length,
      deals: DEALS.length,
      invoices: INVOICES.length,
      tickets: TICKETS.length,
      contentChunks: chunkCount,
      situationTypesUpdated: SITUATION_TYPE_UPDATES.length,
      actionCapabilities: ACTION_CAPABILITIES.length,
      situationPages: situationCount,
      initiatives: INITIATIVES.length,
      insights: OPERATIONAL_INSIGHTS.length,
      notifications: NOTIFICATIONS.length,
      copilotSessions: COPILOT_SESSIONS.length,
    },
    ids: {
      hqAiId,
      deptIds,
      deptAiIds,
      memberIds,
      userIds,
      personalAiIds,
      sitTypeIds,
      connectorIds,
      companyIds,
      contactIds,
      dealIds,
      invoiceIds,
      ticketIds,
    },
  };
}
