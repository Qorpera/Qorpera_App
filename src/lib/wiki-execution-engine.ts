/**
 * Wiki execution engine — parsing, formatting, and execution logic for
 * action plan steps stored directly on situation wiki pages.
 *
 * Wiki-first: the page content is the source of truth. The thin Situation
 * record is kept in sync fire-and-forget for backward compatibility.
 *
 * ─── SESSION 4 MIGRATION AUDIT ─────────────────────────────────────────
 *
 * API Routes reading ExecutionPlan/ExecutionStep:
 *
 *   GET  /api/execution-plans/[planId]                → reads plan + steps → should read wiki page + parse action plan
 *   GET  /api/execution-plans/[planId]/steps           → lists steps → parse from wiki page
 *   PATCH /api/execution-plans/[planId]/steps/[stepId] → approve/reject → DONE (Prompt 4 branching)
 *   POST /api/execution-plans/[planId]/steps/[stepId]/complete → human task → DONE (Prompt 4 branching)
 *   POST /api/execution-plans/[planId]/steps/[stepId]/undo    → undo step → needs wiki equivalent
 *   POST /api/execution-plans/[planId]/amend           → manual amendment → needs wiki equivalent
 *   GET  /api/execution-plans/[planId]/priority        → priority score → move to KnowledgePage index field
 *   GET  /api/situations/[id]                          → includes executionPlan expand → should read wiki page
 *   GET  /api/situations                               → list with status filtering → already uses Situation table, will use KnowledgePage in Session 4
 *   PATCH /api/execution-steps/[id]/parameters          → step input params → parse from wiki page [params: ...]
 *
 * Frontend components:
 *
 *   SituationDetail   — reads plan/steps from API, renders action panel
 *   StepCard          — renders individual step with approve/reject buttons
 *   StepPreview       — renders step preview (email draft, document, etc.)
 *   SituationTimeline — currently reads from both Situation and plan/step records
 *   SituationList/SituationQueue — filters by status, reads from Situation table
 *
 * ────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { getProvider } from "@/lib/connectors/registry";
import { decryptConfig, encryptConfig } from "@/lib/config-encryption";
import { sendNotification, sendNotificationToAdmins } from "@/lib/notification-dispatch";
import { classifyError, extractErrorMessage, sanitizeErrorMessage } from "@/lib/execution/error-classification";

import { captureApiError } from "@/lib/api-error";
import { updatePageWithLock } from "@/lib/wiki-engine";
import { enqueueWorkerJob } from "@/lib/worker-dispatch";
import { evaluateActionPolicies } from "@/lib/policy-evaluator";
import type { SituationProperties } from "@/lib/situation-wiki-helpers";

// ─── Types ──────────────────────────────────────────────

export interface ParsedActionStep {
  order: number;
  title: string;
  actionType: "api_action" | "generate" | "human_task" | "browser_task" | "monitor";
  status: "pending" | "approved" | "executing" | "completed" | "skipped" | "failed";
  description: string;
  capabilityName?: string;
  assignedSlug?: string;
  params?: Record<string, unknown>;
  previewType?: string;
  result?: string;
}

export interface ParsedActionPlan {
  steps: ParsedActionStep[];
  rawSection: string;
  sectionStartIndex: number;
  sectionEndIndex: number;
}

export interface StepExecutionResult {
  status: "completed" | "failed";
  resultText: string;
  output?: Record<string, unknown>;
  deliverable?: {
    title: string;
    description: string;
    type: string;
    reference?: string;
  };
}

// ─── Valid enum values ──────────────────────────────────

const VALID_ACTION_TYPES = new Set([
  "api_action", "generate", "human_task", "browser_task", "monitor",
]);

const VALID_STATUSES = new Set([
  "pending", "approved", "executing", "completed", "skipped", "failed",
]);

// ─── Action Plan Parser ─────────────────────────────────

export function parseActionPlan(pageContent: string): ParsedActionPlan {
  // Find ## Action Plan section (case-insensitive)
  const sectionRegex = /^## Action Plan\s*$/im;
  const sectionMatch = sectionRegex.exec(pageContent);

  if (!sectionMatch) {
    return { steps: [], rawSection: "", sectionStartIndex: -1, sectionEndIndex: -1 };
  }

  const sectionStartIndex = sectionMatch.index;

  // Find end of section (next ## header or end of content)
  const afterHeader = pageContent.slice(sectionStartIndex + sectionMatch[0].length);
  const nextSectionMatch = /^## /m.exec(afterHeader);
  const sectionEndIndex = nextSectionMatch
    ? sectionStartIndex + sectionMatch[0].length + nextSectionMatch.index
    : pageContent.length;

  const rawSection = pageContent.slice(sectionStartIndex, sectionEndIndex);

  // Parse individual steps
  const stepHeaderRegex = /^(\d+)\.\s+\*\*(.+?)\*\*\s+\((\w+)\s*→\s*(\w+)\)/gm;
  const steps: ParsedActionStep[] = [];
  const stepHeaders: Array<{ match: RegExpExecArray; order: number; title: string; actionType: string; status: string }> = [];

  let headerMatch: RegExpExecArray | null;
  while ((headerMatch = stepHeaderRegex.exec(rawSection)) !== null) {
    stepHeaders.push({
      match: headerMatch,
      order: parseInt(headerMatch[1], 10),
      title: headerMatch[2],
      actionType: headerMatch[3].toLowerCase(),
      status: headerMatch[4].toLowerCase(),
    });
  }

  for (let i = 0; i < stepHeaders.length; i++) {
    const header = stepHeaders[i];
    const bodyStart = header.match.index + header.match[0].length;
    const bodyEnd = i + 1 < stepHeaders.length
      ? stepHeaders[i + 1].match.index
      : rawSection.length;

    const body = rawSection.slice(bodyStart, bodyEnd);
    const lines = body.split("\n");

    let capabilityName: string | undefined;
    let assignedSlug: string | undefined;
    let params: Record<string, unknown> | undefined;
    let previewType: string | undefined;
    let result: string | undefined;
    const descriptionLines: string[] = [];
    let inResult = false;

    for (const rawLine of lines) {
      const line = rawLine.trimStart();

      // Metadata lines
      const capMatch = line.match(/^\[capability:\s*(.+?)\]$/);
      if (capMatch) { capabilityName = capMatch[1]; inResult = false; continue; }

      const assignMatch = line.match(/^\[assigned:\s*(.+?)\]$/);
      if (assignMatch) { assignedSlug = assignMatch[1]; inResult = false; continue; }

      const paramsMatch = line.match(/^\[params:\s*(\{.*\})\]$/);
      if (paramsMatch) {
        try { params = JSON.parse(paramsMatch[1]); } catch { /* skip malformed */ }
        inResult = false;
        continue;
      }

      const previewMatch = line.match(/^\[preview:\s*(.+?)\]$/);
      if (previewMatch) { previewType = previewMatch[1]; inResult = false; continue; }

      // Result line
      const resultMatch = line.match(/^\*\*Result:\*\*\s*(.*)$/);
      if (resultMatch) {
        result = resultMatch[1];
        inResult = true;
        continue;
      }

      // Continuation of result
      if (inResult && line.length > 0) {
        result = (result ?? "") + "\n" + line;
        continue;
      }

      // Empty line ends result continuation
      if (inResult && line.length === 0) {
        inResult = false;
      }

      // Description lines (non-empty, non-metadata)
      if (line.length > 0) {
        descriptionLines.push(line);
      }
    }

    // Normalize actionType and status
    const actionType = VALID_ACTION_TYPES.has(header.actionType)
      ? header.actionType as ParsedActionStep["actionType"]
      : "api_action";
    const status = VALID_STATUSES.has(header.status)
      ? header.status as ParsedActionStep["status"]
      : "pending";

    steps.push({
      order: header.order,
      title: header.title,
      actionType,
      status,
      description: descriptionLines.join("\n"),
      ...(capabilityName ? { capabilityName } : {}),
      ...(assignedSlug ? { assignedSlug } : {}),
      ...(params ? { params } : {}),
      ...(previewType ? { previewType } : {}),
      ...(result ? { result } : {}),
    });
  }

  return { steps, rawSection, sectionStartIndex, sectionEndIndex };
}

