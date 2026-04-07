import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { callLLM, getModel } from "@/lib/ai-provider";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

interface BookmarkGroup {
  subject: string;
  bookmarks: Array<{
    id: string;
    pageSlug: string;
    bookmarkType: string;
    reason: string;
    confidence: number;
  }>;
}

interface AssemblyReport {
  bookmarksReviewed: number;
  groupsFormed: number;
  initiativesCreated: number;
  bookmarksDismissed: number;
  durationMs: number;
}

export async function assembleInitiativesFromBookmarks(
  operatorId: string,
): Promise<AssemblyReport> {
  const startTime = performance.now();
  const report: AssemblyReport = {
    bookmarksReviewed: 0,
    groupsFormed: 0,
    initiativesCreated: 0,
    bookmarksDismissed: 0,
    durationMs: 0,
  };

  // Load unresolved bookmarks
  const bookmarks = await prisma.wikiBookmark.findMany({
    where: { operatorId, resolved: false },
    select: {
      id: true,
      pageSlug: true,
      bookmarkType: true,
      reason: true,
      confidence: true,
      subjectHint: true,
    },
    orderBy: { confidence: "desc" },
  });

  report.bookmarksReviewed = bookmarks.length;

  if (bookmarks.length === 0) {
    console.log("[bookmark-assembly] No unresolved bookmarks");
    report.durationMs = Math.round(performance.now() - startTime);
    return report;
  }

  // Group bookmarks by subjectHint (case-insensitive, fuzzy)
  const groups = groupBookmarksBySubject(bookmarks);
  report.groupsFormed = groups.length;

  if (groups.length === 0) {
    report.durationMs = Math.round(performance.now() - startTime);
    return report;
  }

  // Load operator context
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyName: true, displayName: true },
  });
  const companyName = operator?.companyName ?? operator?.displayName ?? "the company";

  // Load team size for context
  const teamSize = await prisma.entity.count({
    where: { operatorId, category: "base", status: "active" },
  });

  // Single LLM call to review all groups and propose initiatives
  const groupSummary = groups
    .map((g, i) => {
      const bms = g.bookmarks
        .map((b) => `  - [${b.bookmarkType}] (page: ${b.pageSlug}, confidence: ${b.confidence.toFixed(2)}) ${b.reason}`)
        .join("\n");
      return `Group ${i + 1}: "${g.subject}" (${g.bookmarks.length} signals)\n${bms}`;
    })
    .join("\n\n");

  const systemPrompt = `You are reviewing bookmark signals from a wiki synthesis for ${companyName} (team size: ${teamSize}).

During wiki synthesis, the system flagged these as potentially significant. Your job is to decide which groups warrant creating an initiative (a proposed project for the user to approve) and which are just informational context that doesn't need action.

Bookmark groups:
${groupSummary}

For each group, decide:
- **create_initiative**: This is an active engagement, project, or risk that would benefit from organized tracking. Propose a project structure.
- **dismiss**: This is interesting context but doesn't warrant a separate project. The wiki page is sufficient.

For initiatives, consider:
- If this looks like an active deal/engagement, propose it as a PORTFOLIO — a parent project with suggested workstreams as child projects
- ${teamSize <= 3 ? "This is a small operation. The owner likely handles everything. Don't propose sub-projects with assigned team members — propose workstreams as organizational containers." : "Propose team members and assignments based on what the wiki shows."}
- Deliverables should be concrete: "Financial DD Report", "Risk Assessment", "Buyer Communication Log" — not vague.

Respond with ONLY a JSON array:
[
  {
    "groupIndex": 0,
    "action": "create_initiative" | "dismiss",
    "dismissReason": "only if dismissed — brief reason",
    "initiative": {
      "title": "Deal or project name",
      "description": "What this is and why it matters",
      "severity": "high" | "medium" | "low",
      "isPortfolio": true,
      "proposedProject": {
        "title": "Parent project name",
        "description": "Portfolio description",
        "deliverables": [{"title": "...", "description": "..."}],
        "childProjects": [
          {
            "title": "Financial Due Diligence",
            "description": "...",
            "deliverables": [{"title": "...", "description": "..."}]
          }
        ]
      }
    }
  }
]`;

  try {
    const model = getModel("verifier");
    const response = await callLLM({
      operatorId,
      instructions: systemPrompt,
      messages: [
        { role: "user", content: "Review bookmark groups and propose initiatives." },
      ],
      model,
      maxTokens: 4000,
    });

    const text = response.text;
    const cleaned = text.replace(/```json|```/g, "").trim();
    const arrStart = cleaned.indexOf("[");
    const arrEnd = cleaned.lastIndexOf("]");
    if (arrStart < 0 || arrEnd <= arrStart) {
      console.warn("[bookmark-assembly] Could not parse LLM response");
      report.durationMs = Math.round(performance.now() - startTime);
      return report;
    }

    const decisions = JSON.parse(cleaned.slice(arrStart, arrEnd + 1)) as Array<{
      groupIndex: number;
      action: string;
      dismissReason?: string;
      initiative?: {
        title: string;
        description: string;
        severity: string;
        isPortfolio?: boolean;
        proposedProject?: {
          title: string;
          description: string;
          deliverables: Array<{ title: string; description: string }>;
          childProjects?: Array<{
            title: string;
            description: string;
            deliverables: Array<{ title: string; description: string }>;
          }>;
        };
      };
    }>;

    // Find AI entity for initiative creation
    const aiEntity = await prisma.entity.findFirst({
      where: { operatorId, entityType: { slug: "ai-agent" }, status: "active" },
      select: { id: true },
    });

    if (!aiEntity) {
      console.warn("[bookmark-assembly] No AI entity found — cannot create initiatives");
      report.durationMs = Math.round(performance.now() - startTime);
      return report;
    }

    // Process decisions
    for (const decision of decisions) {
      const group = groups[decision.groupIndex];
      if (!group) continue;

      const bookmarkIds = group.bookmarks.map((b) => b.id);

      if (decision.action === "dismiss") {
        // Mark bookmarks as resolved/dismissed
        await prisma.wikiBookmark.updateMany({
          where: { id: { in: bookmarkIds }, operatorId },
          data: { resolved: true, resolvedAt: new Date(), resolvedAction: "dismissed" },
        });
        report.bookmarksDismissed += bookmarkIds.length;
        continue;
      }

      if (decision.action === "create_initiative" && decision.initiative) {
        const ini = decision.initiative;

        // Build proposedProjectConfig including child projects
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proposedProjectConfig: Record<string, any> = {
          title: ini.proposedProject?.title ?? ini.title,
          description: ini.proposedProject?.description ?? ini.description,
          coordinatorEmail: "",
          dueDate: null,
          members: [],
          deliverables: (ini.proposedProject?.deliverables ?? []).map((d) => ({
            title: d.title,
            description: d.description,
            assignedToEmail: "",
            format: "report",
            suggestedDeadline: null,
          })),
        };

        // Include child project proposals in config
        if (ini.isPortfolio && ini.proposedProject?.childProjects) {
          proposedProjectConfig.childProjects = ini.proposedProject.childProjects.map((cp) => ({
            title: cp.title,
            description: cp.description,
            deliverables: cp.deliverables.map((d) => ({
              title: d.title,
              description: d.description,
              assignedToEmail: "",
              format: "report",
              suggestedDeadline: null,
            })),
          }));
        }

        const initiative = await prisma.initiative.create({
          data: {
            operatorId,
            aiEntityId: aiEntity.id,
            proposalType: "project_creation",
            triggerSummary: ini.title,
            evidence: JSON.stringify(group.bookmarks.map(b => ({ source: "wiki_bookmark", claim: b.reason }))),
            proposal: {
              title: ini.proposedProject?.title ?? ini.title,
              description: ini.proposedProject?.description ?? ini.description,
              coordinatorEmail: "",
              dueDate: null,
              members: [],
              deliverables: (ini.proposedProject?.deliverables ?? []).map((d) => ({
                title: d.title,
                description: d.description,
                assignedToEmail: "",
                format: "report",
                suggestedDeadline: null,
              })),
              childProjects: ini.isPortfolio && ini.proposedProject?.childProjects
                ? ini.proposedProject.childProjects.map((cp) => ({
                    title: cp.title,
                    description: cp.description,
                    deliverables: cp.deliverables.map((d) => ({
                      title: d.title,
                      description: d.description,
                      assignedToEmail: "",
                      format: "report",
                      suggestedDeadline: null,
                    })),
                  }))
                : undefined,
            },
            proposedProjectConfig: proposedProjectConfig as Prisma.InputJsonValue,
            status: "proposed",
            rationale: ini.description,
            impactAssessment: `Severity: ${ini.severity}\n\nEvidence from ${group.bookmarks.length} bookmark(s)`,
          },
        });

        // Mark bookmarks as resolved
        await prisma.wikiBookmark.updateMany({
          where: { id: { in: bookmarkIds }, operatorId },
          data: {
            resolved: true,
            resolvedAt: new Date(),
            resolvedAction: "initiative_created",
            resolvedInitiativeId: initiative.id,
          },
        });

        // Log
        await prisma.evaluationLog.create({
          data: {
            operatorId,
            sourceType: "bookmark_assembly",
            sourceId: initiative.id,
            classification: "initiative_created",
            metadata: {
              initiativeId: initiative.id,
              bookmarkCount: bookmarkIds.length,
              subject: group.subject,
              severity: ini.severity,
              isPortfolio: ini.isPortfolio ?? false,
            },
          },
        });

        // Notify
        sendNotificationToAdmins({
          operatorId,
          type: "initiative_proposed",
          title: `New initiative proposed: ${ini.title}`,
          body: ini.description,
          sourceType: "bookmark_assembly",
          sourceId: initiative.id,
        }).catch(() => {});

        report.initiativesCreated++;
      }
    }
  } catch (err) {
    console.error("[bookmark-assembly] Assembly failed:", err);
  }

  report.durationMs = Math.round(performance.now() - startTime);
  console.log(`[bookmark-assembly] Complete: ${JSON.stringify(report)}`);
  return report;
}

