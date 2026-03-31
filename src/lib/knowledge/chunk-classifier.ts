import { prisma } from "@/lib/db";
import { extractJSONArray } from "@/lib/json-helpers";
import { getModel } from "@/lib/ai-provider";
import Anthropic from "@anthropic-ai/sdk";

// ─── Types ───────────────────────────────────────────────

export type ClassificationResult = {
  totalChunks: number;
  algorithmicCount: number;
  llmCount: number;
  operatorWideCount: number;
  alreadyClassified: number;
  errors: string[];
};

type LookupTables = {
  emailToDeptIds: Map<string, Set<string>>;
  entityIdToDeptIds: Map<string, string[]>;
  slackChannelToDept: Map<string, string>;
  departments: Array<{ id: string; displayName: string; description: string | null }>;
};

type ClassifiableChunk = {
  id: string;
  entityId: string | null;
  sourceType: string;
  metadata: string | null;
  departmentIds: string | null;
  content?: string;
};

// ─── Main: classifyOperatorChunks ────────────────────────

export async function classifyOperatorChunks(
  operatorId: string,
): Promise<ClassificationResult> {
  const errors: string[] = [];

  const lookups = await buildLookupTables(operatorId);

  // Count already-classified chunks
  const alreadyClassified = await prisma.contentChunk.count({
    where: { operatorId, classifiedAt: { not: null } },
  });

  // ── Algorithmic classification pass ──────────────────────

  const chunks = await prisma.contentChunk.findMany({
    where: { operatorId, classifiedAt: null },
    select: {
      id: true,
      entityId: true,
      sourceType: true,
      metadata: true,
      departmentIds: true,
      content: true,
    },
  });

  const totalChunks = chunks.length;
  let algorithmicCount = 0;
  const unresolvedChunks: typeof chunks = [];

  for (const chunk of chunks) {
    const deptIds = await classifyChunkAlgorithmically(chunk, lookups);

    if (deptIds.size > 0) {
      await prisma.contentChunk.update({
        where: { id: chunk.id },
        data: {
          departmentIds: JSON.stringify([...deptIds]),
          classifiedAt: new Date(),
          classificationMethod: "algorithmic",
        },
        select: { id: true }, // pgvector: Prisma cannot deserialize the embedding column
      });
      algorithmicCount++;
    } else {
      unresolvedChunks.push(chunk);
    }
  }

  // ── LLM batch classification (Haiku) ────────────────────

  let llmCount = 0;

  if (unresolvedChunks.length > 0 && lookups.departments.length > 0) {
    const { contextString } = await buildDepartmentContext(operatorId);
    const allDeptIds = lookups.departments.map((d) => d.id);

    const BATCH_SIZE = 10;
    const client = new Anthropic();
    const model = getModel("chunkClassification");

    for (let i = 0; i < unresolvedChunks.length; i += BATCH_SIZE) {
      const batch = unresolvedChunks.slice(i, i + BATCH_SIZE);

      try {
        const response = await client.messages.create({
          model,
          max_tokens: 2048,
          temperature: 0,
          system: `You are a content classifier for a business intelligence system. Given a list of company departments and content chunks, assign each chunk to one or more departments based on the content's relevance. If a chunk is general/company-wide, respond with "ALL" as the department ID.

Respond with ONLY a JSON array, no other text:
[{"chunkIndex": 0, "departmentIds": ["dept-id-1"]}, {"chunkIndex": 1, "departmentIds": ["ALL"]}, ...]

Departments:
${contextString}`,
          messages: [
            {
              role: "user",
              content: `Classify these content chunks:\n\n${batch
                .map(
                  (c, idx) =>
                    `[${idx}] (${c.sourceType}) ${(c.content || "").slice(0, 300)}`,
                )
                .join("\n\n")}`,
            },
          ],
        });

        const text =
          response.content[0]?.type === "text" ? response.content[0].text : "";
        const results = extractJSONArray(text) as
          | { chunkIndex: number; departmentIds: string[] }[]
          | null;

        if (results) {
          for (const result of results) {
            const chunk = batch[result.chunkIndex];
            if (!chunk) continue;

            let deptIds = result.departmentIds;
            if (deptIds.includes("ALL")) {
              deptIds = allDeptIds;
            }

            if (deptIds.length > 0) {
              await prisma.contentChunk.update({
                where: { id: chunk.id },
                data: {
                  departmentIds: JSON.stringify(deptIds),
                  classifiedAt: new Date(),
                  classificationMethod: "llm",
                },
                select: { id: true }, // pgvector: Prisma cannot deserialize the embedding column
              });
              llmCount++;
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`LLM batch ${i / BATCH_SIZE}: ${msg}`);
        console.error(`[chunk-classifier] LLM batch error:`, err);
      }
    }
  }

  // ── Operator-wide fallback ──────────────────────────────

  const allDeptIds = lookups.departments.map((d) => d.id);

  const fallbackResult = await prisma.contentChunk.updateMany({
    where: { operatorId, classifiedAt: null },
    data: {
      departmentIds: JSON.stringify(allDeptIds),
      classifiedAt: new Date(),
      classificationMethod: "operator_wide",
    },
  });
  const operatorWideCount = fallbackResult.count;

  console.log(
    `[chunk-classifier] Operator ${operatorId}: ${algorithmicCount} algorithmic, ${llmCount} LLM, ${operatorWideCount} operator-wide, ${alreadyClassified} already classified`,
  );

  return {
    totalChunks,
    algorithmicCount,
    llmCount,
    operatorWideCount,
    alreadyClassified,
    errors,
  };
}

// ─── Secondary: classifyNewChunks ────────────────────────

export async function classifyNewChunks(
  operatorId: string,
  sourceType: string,
  sourceId: string,
): Promise<number> {
  const chunks = await prisma.contentChunk.findMany({
    where: { operatorId, sourceType, sourceId, classifiedAt: null },
    select: {
      id: true,
      entityId: true,
      sourceType: true,
      metadata: true,
      departmentIds: true,
    },
  });

  if (chunks.length === 0) return 0;

  const lookups = await buildLookupTables(operatorId);

  let classified = 0;
  for (const chunk of chunks) {
    const deptIds = await classifyChunkAlgorithmically(chunk, lookups);

    if (deptIds.size > 0) {
      await prisma.contentChunk.update({
        where: { id: chunk.id },
        data: {
          departmentIds: JSON.stringify([...deptIds]),
          classifiedAt: new Date(),
          classificationMethod: "algorithmic",
        },
        select: { id: true }, // pgvector: Prisma cannot deserialize the embedding column
      });
      classified++;
    }
  }

  return classified;
}

// ─── Shared Helpers ──────────────────────────────────────

async function buildLookupTables(operatorId: string): Promise<LookupTables> {
  const teamMembers = await prisma.entity.findMany({
    where: {
      operatorId,
      entityType: { slug: "team-member" },
      status: "active",
      parentDepartmentId: { not: null },
    },
    include: {
      propertyValues: { include: { property: true } },
    },
  });

  const emailToDeptIds = new Map<string, Set<string>>();
  const entityIdToDeptIds = new Map<string, string[]>();

  for (const member of teamMembers) {
    const deptIds = await getDepartmentIdsForEntity(member.id, member.parentDepartmentId!);
    entityIdToDeptIds.set(member.id, deptIds);

    const emailPv = member.propertyValues.find(
      (pv) => pv.property.identityRole === "email" || pv.property.slug === "email",
    );
    if (emailPv) {
      const email = emailPv.value.toLowerCase();
      const existing = emailToDeptIds.get(email) ?? new Set<string>();
      for (const d of deptIds) existing.add(d);
      emailToDeptIds.set(email, existing);
    }
  }

  const departments = await prisma.entity.findMany({
    where: { operatorId, category: "foundational", status: "active" },
    select: { id: true, displayName: true, description: true },
  });

  const slackMappings = await prisma.slackChannelMapping.findMany({
    where: { operatorId },
    select: { channelId: true, departmentId: true },
  });
  const slackChannelToDept = new Map<string, string>();
  for (const m of slackMappings) {
    slackChannelToDept.set(m.channelId, m.departmentId);
  }

  return { emailToDeptIds, entityIdToDeptIds, slackChannelToDept, departments };
}

async function classifyChunkAlgorithmically(
  chunk: ClassifiableChunk,
  lookups: LookupTables,
): Promise<Set<string>> {
  const allDeptIds = new Set<string>();

  // Parse metadata once — reused by multiple strategies
  let meta: Record<string, unknown> | null = null;
  if (chunk.metadata) {
    try {
      meta = typeof chunk.metadata === "string"
        ? JSON.parse(chunk.metadata)
        : chunk.metadata as Record<string, unknown>;
    } catch { /* ignore unparseable metadata */ }
  }

  // Strategy 1: Entity chain
  if (chunk.entityId) {
    const cached = lookups.entityIdToDeptIds.get(chunk.entityId);
    if (cached) {
      for (const d of cached) allDeptIds.add(d);
    } else {
      const deptIds = await getDepartmentIdsForEntity(chunk.entityId);
      if (deptIds.length > 0) {
        lookups.entityIdToDeptIds.set(chunk.entityId, deptIds);
        for (const d of deptIds) allDeptIds.add(d);
      }
    }
  }

  // Strategy 2: Metadata email resolution
  if (meta) {
    const emails = extractEmailsFromMetadata(meta);
    for (const email of emails) {
      const deptSet = lookups.emailToDeptIds.get(email.toLowerCase());
      if (deptSet) {
        for (const d of deptSet) allDeptIds.add(d);
      }
    }
  }

  // Strategy 3: Slack channel mapping
  if (chunk.sourceType === "slack_message" && meta && typeof meta.channelId === "string") {
    const deptId = lookups.slackChannelToDept.get(meta.channelId);
    if (deptId) allDeptIds.add(deptId);
  }

  // Strategy 4: Merge with existing departmentIds
  if (chunk.departmentIds && chunk.departmentIds !== "null" && chunk.departmentIds !== "[]") {
    try {
      const existing = JSON.parse(chunk.departmentIds) as string[];
      for (const d of existing) allDeptIds.add(d);
    } catch {
      // ignore malformed
    }
  }

  return allDeptIds;
}

export async function buildDepartmentContext(operatorId: string): Promise<{
  departments: Array<{ id: string; displayName: string; description: string | null }>;
  contextString: string;
}> {
  const departments = await prisma.entity.findMany({
    where: { operatorId, category: "foundational", status: "active" },
    select: { id: true, displayName: true, description: true },
  });

  if (departments.length === 0) {
    return { departments, contextString: "" };
  }

  // Single query: all base members across all departments
  const allMembers = await prisma.entity.findMany({
    where: {
      operatorId,
      category: "base",
      status: "active",
      parentDepartmentId: { in: departments.map((d) => d.id) },
    },
    select: { displayName: true, parentDepartmentId: true },
  });

  // Group by department, take first 5 per department
  const deptMembers = new Map<string, string[]>();
  for (const member of allMembers) {
    if (!member.parentDepartmentId) continue;
    const list = deptMembers.get(member.parentDepartmentId) || [];
    if (list.length < 5) list.push(member.displayName);
    deptMembers.set(member.parentDepartmentId, list);
  }

  const contextString = departments
    .map((d) => {
      const members = deptMembers.get(d.id) || [];
      const memberStr = members.join(", ");
      return `- ${d.displayName} (ID: ${d.id}): ${d.description || "No description"}. Key members: ${memberStr || "none listed"}`;
    })
    .join("\n");

  return { departments, contextString };
}

// ─── Private Helpers ─────────────────────────────────────

async function getDepartmentIdsForEntity(
  entityId: string,
  knownParentDeptId?: string,
): Promise<string[]> {
  const deptIds: string[] = [];

  if (knownParentDeptId) {
    deptIds.push(knownParentDeptId);
  } else {
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { parentDepartmentId: true },
    });
    if (entity?.parentDepartmentId) {
      deptIds.push(entity.parentDepartmentId);
    }
  }

  // Also check department-member relationships
  const memberRels = await prisma.relationship.findMany({
    where: {
      fromEntityId: entityId,
      relationshipType: { slug: "department-member" },
    },
    select: { toEntityId: true },
  });
  for (const rel of memberRels) {
    if (!deptIds.includes(rel.toEntityId)) {
      deptIds.push(rel.toEntityId);
    }
  }

  return deptIds;
}

function extractEmailsFromMetadata(meta: Record<string, unknown>): string[] {
  const emails: string[] = [];

  const emailFields = ["from", "to", "cc", "bcc", "sender", "authorEmail", "author"];
  for (const field of emailFields) {
    const val = meta[field];
    if (typeof val === "string") {
      const parts = val.split(",").map((s) => s.trim());
      for (const part of parts) {
        if (part.includes("@")) emails.push(part);
      }
    }
    if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === "string") {
          const parts = v.split(",").map((s) => s.trim());
          for (const part of parts) {
            if (part.includes("@")) emails.push(part);
          }
        }
      }
    }
  }

  // Calendar attendees
  if (Array.isArray(meta.attendees)) {
    for (const a of meta.attendees) {
      if (typeof a === "string" && a.includes("@")) emails.push(a);
    }
  }

  return [...new Set(emails)];
}