// ─── Step Renderer ──────────────────────────────────────

export function renderStep(step: ParsedActionStep): string {
  const lines: string[] = [];

  lines.push(`${step.order}. **${step.title}** (${step.actionType} → ${step.status})`);

  if (step.description) {
    for (const descLine of step.description.split("\n")) {
      lines.push(`   ${descLine}`);
    }
  }

  if (step.capabilityName) lines.push(`   [capability: ${step.capabilityName}]`);
  if (step.assignedSlug) lines.push(`   [assigned: ${step.assignedSlug}]`);
  if (step.params) lines.push(`   [params: ${JSON.stringify(step.params)}]`);
  if (step.previewType) lines.push(`   [preview: ${step.previewType}]`);
  if (step.result) lines.push(`   **Result:** ${step.result}`);

  lines.push(""); // blank line after each step

  return lines.join("\n");
}

// ─── Action Plan Renderer ───────────────────────────────

export function renderActionPlan(steps: ParsedActionStep[]): string {
  const lines: string[] = ["## Action Plan\n"];

  for (const step of steps) {
    lines.push(renderStep(step));
  }

  return lines.join("\n");
}

// ─── Section Replacer ───────────────────────────────────

export function replaceSection(
  pageContent: string,
  sectionName: string,
  newSectionContent: string,
): string {
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionRegex = new RegExp(`^## ${escapedName}\\s*$`, "im");
  const sectionMatch = sectionRegex.exec(pageContent);

  if (!sectionMatch) {
    // Section not found — insert before ## Timeline if it exists, otherwise append
    const timelineMatch = /^## Timeline\s*$/im.exec(pageContent);
    if (timelineMatch) {
      return (
        pageContent.slice(0, timelineMatch.index) +
        newSectionContent + "\n\n" +
        pageContent.slice(timelineMatch.index)
      );
    }
    return pageContent + "\n\n" + newSectionContent;
  }

  const sectionStart = sectionMatch.index;
  const afterHeader = pageContent.slice(sectionStart + sectionMatch[0].length);
  const nextSectionMatch = /^## /m.exec(afterHeader);
  const sectionEnd = nextSectionMatch
    ? sectionStart + sectionMatch[0].length + nextSectionMatch.index
    : pageContent.length;

  return (
    pageContent.slice(0, sectionStart).trimEnd() + "\n\n" +
    newSectionContent +
    (nextSectionMatch ? "\n\n" : "") +
    pageContent.slice(sectionEnd)
  );
}

// ─── Timeline Appender ──────────────────────────────────

export function appendTimelineEntry(pageContent: string, entry: string): string {
  const timestamp = formatTimestamp();
  const newEntry = `- ${timestamp} — ${entry}`;

  const sectionRegex = /^## Timeline\s*$/im;
  const sectionMatch = sectionRegex.exec(pageContent);

  if (!sectionMatch) {
    return pageContent + "\n\n## Timeline\n\n" + newEntry + "\n";
  }

  const afterHeader = pageContent.slice(sectionMatch.index + sectionMatch[0].length);
  const nextSectionMatch = /^## /m.exec(afterHeader);
  const insertAt = nextSectionMatch
    ? sectionMatch.index + sectionMatch[0].length + nextSectionMatch.index
    : pageContent.length;

  // Insert the entry at the end of the Timeline section
  const before = pageContent.slice(0, insertAt).trimEnd();
  const after = pageContent.slice(insertAt);

  return before + "\n" + newEntry + "\n" + (after ? "\n" + after : "");
}

// ─── Deliverable Appender ───────────────────────────────

