import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestContent } from "@/lib/content-pipeline";
import { requireSuperadmin, getOperatorIdFromBody, AuthError, formatTimestamp } from "@/lib/test-harness-helpers";

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSuperadmin();
    const body = await req.json().catch(() => ({}));
    const operatorId = getOperatorIdFromBody(body, session.operatorId);

    // 1. Verify operator exists and has entities
    const departments = await prisma.entity.findMany({
      where: { operatorId, category: "foundational", status: "active" },
      select: { id: true, displayName: true },
      take: 5,
    });

    if (departments.length === 0) {
      return NextResponse.json(
        { error: "Operator has no departments. Create a test company first via /api/admin/create-test-company." },
        { status: 400 },
      );
    }

    const baseEntities = await prisma.entity.findMany({
      where: { operatorId, category: { in: ["base", "external", "digital"] }, status: "active" },
      select: {
        id: true,
        displayName: true,
        category: true,
        entityType: { select: { slug: true } },
        propertyValues: {
          where: { property: { identityRole: "email" } },
          select: { value: true },
          take: 1,
        },
      },
      take: 20,
    });

    if (baseEntities.length === 0) {
      return NextResponse.json(
        { error: "Operator has no base/external/digital entities. Create a test company first." },
        { status: 400 },
      );
    }

    // Pick entities for seeding
    const contactEntity = baseEntities.find((e) => e.entityType.slug === "contact" || e.category === "external") ?? baseEntities[0];
    const personEntity = baseEntities.find((e) => e.entityType.slug === "team-member" || e.category === "base") ?? baseEntities[0];
    const secondContact = baseEntities.find((e) => e.id !== contactEntity.id && (e.entityType.slug === "contact" || e.category === "external")) ?? contactEntity;

    const deptId = departments[0].id;
    const deptId2 = departments[1]?.id ?? deptId;
    const deptIds = [deptId];
    const deptIds2 = [deptId2];

    const contactEmail = contactEntity.propertyValues[0]?.value ?? "client@external.com";
    const personEmail = personEntity.propertyValues[0]?.value ?? "team@company.com";

    const results = {
      contentChunks: 0,
      activitySignals: 0,
      situationTypes: 0,
      ids: {
        departments: departments.map((d) => ({ id: d.id, name: d.displayName })),
        entities: {
          contact: { id: contactEntity.id, name: contactEntity.displayName },
          person: { id: personEntity.id, name: personEntity.displayName },
        },
        contentChunkSourceIds: [] as string[],
        activitySignalIds: [] as string[],
        situationTypeIds: [] as string[],
      },
    };

    // 2. Create ContentChunks via real ingestContent()
    const contentItems = [
      // 3 received emails
      {
        sourceType: "email",
        sourceId: `test-harness-email-received-1-${Date.now()}`,
        content: `Hi team,\n\nI wanted to follow up on the Q3 report that was due last week. Our board meeting is scheduled for this Friday and we need the updated numbers before then. Specifically, I need the revenue breakdown by product line and the customer acquisition costs.\n\nCan you prioritize this? The CFO is asking for it directly.\n\nBest regards,\n${contactEntity.displayName}`,
        entityId: contactEntity.id,
        departmentIds: deptIds,
        metadata: { subject: "Q3 Report - Urgent Request", from: contactEmail, to: personEmail, direction: "received", threadId: "thread-q3-report", isAutomated: false, date: daysAgo(1).toISOString() },
      },
      {
        sourceType: "email",
        sourceId: `test-harness-email-received-2-${Date.now()}`,
        content: `Hello,\n\nUnfortunately, we're experiencing a delay with the component shipment for order #4521. The expected delivery date has been pushed from March 10 to March 24. This may impact your production schedule.\n\nWe're working with our logistics partner to expedite. I'll update you if anything changes.\n\nRegards,\nSupplier Relations Team`,
        entityId: secondContact.id,
        departmentIds: deptIds2,
        metadata: { subject: "Shipment Delay - Order #4521", from: "supplier@logistics.com", to: personEmail, direction: "received", threadId: "thread-shipment-delay", isAutomated: false, date: daysAgo(2).toISOString() },
      },
      {
        sourceType: "email",
        sourceId: `test-harness-email-received-3-${Date.now()}`,
        content: `Hi there,\n\nJust confirming our meeting next Tuesday at 2pm to discuss the partnership roadmap for H2. I'll bring the updated projections and we can align on the joint go-to-market strategy.\n\nLooking forward to it!\n\nBest,\nPartner Team`,
        entityId: contactEntity.id,
        departmentIds: deptIds,
        metadata: { subject: "Partnership Roadmap Meeting Confirmation", from: "partner@bizpartner.com", to: personEmail, direction: "received", threadId: "thread-partnership-meeting", isAutomated: false, date: daysAgo(0).toISOString() },
      },
      // 2 sent emails (should be skipped by content detection)
      {
        sourceType: "email",
        sourceId: `test-harness-email-sent-1-${Date.now()}`,
        content: `Hi ${contactEntity.displayName},\n\nThanks for the reminder. I'm pulling together the Q3 numbers now and will have the report ready by Wednesday EOD. I'll include the product line breakdown and CAC metrics as requested.\n\nBest,\nTeam`,
        entityId: contactEntity.id,
        departmentIds: deptIds,
        metadata: { subject: "Re: Q3 Report - Urgent Request", from: personEmail, to: contactEmail, direction: "sent", threadId: "thread-q3-report", isAutomated: false, date: daysAgo(0).toISOString() },
      },
      {
        sourceType: "email",
        sourceId: `test-harness-email-sent-2-${Date.now()}`,
        content: `Hi there,\n\nFollowing up on our conversation last week about your digital transformation needs. I'd love to schedule a 30-minute call to walk through how our platform could help.\n\nWould next Thursday work for you?\n\nBest regards,\nSales Team`,
        entityId: null,
        departmentIds: deptIds,
        metadata: { subject: "Follow-up: Digital Transformation Solutions", from: personEmail, to: "prospect@newclient.com", direction: "sent", threadId: "thread-prospect-followup", isAutomated: false, date: daysAgo(1).toISOString() },
      },
      // 2 Slack messages
      {
        sourceType: "slack_message",
        sourceId: `test-harness-slack-1-${Date.now()}`,
        content: `Hey @channel, I need approval on the updated Q1 budget allocation. We're proposing to shift $15K from the marketing line to engineering tooling. The current marketing spend is underutilized and the eng team needs upgraded CI/CD infrastructure. Doc is linked in the thread - can someone from finance review by EOD?`,
        entityId: personEntity.id,
        departmentIds: deptIds,
        metadata: { channel: "#finance-approvals", authorEmail: personEmail, authorName: personEntity.displayName },
      },
      {
        sourceType: "slack_message",
        sourceId: `test-harness-slack-2-${Date.now()}`,
        content: `Heads up everyone - v2.4 release is scheduled for next Wednesday. Key changes:\n- New dashboard analytics\n- Performance improvements (30% faster page loads)\n- Bug fixes for the notification system\n\nPlease make sure your PRs are merged by Monday EOD for inclusion.`,
        entityId: personEntity.id,
        departmentIds: deptIds2,
        metadata: { channel: "#engineering", authorEmail: personEmail, authorName: personEntity.displayName },
      },
      // 1 Drive document
      {
        sourceType: "drive_doc",
        sourceId: `test-harness-drive-1-${Date.now()}`,
        content: `QUARTERLY BUSINESS REVIEW - Q4 2025\n\nRevenue: $2.4M (+12% QoQ)\nNew Customers: 18 (+28% QoQ)\nChurn Rate: 2.1% (-0.3pp QoQ)\nNPS Score: 67 (+5 QoQ)\n\nKey Highlights:\n- Enterprise segment grew 45% driven by 3 large deals\n- Self-serve ARR crossed $500K milestone\n- Average deal size increased to $18K from $14K\n\nChallenges:\n- Sales cycle lengthened to 45 days (from 38)\n- Support ticket volume up 22% with same team size\n- Two key engineering hires still open after 60 days`,
        entityId: null,
        departmentIds: deptIds,
        metadata: { fileName: "Q4 2025 Business Review.gdoc", mimeType: "application/vnd.google-apps.document", lastModifiedBy: personEmail },
      },
    ];

    for (const item of contentItems) {
      const result = await ingestContent({
        operatorId,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        content: item.content,
        entityId: item.entityId ?? undefined,
        departmentIds: item.departmentIds,
        metadata: item.metadata,
      });
      results.contentChunks += result.chunksCreated;
      results.ids.contentChunkSourceIds.push(item.sourceId);
    }

    // 3. Create ActivitySignals
    const actorId = personEntity.id;
    const targetId = contactEntity.id;
    const target2Id = secondContact.id;

    const signals = [
      // 5 email_received spread over 14 days
      { signalType: "email_received", actorEntityId: actorId, targetEntityIds: [targetId], departmentIds: deptIds, metadata: { subject: "Q3 Report Request", response_time_ms: 3600000 }, occurredAt: daysAgo(1) },
      { signalType: "email_received", actorEntityId: actorId, targetEntityIds: [target2Id], departmentIds: deptIds2, metadata: { subject: "Shipment Update" }, occurredAt: daysAgo(3) },
      { signalType: "email_received", actorEntityId: actorId, targetEntityIds: [targetId], departmentIds: deptIds, metadata: { subject: "Partnership Discussion" }, occurredAt: daysAgo(5) },
      { signalType: "email_received", actorEntityId: actorId, targetEntityIds: [target2Id], departmentIds: deptIds2, metadata: { subject: "Invoice Follow-up" }, occurredAt: daysAgo(8) },
      { signalType: "email_received", actorEntityId: actorId, targetEntityIds: [targetId], departmentIds: deptIds, metadata: { subject: "Contract Review" }, occurredAt: daysAgo(12) },
      // 3 email_sent
      { signalType: "email_sent", actorEntityId: actorId, targetEntityIds: [targetId], departmentIds: deptIds, metadata: { subject: "Re: Q3 Report" }, occurredAt: daysAgo(0) },
      { signalType: "email_sent", actorEntityId: actorId, targetEntityIds: [target2Id], departmentIds: deptIds2, metadata: { subject: "Re: Shipment" }, occurredAt: daysAgo(2) },
      { signalType: "email_sent", actorEntityId: actorId, targetEntityIds: [targetId], departmentIds: deptIds, metadata: { subject: "Proposal Draft" }, occurredAt: daysAgo(7) },
      // 3 meeting_held
      { signalType: "meeting_held", actorEntityId: actorId, targetEntityIds: [targetId, target2Id], departmentIds: deptIds, metadata: { attendees: 4, durationMinutes: 60, title: "Weekly Sync" }, occurredAt: daysAgo(2) },
      { signalType: "meeting_held", actorEntityId: actorId, targetEntityIds: [targetId], departmentIds: deptIds, metadata: { attendees: 2, durationMinutes: 30, title: "1:1 Review" }, occurredAt: daysAgo(6) },
      { signalType: "meeting_held", actorEntityId: actorId, targetEntityIds: [target2Id], departmentIds: deptIds2, metadata: { attendees: 3, durationMinutes: 45, title: "Supplier Sync" }, occurredAt: daysAgo(10) },
      // 2 doc_edited
      { signalType: "doc_edited", actorEntityId: actorId, targetEntityIds: null, departmentIds: deptIds, metadata: { fileName: "Q4 Business Review.gdoc" }, occurredAt: daysAgo(1) },
      { signalType: "doc_edited", actorEntityId: actorId, targetEntityIds: null, departmentIds: deptIds2, metadata: { fileName: "Engineering Roadmap.gdoc" }, occurredAt: daysAgo(4) },
      // 2 slack_message
      { signalType: "slack_message", actorEntityId: actorId, targetEntityIds: null, departmentIds: deptIds, metadata: { channel: "#finance-approvals" }, occurredAt: daysAgo(0) },
      { signalType: "slack_message", actorEntityId: actorId, targetEntityIds: null, departmentIds: deptIds2, metadata: { channel: "#engineering" }, occurredAt: daysAgo(1) },
      // 1 meeting_frequency
      { signalType: "meeting_frequency", actorEntityId: actorId, targetEntityIds: [targetId], departmentIds: deptIds, metadata: { frequency: "weekly", count: 4, period: "last_30_days" }, occurredAt: daysAgo(0) },
    ];

    for (const sig of signals) {
      const created = await prisma.activitySignal.create({
        data: {
          operatorId,
          signalType: sig.signalType,
          actorEntityId: sig.actorEntityId,
          targetEntityIds: sig.targetEntityIds ? JSON.stringify(sig.targetEntityIds) : null,
          departmentIds: JSON.stringify(sig.departmentIds),
          metadata: JSON.stringify(sig.metadata),
          occurredAt: sig.occurredAt,
        },
      });
      results.activitySignals++;
      results.ids.activitySignalIds.push(created.id);
    }

    // 4. Ensure SituationTypes exist
    const existingTypes = await prisma.situationType.findMany({
      where: { operatorId },
      select: { id: true, slug: true },
    });

    if (existingTypes.length < 3) {
      const typesToCreate = [];

      // Structured detection type
      if (!existingTypes.find((t) => t.slug === "test-overdue-invoice")) {
        typesToCreate.push({
          operatorId,
          slug: "test-overdue-invoice",
          name: "Overdue Invoice",
          description: "Detects invoices past their due date that haven't been paid.",
          detectionLogic: JSON.stringify({
            mode: "structured",
            structured: {
              entityType: "invoice",
              signals: [
                { field: "status", condition: "equals", value: "overdue" },
                { field: "total-amount", condition: "greater_than", threshold: 0 },
              ],
            },
          }),
          autonomyLevel: "supervised",
          enabled: true,
        });
      }

      // Natural language detection type
      if (!existingTypes.find((t) => t.slug === "test-deal-at-risk")) {
        typesToCreate.push({
          operatorId,
          slug: "test-deal-at-risk",
          name: "Deal At Risk",
          description: "Identifies deals showing signs of going cold — no recent activity, declining engagement, or delayed milestones.",
          detectionLogic: JSON.stringify({
            mode: "natural",
            naturalLanguage: "A deal is at risk when there has been no email or meeting activity with the deal contact in the last 14 days, or the deal stage has not advanced in 30 days.",
          }),
          autonomyLevel: "supervised",
          enabled: true,
        });
      }

      // Content detection type (mimics what content-situation-detector creates)
      if (!existingTypes.find((t) => t.slug.startsWith("action-required-"))) {
        const deptSlug = departments[0].displayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        typesToCreate.push({
          operatorId,
          slug: `action-required-${deptSlug}`,
          name: "Action Required",
          description: "Communication-detected situations requiring action from team members in this department.",
          detectionLogic: JSON.stringify({
            mode: "content",
            description: "Detected from incoming communications",
          }),
          autonomyLevel: "supervised",
          scopeEntityId: deptId,
          enabled: true,
        });
      }

      for (const typeData of typesToCreate) {
        const created = await prisma.situationType.create({ data: typeData });
        results.situationTypes++;
        results.ids.situationTypeIds.push(created.id);
      }
    }

    return NextResponse.json({
      success: true,
      operatorId,
      summary: {
        contentChunksIngested: results.contentChunks,
        activitySignalsCreated: results.activitySignals,
        situationTypesCreated: results.situationTypes,
      },
      ids: results.ids,
      timestamp: formatTimestamp(new Date()),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[test-harness/seed]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal error" }, { status: 500 });
  }
}
