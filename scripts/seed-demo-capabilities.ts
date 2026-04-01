import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Seeds fake connectors + ActionCapabilities for test operators.
 * These allow the reasoning engine to propose real action plans
 * with previews, without requiring OAuth tokens.
 */

const DEMO_CONNECTORS = [
  { provider: "google", name: "Gmail (Demo)" },
  { provider: "slack", name: "Slack (Demo)" },
];

const DEMO_CAPABILITIES = [
  // Gmail
  {
    name: "send_email",
    description: "Send an email to a recipient with subject and body",
    provider: "google",
    inputSchema: JSON.stringify({
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body (plain text or HTML)" },
        cc: { type: "string", description: "CC recipients (optional)" },
      },
      required: ["to", "subject", "body"],
    }),
    sideEffects: JSON.stringify(["sends_email"]),
  },
  {
    name: "reply_to_email",
    description: "Reply to an existing email thread",
    provider: "google",
    inputSchema: JSON.stringify({
      type: "object",
      properties: {
        threadId: { type: "string", description: "Email thread to reply to" },
        body: { type: "string", description: "Reply body" },
      },
      required: ["threadId", "body"],
    }),
    sideEffects: JSON.stringify(["sends_email"]),
  },
  // Calendar
  {
    name: "create_calendar_event",
    description: "Create a calendar event or meeting with attendees",
    provider: "google",
    inputSchema: JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", description: "Event title" },
        startTime: { type: "string", description: "Start time (ISO 8601)" },
        endTime: { type: "string", description: "End time (ISO 8601)" },
        attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses" },
        description: { type: "string", description: "Event description" },
        location: { type: "string", description: "Event location" },
      },
      required: ["title", "startTime", "endTime"],
    }),
    sideEffects: JSON.stringify(["creates_calendar_event", "sends_invitation"]),
  },
  // Drive
  {
    name: "create_document",
    description: "Create a new document in Google Drive",
    provider: "google",
    inputSchema: JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", description: "Document title" },
        content: { type: "string", description: "Document content" },
        folderId: { type: "string", description: "Destination folder (optional)" },
      },
      required: ["title", "content"],
    }),
    sideEffects: JSON.stringify(["creates_document"]),
  },
  // Slack
  {
    name: "send_slack_message",
    description: "Send a message to a Slack channel or person",
    provider: "slack",
    inputSchema: JSON.stringify({
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel name or person" },
        message: { type: "string", description: "Message text" },
      },
      required: ["channel", "message"],
    }),
    sideEffects: JSON.stringify(["sends_message"]),
  },
  // Internal capabilities (no connector needed)
  {
    name: "create_task",
    description: "Create a task or to-do item assigned to a team member",
    provider: "internal",
    inputSchema: JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        assignee: { type: "string", description: "Person to assign the task to" },
        dueDate: { type: "string", description: "Due date (ISO 8601)" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Task priority" },
      },
      required: ["title"],
    }),
    sideEffects: JSON.stringify(["creates_task"]),
  },
  {
    name: "create_reminder",
    description: "Create a follow-up reminder for a future date",
    provider: "internal",
    inputSchema: JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", description: "Reminder title" },
        date: { type: "string", description: "Reminder date (ISO 8601)" },
        note: { type: "string", description: "Additional context" },
      },
      required: ["title", "date"],
    }),
    sideEffects: JSON.stringify(["creates_reminder"]),
  },
];

async function main() {
  // Find test operators
  let testOperators = await prisma.operator.findMany({
    where: { isTestOperator: true },
    select: { id: true, companyName: true },
  });

  if (testOperators.length === 0) {
    console.log("No test operators found. Trying all operators...");
    testOperators = await prisma.operator.findMany({
      select: { id: true, companyName: true },
    });
    if (testOperators.length === 0) {
      console.log("No operators found at all.");
      return;
    }
  }

  for (const op of testOperators) {
    console.log(`\nSeeding demo capabilities for ${op.companyName ?? op.id}...`);

    // Create fake connectors
    const connectorMap = new Map<string, string>(); // provider -> connectorId

    for (const conn of DEMO_CONNECTORS) {
      const existing = await prisma.sourceConnector.findFirst({
        where: { operatorId: op.id, provider: conn.provider, deletedAt: null },
      });

      if (existing) {
        connectorMap.set(conn.provider, existing.id);
        console.log(`  Connector ${conn.name} already exists`);
      } else {
        const created = await prisma.sourceConnector.create({
          data: {
            operatorId: op.id,
            provider: conn.provider,
            name: conn.name,
            status: "active",
            config: JSON.stringify({ demo: true, note: "Fake connector for demo — no real OAuth" }),
          },
        });
        connectorMap.set(conn.provider, created.id);
        console.log(`  Created connector: ${conn.name}`);
      }
    }

    // Create capabilities
    for (const cap of DEMO_CAPABILITIES) {
      const connectorId = connectorMap.get(cap.provider);
      if (!connectorId && cap.provider !== "internal") {
        console.log(`  Skipping ${cap.name} — no connector for ${cap.provider}`);
        continue;
      }

      const existing = await prisma.actionCapability.findFirst({
        where: { operatorId: op.id, name: cap.name },
      });

      if (existing) {
        console.log(`  Capability ${cap.name} already exists`);
        continue;
      }

      await prisma.actionCapability.create({
        data: {
          operatorId: op.id,
          connectorId: connectorId ?? null,
          name: cap.name,
          description: cap.description,
          inputSchema: cap.inputSchema,
          sideEffects: cap.sideEffects,
          enabled: true,
          writeBackStatus: "enabled",
        },
      });
      console.log(`  Created capability: ${cap.name}`);
    }

    // Backfill: enable writeBack on all demo capabilities that are still "pending"
    const demoConnectorIds = [...connectorMap.values()];
    if (demoConnectorIds.length > 0) {
      const backfilled = await prisma.actionCapability.updateMany({
        where: {
          operatorId: op.id,
          writeBackStatus: "pending",
          connectorId: { in: demoConnectorIds },
        },
        data: { writeBackStatus: "enabled" },
      });
      if (backfilled.count > 0) {
        console.log(`  WriteBackStatus: backfilled ${backfilled.count} demo capabilities to "enabled"`);
      }
    }
  }

  console.log("\nDone.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