export function appendDeliverable(
  pageContent: string,
  deliverable: { title: string; description: string; type: string; reference?: string },
): string {
  const lines = [
    `### ${deliverable.title} (${deliverable.type})`,
    deliverable.description,
  ];
  if (deliverable.reference) {
    lines.push(`[Reference: ${deliverable.reference}]`);
  }
  const newDeliverable = lines.join("\n");

  const sectionRegex = /^## Deliverables\s*$/im;
  const sectionMatch = sectionRegex.exec(pageContent);

  if (!sectionMatch) {
    // Create section before ## Timeline if it exists
    const timelineMatch = /^## Timeline\s*$/im.exec(pageContent);
    const newSection = "## Deliverables\n\n" + newDeliverable + "\n";
    if (timelineMatch) {
      return (
        pageContent.slice(0, timelineMatch.index) +
        newSection + "\n" +
        pageContent.slice(timelineMatch.index)
      );
    }
    return pageContent + "\n\n" + newSection;
  }

  const afterHeader = pageContent.slice(sectionMatch.index + sectionMatch[0].length);
  const nextSectionMatch = /^## /m.exec(afterHeader);
  const insertAt = nextSectionMatch
    ? sectionMatch.index + sectionMatch[0].length + nextSectionMatch.index
    : pageContent.length;

  const before = pageContent.slice(0, insertAt).trimEnd();
  const after = pageContent.slice(insertAt);

  return before + "\n\n" + newDeliverable + "\n" + (after ? "\n" + after : "");
}

// ─── Utility ────────────────────────────────────────────

export function formatTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

// ─── Constants ──────────────────────────────────────────

const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 4000, 16000];
const MAX_TOTAL_EXECUTIONS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Approve / Reject / Skip ────────────────────────────

export async function approveSituationStep(
  operatorId: string,
  pageSlug: string,
  stepOrder: number,
  userId: string,
  action: "approve" | "reject" | "skip",
): Promise<void> {
  await updatePageWithLock(operatorId, pageSlug, (page) => {
    const plan = parseActionPlan(page.content);
    const step = plan.steps.find((s) => s.order === stepOrder);
    if (!step) throw new Error(`Step ${stepOrder} not found`);
    if (step.status !== "pending" && step.status !== "approved") {
      throw new Error(`Step ${stepOrder} is ${step.status}, expected pending`);
    }

    if (action === "approve") step.status = "approved";
    else if (action === "reject") { step.status = "failed"; step.result = "Rejected by user"; }
    else if (action === "skip") step.status = "skipped";

    let content = replaceSection(page.content, "Action Plan", renderActionPlan(plan.steps));
    content = appendTimelineEntry(content, `Step ${stepOrder} ${action}ed by user`);
    return { content };
  });

  if (action === "approve") {
    await enqueueWorkerJob("execute_wiki_step", operatorId, { operatorId, pageSlug, stepOrder });
  }

  if (action === "reject") {
    // Skip all remaining pending steps
    await updatePageWithLock(operatorId, pageSlug, (page) => {
      const plan = parseActionPlan(page.content);
      for (const s of plan.steps) {
        if (s.status === "pending") s.status = "skipped";
      }
      const props = (page.properties ?? {}) as unknown as SituationProperties;
      props.status = "rejected";
      const content = replaceSection(page.content, "Action Plan", renderActionPlan(plan.steps));
      return { content, properties: props as unknown as Record<string, unknown> };
    });

    await prisma.situation.updateMany({
      where: { operatorId, wikiPageSlug: pageSlug },
      data: { status: "rejected" },
    }).catch(() => {});

    await sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: `Situation step ${stepOrder} rejected`,
      body: `A step was rejected on page ${pageSlug}.`,
      sourceType: "wiki_page",
      sourceId: pageSlug,
    }).catch(() => {});

    const { recordPlanRejection } = await import("@/lib/plan-autonomy");
    recordPlanRejection({
      id: pageSlug,
      operatorId,
      sourceType: "situation",
      sourceId: pageSlug,
    }).catch(() => {});
  }

  if (action === "skip") {
    await advanceToNextStep(operatorId, pageSlug, stepOrder);
  }
}

// ─── Execute Step ───────────────────────────────────────

export async function executeSituationStep(
  operatorId: string,
  pageSlug: string,
  stepOrder: number,
): Promise<void> {
  // Mark step as executing, increment loop breaker — single lock cycle
  let step: ParsedActionStep | undefined;
  let pageProps: SituationProperties = {} as SituationProperties;

  await updatePageWithLock(operatorId, pageSlug, (page) => {
    const plan = parseActionPlan(page.content);
    step = plan.steps.find((s) => s.order === stepOrder);
    if (!step) throw new Error(`Step ${stepOrder} not found`);
    if (step.status !== "approved" && step.status !== "pending") {
      throw new Error(`Step ${stepOrder} is ${step.status}, cannot execute`);
    }
    step.status = "executing";

    pageProps = (page.properties ?? {}) as unknown as SituationProperties;
    pageProps.total_executions = (pageProps.total_executions ?? 0) + 1;

    const content = replaceSection(page.content, "Action Plan", renderActionPlan(plan.steps));
    return { content, properties: pageProps as unknown as Record<string, unknown> };
  });

  if (!step!) return;

  // Emergency stop
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { aiPaused: true, billingStatus: true },
  });
  if (operator?.aiPaused || (operator && operator.billingStatus !== "active")) {
    await writeStepResult(operatorId, pageSlug, stepOrder, "failed",
      "Execution paused — operator AI suspended");
    return;
  }

  // Loop breaker
  if ((pageProps.total_executions ?? 0) > MAX_TOTAL_EXECUTIONS) {
    await handleCatastrophicStepError(operatorId, pageSlug, stepOrder,
      new Error("Loop breaker"),
      `Exceeded maximum of ${MAX_TOTAL_EXECUTIONS} step executions — possible retry loop`);
    return;
  }

  // Execute based on action type
  try {
    switch (step!.actionType) {
      case "api_action":
        await executeApiAction(operatorId, pageSlug, step!, stepOrder);
        break;
      case "generate":
        await executeGenerate(operatorId, pageSlug, step!, stepOrder);
        break;
      case "human_task":
      case "browser_task":
        await executeHumanTask(operatorId, pageSlug, step!, stepOrder);
        return; // Do NOT advance — waits for human completion
      case "monitor":
        await executeMonitor(operatorId, pageSlug, stepOrder);
        return; // Do NOT advance — resolves via activity pipeline or timeout
    }

    // Post-execution: advance plan (api_action + generate only)
    await advanceToNextStep(operatorId, pageSlug, stepOrder);
  } catch (err) {
    const errorClass = classifyError(err, step!.actionType);
    const rawMessage = extractErrorMessage(err);
    const message = sanitizeErrorMessage(rawMessage);

    switch (errorClass) {
      case "transient":
        await handleTransientStepError(operatorId, pageSlug, stepOrder, err, message);
        break;
      case "permanent":
        await handlePermanentStepError(operatorId, pageSlug, stepOrder, message);
        break;
      case "catastrophic":
        await handleCatastrophicStepError(operatorId, pageSlug, stepOrder, err, message);
        break;
    }
  }
}