// ── Grouping Logic ──────────────────────────────────────

function groupBookmarksBySubject(
  bookmarks: Array<{
    id: string;
    pageSlug: string;
    bookmarkType: string;
    reason: string;
    confidence: number;
    subjectHint: string | null;
  }>,
): BookmarkGroup[] {
  const groups = new Map<string, BookmarkGroup>();

  for (const bm of bookmarks) {
    // Use subjectHint as primary key, fall back to pageSlug
    const key = normalizeSubject(bm.subjectHint ?? bm.pageSlug);

    const existing = groups.get(key);
    if (existing) {
      existing.bookmarks.push(bm);
    } else {
      groups.set(key, {
        subject: bm.subjectHint ?? bm.pageSlug,
        bookmarks: [bm],
      });
    }
  }

  // Merge groups with similar subjects (simple substring matching)
  const groupList = Array.from(groups.values());
  const merged: BookmarkGroup[] = [];

  for (const group of groupList) {
    const matchIdx = merged.findIndex(
      (m) =>
        normalizeSubject(m.subject).includes(normalizeSubject(group.subject)) ||
        normalizeSubject(group.subject).includes(normalizeSubject(m.subject)),
    );

    if (matchIdx >= 0) {
      // Merge into existing group — keep the longer subject name
      if (group.subject.length > merged[matchIdx].subject.length) {
        merged[matchIdx].subject = group.subject;
      }
      merged[matchIdx].bookmarks.push(...group.bookmarks);
    } else {
      merged.push(group);
    }
  }

  // Sort by total confidence (most confident groups first)
  merged.sort(
    (a, b) =>
      b.bookmarks.reduce((s, bm) => s + bm.confidence, 0) -
      a.bookmarks.reduce((s, bm) => s + bm.confidence, 0),
  );

  return merged;
}

function normalizeSubject(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9æøåäöü]/g, " ").replace(/\s+/g, " ").trim();
}