// ─── Action Type Executors ──────────────────────────────

async function executeApiAction(
  operatorId: string,
  pageSlug: string,
  step: ParsedActionStep,
  stepOrder: number,
): Promise<void> {
  if (!step.capabilityName) {
    throw Object.assign(new Error("Action step missing capability name"), { _permanent: true });
  }

  const capability = await prisma.actionCapability.findFirst({
    where: { operatorId, name: step.capabilityName, enabled: true },
  });
  if (!capability) {
    throw Object.assign(new Error(`Capability not found or disabled: ${step.capabilityName}`), { _permanent: true });
  }

  // Writeback gate
  if (capability.connectorId && capability.writeBackStatus !== "enabled") {
    await sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: `Write-back not enabled: ${capability.name}`,
      body: `Write-back for ${capability.name} has not been enabled. An admin can enable this in Settings → Connections.`,
      sourceType: "wiki_page",
      sourceId: pageSlug,
    });
    throw Object.assign(
      new Error(`Write-back for ${capability.name} has not been enabled.`),
      { _permanent: true },
    );
  }

  // Internal capability (no connector)
  if (!capability.connectorId) {
    const { executeInternalCapability } = await import("@/lib/internal-capabilities");
    const output = await executeInternalCapability(capability.name, JSON.stringify(step.params ?? {}), operatorId);
    await writeStepResult(operatorId, pageSlug, stepOrder, "completed",
      `${capability.name} executed successfully`, output as Record<string, unknown>);
    return;
  }

  // Governance check — verify action is permitted by policy
  {
    let entityTypeSlug = "";
    let entityId = "";

    const situation = await prisma.situation.findFirst({
      where: { operatorId, wikiPageSlug: pageSlug },
      select: { id: true, triggerEntityId: true },
    });

    if (situation?.triggerEntityId) {
      const entity = await prisma.entity.findUnique({
        where: { id: situation.triggerEntityId },
        select: { entityType: { select: { slug: true } } },
      });
      if (entity) {
        entityTypeSlug = entity.entityType.slug;
        entityId = situation.triggerEntityId;
      }
    }

    // Fallback for wiki-first (entity-free): use situation_type from page properties
    if (!entityTypeSlug) {
      const sitPage = await prisma.knowledgePage.findUnique({
        where: { operatorId_slug: { operatorId, slug: pageSlug } },
        select: { properties: true },
      });
      const props = (sitPage?.properties ?? {}) as Record<string, unknown>;
      entityTypeSlug = (props.situation_type as string) ?? "";
    }

    const policyResult = await evaluateActionPolicies(
      operatorId,
      [{ name: capability.name, description: capability.description, connectorId: capability.connectorId, connectorProvider: null, inputSchema: capability.inputSchema }],
      entityTypeSlug,
      entityId,
    );
    if (policyResult.blocked.length > 0) {
      throw Object.assign(
        new Error(`Blocked by policy: ${policyResult.blocked.map((b) => b.reason).join(", ")}`),
        { _permanent: true },
      );
    }
  }

  // Resolve connector — prefer assigned user's connector for same provider
  let connectorId: string | null = null;
  if (step.assignedSlug && capability.connectorId) {
    const capConnector = await prisma.sourceConnector.findFirst({
      where: { id: capability.connectorId, deletedAt: null },
      select: { provider: true },
    });
    if (capConnector) {
      // Resolve assignedSlug to userId via wiki page
      const assignedPage = await prisma.knowledgePage.findFirst({
        where: { operatorId, slug: step.assignedSlug, pageType: "person_profile" },
        select: { subjectEntityId: true },
      });
      if (assignedPage?.subjectEntityId) {
        const aiEntity = await prisma.entity.findFirst({
          where: { id: assignedPage.subjectEntityId },
          select: { ownerUserId: true },
        });
        if (aiEntity?.ownerUserId) {
          const userConnector = await prisma.sourceConnector.findFirst({
            where: { operatorId, provider: capConnector.provider, userId: aiEntity.ownerUserId, status: "active", deletedAt: null },
          });
          if (userConnector) connectorId = userConnector.id;
        }
      }
    }
  }
  if (!connectorId) connectorId = capability.connectorId;
  if (!connectorId) throw new Error("No connector available for action");

  const connector = await prisma.sourceConnector.findFirst({
    where: { id: connectorId, deletedAt: null },
  });
  if (!connector) throw new Error(`Connector not found: ${connectorId}`);

  // Demo connector mock
  const connectorConfig = (() => {
    try { return JSON.parse(connector.config || "{}"); } catch { return {}; }
  })();

  if (connectorConfig.demo === true) {
    const params = step.params ?? {};
    const mockId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let resultText = `Demo execution of ${capability.name}`;
    let deliverable: StepExecutionResult["deliverable"];

    switch (capability.name) {
      case "send_email": case "reply_to_email": case "reply_to_thread":
        resultText = `Email sent (demo) → ${(params as Record<string, unknown>).to ?? "recipient"}`;
        deliverable = { title: "Email sent", description: resultText, type: "email", reference: mockId };
        break;
      case "send_slack_message": case "send_teams_message":
        resultText = `Message sent (demo) → ${(params as Record<string, unknown>).channel ?? "channel"}`;
        break;
      default:
        resultText = `Demo execution of ${capability.name} (${mockId})`;
    }

    await writeStepResult(operatorId, pageSlug, stepOrder, "completed", resultText, { _demo: true }, deliverable);
    return;
  }

  // Real connector execution
  const provider = getProvider(connector.provider);
  if (!provider?.executeAction) {
    throw new Error(`Provider "${connector.provider}" does not support action execution`);
  }

  // Build params with prior step context
  const priorResults = await getPriorStepResults(operatorId, pageSlug, stepOrder);
  const params: Record<string, unknown> = { ...(step.params ?? {}), priorOutputs: priorResults };

  // EU AI Act Article 50: flag AI-generated content for email/Slack/Teams actions
  if (["send_email", "reply_to_thread", "reply_to_email", "forward_email", "send_slack_message", "send_teams_message"].includes(capability.name)) {
    params.isAiGenerated = true; // Wiki-first steps are always AI-proposed
    const op = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { companyName: true, displayName: true },
    });
    params._operatorName = op?.companyName || op?.displayName || undefined;
  }

  const config = decryptConfig(connector.config || "{}") as Record<string, any>;
  const result = await provider.executeAction(config, capability.name, params);

  // Persist refreshed config
  await prisma.sourceConnector.update({
    where: { id: connector.id },
    data: { config: encryptConfig(config) },
  }).catch(() => {});

  if (!result.success) {
    throw new Error(result.error || "Action execution failed");
  }

  const output = mapWikiActionResult(capability.name, result.result ?? {});
  await writeStepResult(operatorId, pageSlug, stepOrder, "completed",
    output.resultText, output.data, output.deliverable);
}

async function executeGenerate(
  operatorId: string,
  pageSlug: string,
  step: ParsedActionStep,
  stepOrder: number,
): Promise<void> {
  let userContent = `Task: ${step.description}`;

  const priorResults = await getPriorStepResults(operatorId, pageSlug, stepOrder);
  if (priorResults.length > 0) {
    userContent += "\n\nPrior step results:";
    for (const prior of priorResults) {
      userContent += `\n- ${prior.title}: ${prior.result ?? "No output"}`;
    }
  }

  const response = await callLLM({
    operatorId,
    instructions: "You are executing a step in a business workflow. Complete the task described below using the provided context. Return your output as plain text.",
    messages: [{ role: "user", content: userContent }],
    aiFunction: "reasoning",
    temperature: 0.3,
    model: getModel("executionGenerate"),
  });

  await writeStepResult(operatorId, pageSlug, stepOrder, "completed",
    response.text.slice(0, 2000));
}

async function executeHumanTask(
  operatorId: string,
  pageSlug: string,
  step: ParsedActionStep,
  stepOrder: number,
): Promise<void> {
  // Send notification to assigned user or admins
  if (step.assignedSlug) {
    const assignedPage = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: step.assignedSlug, pageType: "person_profile" },
      select: { subjectEntityId: true },
    });
    const entity = assignedPage?.subjectEntityId
      ? await prisma.entity.findFirst({ where: { id: assignedPage.subjectEntityId }, select: { ownerUserId: true } })
      : null;
    if (entity?.ownerUserId) {
      await sendNotification({
        operatorId,
        userId: entity.ownerUserId,
        type: "delegation_received",
        title: `Task assigned: ${step.title}`,
        body: step.description,
        sourceType: "wiki_page",
        sourceId: pageSlug,
      }).catch(() => {});
    }
  } else {
    await sendNotificationToAdmins({
      operatorId,
      type: "delegation_received",
      title: `Task requires action: ${step.title}`,
      body: step.description,
      sourceType: "wiki_page",
      sourceId: pageSlug,
    }).catch(() => {});
  }

  // TODO: FollowUp requires executionStepId (FK, non-nullable). Wiki-first pages
  // have no ExecutionStep record. Needs schema migration to make executionStepId
  // optional before wiki-first FollowUp escalation can work. For now, the
  // notification above serves as the escalation trigger.
}

async function executeMonitor(
  operatorId: string,
  pageSlug: string,
  stepOrder: number,
): Promise<void> {
  await updatePageWithLock(operatorId, pageSlug, (page) => {
    const props = (page.properties ?? {}) as unknown as SituationProperties;
    props.status = "monitoring";
    let content = appendTimelineEntry(page.content, "Entering monitoring phase");
    return { content, properties: props as unknown as Record<string, unknown> };
  });

  await prisma.situation.updateMany({
    where: { operatorId, wikiPageSlug: pageSlug },
    data: { status: "monitoring" },
  }).catch(() => {});
}

// ─── Plan Advancement ───────────────────────────────────

async function advanceToNextStep(
  operatorId: string,
  pageSlug: string,
  completedStepOrder: number,
): Promise<void> {
  const page = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: pageSlug } },
    select: { content: true, properties: true },
  });
  if (!page) return;

  const plan = parseActionPlan(page.content);
  const nextStep = plan.steps.find((s) => s.status === "pending" && s.order > completedStepOrder);

  if (!nextStep) {
    await completeSituationPlan(operatorId, pageSlug);
    return;
  }

  const props = (page.properties ?? {}) as unknown as SituationProperties;
  const autonomy = props.autonomy_level;

  if (autonomy === "autonomous") {
    // Auto-approve and dispatch
    await updatePageWithLock(operatorId, pageSlug, (p) => {
      const currentPlan = parseActionPlan(p.content);
      const target = currentPlan.steps.find((s) => s.order === nextStep.order);
      if (target) target.status = "approved";
      const updatedProps = (p.properties ?? {}) as unknown as SituationProperties;
      updatedProps.current_step = nextStep.order;
      const content = replaceSection(p.content, "Action Plan", renderActionPlan(currentPlan.steps));
      return { content, properties: updatedProps as unknown as Record<string, unknown> };
    });
    await enqueueWorkerJob("execute_wiki_step", operatorId, { operatorId, pageSlug, stepOrder: nextStep.order });
  } else {
    // Await approval
    await updatePageWithLock(operatorId, pageSlug, (p) => {
      const updatedProps = (p.properties ?? {}) as unknown as SituationProperties;
      updatedProps.current_step = nextStep.order;
      return { properties: updatedProps as unknown as Record<string, unknown> };
    });

    await sendNotificationToAdmins({
      operatorId,
      type: "step_ready",
      title: `Step ready for review: ${nextStep.title}`,
      body: `Step ${nextStep.order} on page ${pageSlug} is awaiting approval.`,
      sourceType: "wiki_page",
      sourceId: pageSlug,
    }).catch(() => {});
  }
}

// ─── Plan Completion ────────────────────────────────────

async function completeSituationPlan(
  operatorId: string,
  pageSlug: string,
): Promise<void> {
  const page = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: pageSlug } },
    select: { content: true, properties: true },
  });
  if (!page) return;

  const props = (page.properties ?? {}) as unknown as SituationProperties;
  const plan = parseActionPlan(page.content);
  const resolutionType = props.resolution_type ?? "response_dependent";
  const afterBatch = props.after_batch;

  // Determine resolution behavior
  const shouldResolve = resolutionType === "self_resolving"
    || resolutionType === "informational"
    || afterBatch === "resolve";
  const shouldMonitor = !shouldResolve && (resolutionType === "response_dependent" || afterBatch === "monitor");

  const situation = await prisma.situation.findFirst({
    where: { operatorId, wikiPageSlug: pageSlug },
    select: { id: true, assignedUserId: true, triggerSummary: true },
  });

  // Build receipt from completed steps
  const completedSteps = plan.steps.filter((s) => s.status === "completed");
  const receiptLines = completedSteps
    .map((s) => `${s.title}${s.result ? ` → ${s.result.slice(0, 80)}` : ""}`)
    .join(" · ");

  if (shouldResolve) {
    await updatePageWithLock(operatorId, pageSlug, (p) => {
      const updatedProps = (p.properties ?? {}) as unknown as SituationProperties;
      updatedProps.status = "resolved";
      updatedProps.resolved_at = new Date().toISOString();
      const content = appendTimelineEntry(p.content, "All steps completed — situation resolved");
      return { content, properties: updatedProps as unknown as Record<string, unknown> };
    });

    if (situation) {
      await prisma.situation.update({
        where: { id: situation.id },
        data: {
          status: "resolved",
          resolvedAt: new Date(),
          outcome: resolutionType === "informational" ? "information_delivered" : "action_completed",
        },
      }).catch(() => {});

      // Complete the active cycle
      await prisma.situationCycle.updateMany({
        where: { situationId: situation.id, status: "active" },
        data: { status: "completed", completedAt: new Date() },
      }).catch(() => {});
    }

    const notifyUserId = situation?.assignedUserId;
    const title = situation?.triggerSummary?.slice(0, 80) ?? "Situation resolved";
    if (notifyUserId) {
      await sendNotification({ operatorId, userId: notifyUserId, type: "situation_resolved", title, body: receiptLines || "All actions completed.", sourceType: "wiki_page", sourceId: pageSlug }).catch(() => {});
    } else {
      await sendNotificationToAdmins({ operatorId, type: "situation_resolved", title, body: receiptLines || "All actions completed.", sourceType: "wiki_page", sourceId: pageSlug }).catch(() => {});
    }
  } else if (shouldMonitor) {
    await updatePageWithLock(operatorId, pageSlug, (p) => {
      const updatedProps = (p.properties ?? {}) as unknown as SituationProperties;
      updatedProps.status = "monitoring";
      const content = appendTimelineEntry(p.content, "Steps complete — monitoring for response");
      return { content, properties: updatedProps as unknown as Record<string, unknown> };
    });

    if (situation) {
      await prisma.situation.update({
        where: { id: situation.id },
        data: { status: "monitoring" },
      }).catch(() => {});
    }

    const monitorMsg = props.monitoring_criteria
      ? `Waiting for: ${props.monitoring_criteria.waitingFor}. Follow-up in ${props.monitoring_criteria.expectedWithinDays ?? 3} business days.`
      : "Monitoring — waiting for external response.";

    if (situation?.assignedUserId) {
      await sendNotification({ operatorId, userId: situation.assignedUserId, type: "situation_resolved", title: "Actions completed, monitoring", body: monitorMsg, sourceType: "wiki_page", sourceId: pageSlug }).catch(() => {});
    }
  }

  // Track plan autonomy
  const { recordPlanCompletion } = await import("@/lib/plan-autonomy");
  recordPlanCompletion({
    id: pageSlug,
    operatorId,
    sourceType: "situation",
    sourceId: pageSlug,
  }).catch((err) => console.error("[wiki-execution] Plan autonomy tracking failed:", err));
}

// ─── Complete Human Step ────────────────────────────────

export async function completeHumanSituationStep(
  operatorId: string,
  pageSlug: string,
  stepOrder: number,
  userId: string,
  notes?: string,
): Promise<void> {
  const resultText = notes
    ? `Completed by user: ${notes}`
    : "Completed by user";

  await writeStepResult(operatorId, pageSlug, stepOrder, "completed", resultText);

  await updatePageWithLock(operatorId, pageSlug, (page) => {
    const content = appendTimelineEntry(page.content, `Step ${stepOrder} completed by user`);
    return { content };
  });

  // Cancel watching FollowUps for this step
  const situation = await prisma.situation.findFirst({
    where: { operatorId, wikiPageSlug: pageSlug },
    select: { id: true },
  });
  if (situation) {
    // Match by triggerCondition containing the step order
    const followUps = await prisma.followUp.findMany({
      where: { situationId: situation.id, status: "watching" },
      select: { id: true, triggerCondition: true },
    });
    for (const fu of followUps) {
      try {
        const cond = JSON.parse(fu.triggerCondition);
        if (cond.wikiStep === stepOrder) {
          await prisma.followUp.update({ where: { id: fu.id }, data: { status: "cancelled" } });
        }
      } catch { /* skip malformed */ }
    }
  }

  // TODO: dispatch re_evaluate_wiki_plan worker job if notes suggest plan revision

  await advanceToNextStep(operatorId, pageSlug, stepOrder);
}

// ─── Error Handlers ─────────────────────────────────────

async function handleTransientStepError(
  operatorId: string,
  pageSlug: string,
  stepOrder: number,
  error: unknown,
  message: string,
  retryCount: number = 0,
): Promise<void> {
  const newRetryCount = retryCount + 1;

  if (newRetryCount <= MAX_RETRIES) {
    await sleep(BACKOFF_MS[newRetryCount - 1]);

    // Check emergency stop before retrying
    const op = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { aiPaused: true },
    });
    if (op?.aiPaused) {
      await writeStepResult(operatorId, pageSlug, stepOrder, "failed",
        "Halted: operator AI paused during retry");
      return;
    }

    // Retry execution
    try {
      // Re-read step state and re-execute
      const page = await prisma.knowledgePage.findUnique({
        where: { operatorId_slug: { operatorId, slug: pageSlug } },
        select: { content: true },
      });
      if (!page) return;

      const plan = parseActionPlan(page.content);
      const step = plan.steps.find((s) => s.order === stepOrder);
      if (!step || step.status === "failed") return;

      switch (step.actionType) {
        case "api_action":
          await executeApiAction(operatorId, pageSlug, step, stepOrder);
          await advanceToNextStep(operatorId, pageSlug, stepOrder);
          return;
        case "generate":
          await executeGenerate(operatorId, pageSlug, step, stepOrder);
          await advanceToNextStep(operatorId, pageSlug, stepOrder);
          return;
      }
    } catch (retryErr) {
      const retryClass = classifyError(retryErr, "action");
      if (retryClass === "transient") {
        await handleTransientStepError(operatorId, pageSlug, stepOrder, retryErr,
          sanitizeErrorMessage(extractErrorMessage(retryErr)), newRetryCount);
        return;
      }
      // Escalate non-transient retry failures
      await handlePermanentStepError(operatorId, pageSlug, stepOrder,
        sanitizeErrorMessage(extractErrorMessage(retryErr)));
      return;
    }
  }

  // Exhausted retries — escalate to permanent
  await handlePermanentStepError(operatorId, pageSlug, stepOrder,
    `Transient error exhausted ${MAX_RETRIES} retries: ${message}`);
}

async function handlePermanentStepError(
  operatorId: string,
  pageSlug: string,
  stepOrder: number,
  message: string,
): Promise<void> {
  await writeStepResult(operatorId, pageSlug, stepOrder, "failed", `Error: ${message}`);
  await amendPlanFromStepError(operatorId, pageSlug, stepOrder, message);
}

async function handleCatastrophicStepError(
  operatorId: string,
  pageSlug: string,
  stepOrder: number,
  error: unknown,
  message: string,
): Promise<void> {
  // Mark failed step + skip all remaining
  await updatePageWithLock(operatorId, pageSlug, (page) => {
    const plan = parseActionPlan(page.content);
    const target = plan.steps.find((s) => s.order === stepOrder);
    if (target) { target.status = "failed"; target.result = `Catastrophic: ${message}`; }
    for (const s of plan.steps) {
      if (s.status === "pending") s.status = "skipped";
    }
    const props = (page.properties ?? {}) as unknown as SituationProperties;
    props.status = "proposed";
    let content = replaceSection(page.content, "Action Plan", renderActionPlan(plan.steps));
    content = appendTimelineEntry(content, `Catastrophic error at step ${stepOrder}: ${message.slice(0, 100)}`);
    return { content, properties: props as unknown as Record<string, unknown> };
  });

  await prisma.situation.updateMany({
    where: { operatorId, wikiPageSlug: pageSlug },
    data: { status: "proposed" },
  }).catch(() => {});

  await sendNotificationToAdmins({
    operatorId,
    type: "system_alert",
    title: "AI execution halted — action required",
    body: `Catastrophic error on page ${pageSlug}, step ${stepOrder}: ${message}. The situation has been set to proposed for human review.`,
    sourceType: "wiki_page",
    sourceId: pageSlug,
  }).catch(() => {});

  captureApiError(error instanceof Error ? error : new Error(message), {
    operatorId,
    pageSlug,
    stepOrder: String(stepOrder),
    errorClass: "catastrophic",
  });
}

// ─── LLM-Based Plan Amendment ───────────────────────────

async function amendPlanFromStepError(
  operatorId: string,
  pageSlug: string,
  failedStepOrder: number,
  errorMessage: string,
): Promise<void> {
  const page = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: pageSlug } },
    select: { content: true },
  });
  if (!page) return;

  const plan = parseActionPlan(page.content);
  const failedStep = plan.steps.find((s) => s.order === failedStepOrder);
  const remainingSteps = plan.steps.filter((s) => s.status === "pending");

  if (remainingSteps.length === 0) {
    // No steps to amend — fail the situation
    await updatePageWithLock(operatorId, pageSlug, (p) => {
      const props = (p.properties ?? {}) as unknown as SituationProperties;
      props.status = "proposed";
      const content = appendTimelineEntry(p.content, `Plan failed — no remaining steps to amend after step ${failedStepOrder}`);
      return { content, properties: props as unknown as Record<string, unknown> };
    });

    await prisma.situation.updateMany({
      where: { operatorId, wikiPageSlug: pageSlug },
      data: { status: "proposed" },
    }).catch(() => {});

    await sendNotificationToAdmins({
      operatorId,
      type: "system_alert",
      title: "Plan failed — no remaining steps to amend",
      body: `Step "${failedStep?.title ?? failedStepOrder}" failed: ${errorMessage}`,
      sourceType: "wiki_page",
      sourceId: pageSlug,
    }).catch(() => {});
    return;
  }

  // Build amendment prompt
  const completedSteps = plan.steps
    .filter((s) => s.status === "completed")
    .map((s) => `  ${s.order}. [DONE] ${s.title}`)
    .join("\n");

  const remaining = remainingSteps
    .map((s) => `  ${s.order}. ${s.title}: ${s.description}`)
    .join("\n");

  const prompt = `A step in the execution plan has failed.

FAILED STEP: ${failedStep?.description ?? "Unknown"}
ERROR: ${errorMessage}

COMPLETED STEPS:
${completedSteps || "  (none)"}

REMAINING STEPS TO AMEND:
${remaining}

Propose alternative descriptions for the remaining steps to achieve the original goal while accounting for the failure. If the goal cannot be achieved without the failed step, respond with "ESCALATE" on a single line.

Respond in JSON format:
[{ "order": <number>, "newTitle": "<optional new title>", "newDescription": "<amended description>" }, ...]`;

  try {
    const response = await callLLM({
      operatorId,
      aiFunction: "reasoning",
      instructions: "You are an execution plan advisor. A step in an execution plan has failed. Propose amendments to remaining steps to achieve the original goal, or recommend escalation if the goal cannot be achieved.",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2000,
    });

    const trimmed = response.text.trim();

    if (trimmed.toUpperCase().includes("ESCALATE")) {
      // LLM recommends escalation
      await escalatePlan(operatorId, pageSlug, failedStepOrder, errorMessage);
      return;
    }

    // Parse amendments
    const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      await escalatePlan(operatorId, pageSlug, failedStepOrder, errorMessage);
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      order: number;
      newTitle?: string;
      newDescription: string;
    }>;

    const validOrders = new Set(remainingSteps.map((s) => s.order));
    const amendments = parsed.filter((a) => validOrders.has(a.order) && a.newDescription);

    if (amendments.length === 0) {
      await escalatePlan(operatorId, pageSlug, failedStepOrder, errorMessage);
      return;
    }

    // Apply amendments to page
    await updatePageWithLock(operatorId, pageSlug, (p) => {
      const currentPlan = parseActionPlan(p.content);
      for (const amendment of amendments) {
        const target = currentPlan.steps.find((s) => s.order === amendment.order);
        if (target) {
          if (amendment.newTitle) target.title = amendment.newTitle;
          target.description = amendment.newDescription;
        }
      }
      let content = replaceSection(p.content, "Action Plan", renderActionPlan(currentPlan.steps));
      content = appendTimelineEntry(content, `Plan amended after step ${failedStepOrder} failure (${amendments.length} steps modified)`);
      return { content };
    });
  } catch (amendErr) {
    console.error("[wiki-execution] Amendment reasoning failed:", amendErr);
    await escalatePlan(operatorId, pageSlug, failedStepOrder, errorMessage);
  }
}

async function escalatePlan(
  operatorId: string,
  pageSlug: string,
  failedStepOrder: number,
  errorMessage: string,
): Promise<void> {
  await updatePageWithLock(operatorId, pageSlug, (page) => {
    const plan = parseActionPlan(page.content);
    for (const s of plan.steps) {
      if (s.status === "pending") s.status = "skipped";
    }
    const props = (page.properties ?? {}) as unknown as SituationProperties;
    props.status = "proposed";
    let content = replaceSection(page.content, "Action Plan", renderActionPlan(plan.steps));
    content = appendTimelineEntry(content, `Plan escalated for human review after step ${failedStepOrder} failure`);
    return { content, properties: props as unknown as Record<string, unknown> };
  });

  await prisma.situation.updateMany({
    where: { operatorId, wikiPageSlug: pageSlug },
    data: { status: "proposed" },
  }).catch(() => {});

  await sendNotificationToAdmins({
    operatorId,
    type: "system_alert",
    title: "Plan requires human intervention",
    body: `Step ${failedStepOrder} failed: ${errorMessage}. AI could not determine alternative steps.`,
    sourceType: "wiki_page",
    sourceId: pageSlug,
  }).catch(() => {});
}

// ─── Helpers ────────────────────────────────────────────

async function writeStepResult(
  operatorId: string,
  pageSlug: string,
  stepOrder: number,
  status: "completed" | "failed",
  resultText: string,
  output?: Record<string, unknown>,
  deliverable?: StepExecutionResult["deliverable"],
): Promise<void> {
  await updatePageWithLock(operatorId, pageSlug, (page) => {
    const plan = parseActionPlan(page.content);
    const step = plan.steps.find((s) => s.order === stepOrder);
    if (!step) return {};
    step.status = status;
    step.result = resultText;
    let content = replaceSection(page.content, "Action Plan", renderActionPlan(plan.steps));
    if (deliverable) {
      content = appendDeliverable(content, deliverable);
    }
    if (status === "completed") {
      content = appendTimelineEntry(content, `Step ${stepOrder} completed: ${step.title}`);
    }
    return { content };
  });
}

async function getPriorStepResults(
  operatorId: string,
  pageSlug: string,
  currentStepOrder: number,
): Promise<Array<{ title: string; result: string | null }>> {
  const page = await prisma.knowledgePage.findUnique({
    where: { operatorId_slug: { operatorId, slug: pageSlug } },
    select: { content: true },
  });
  if (!page) return [];

  const plan = parseActionPlan(page.content);
  return plan.steps
    .filter((s) => s.status === "completed" && s.order < currentStepOrder)
    .map((s) => ({ title: s.title, result: s.result ?? null }));
}

function mapWikiActionResult(
  capabilityName: string,
  result: unknown,
): { resultText: string; data?: Record<string, unknown>; deliverable?: StepExecutionResult["deliverable"] } {
  const r = (result ?? {}) as Record<string, unknown>;
  switch (capabilityName) {
    case "send_email":
    case "reply_to_thread":
      return {
        resultText: `Email sent → ${((r.recipients ?? []) as string[]).join(", ")}`,
        data: r,
        deliverable: { title: "Email sent", description: `To: ${((r.recipients ?? []) as string[]).join(", ")}`, type: "email", reference: String(r.threadId ?? "") },
      };
    case "create_calendar_event":
    case "create_event":
      return {
        resultText: `Calendar event created`,
        data: r,
        deliverable: { title: "Calendar event", description: "Event created", type: "calendar_event", reference: String(r.eventId ?? "") },
      };
    case "send_slack_message":
    case "send_teams_message":
      return {
        resultText: `Message sent to ${r.channelId ?? "channel"}`,
        data: r,
      };
    default:
      return { resultText: `${capabilityName} executed successfully`, data: r };
  }
}
