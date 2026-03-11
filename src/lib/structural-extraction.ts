import { prisma } from "@/lib/db";
import { callLLM, type AIMessage } from "@/lib/ai-provider";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedPerson {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  reportsTo?: string; // name of manager
}

export type ExtractionResult =
  | { type: "org-chart"; people: ExtractedPerson[] }
  | { type: "playbook" };

// ── Diff Types ───────────────────────────────────────────────────────────────

export type DiffAction = "create" | "update" | "flag-missing";

export interface PersonDiff {
  action: DiffAction;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  reportsTo?: string;
  existingEntityId?: string; // if update or flag-missing
  changes?: Record<string, { from: string; to: string }>; // for updates
  selected: boolean; // user can toggle each item
}

export interface PropertyDiff {
  action: "create" | "update";
  targetEntityId: string;
  targetEntityName: string;
  property: string;
  label: string;
  oldValue?: string;
  newValue: string;
  selected: boolean;
}

export interface ExtractionDiff {
  type: string;
  people?: PersonDiff[];
  properties?: PropertyDiff[];
  summary: string; // human-readable summary
}

// ── Extraction Templates ─────────────────────────────────────────────────────

function buildOrgChartPrompt(departmentName: string): string {
  return `You are analyzing an organizational chart for the "${departmentName}" department.

Extract every person mentioned with their:
- name (full name as written)
- role (job title or position)
- email (if visible)
- phone (if visible)
- reportsTo (name of their direct manager, if the hierarchy is shown)

RULES:
1. Only extract PEOPLE — not departments, projects, or abstract concepts.
2. Use names exactly as written in the document.
3. If the reporting hierarchy is ambiguous, omit reportsTo rather than guess.
4. Include everyone shown, even if their role is unclear.

Respond with ONLY this JSON:
{
  "people": [
    { "name": "Full Name", "role": "Job Title", "email": "email@example.com", "reportsTo": "Manager Name" }
  ]
}`;
}


// ── Extract ──────────────────────────────────────────────────────────────────

export async function extractStructuralDocument(
  documentId: string,
  operatorId: string,
): Promise<ExtractionResult> {
  const doc = await prisma.internalDocument.findFirst({
    where: { id: documentId, operatorId },
  });
  if (!doc) throw new Error("Document not found");
  if (!doc.rawText) throw new Error("Document has no extracted text. Run text extraction first.");
  if (!doc.departmentId) throw new Error("Document has no department assigned");

  const department = await prisma.entity.findFirst({
    where: { id: doc.departmentId, operatorId, category: "foundational" },
  });
  if (!department) throw new Error("Department not found");

  const deptName = department.displayName;
  const text = doc.rawText.slice(0, 15000); // Safety limit

  switch (doc.documentType) {
    case "org-chart": {
      const systemPrompt = buildOrgChartPrompt(deptName);
      const messages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Extract from this document:\n\n${text}` },
      ];
      const response = await callLLM(messages, { temperature: 0.1, maxTokens: 4000, aiFunction: "reasoning" });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("LLM did not return valid JSON");
      const parsed = JSON.parse(jsonMatch[0]);
      return { type: "org-chart", people: parsed.people ?? [] };
    }
    case "playbook":
      // Playbooks don't extract entities — just return empty
      return { type: "playbook" };
    default:
      throw new Error(`Unknown structural document type: ${doc.documentType}`);
  }
}

// ── Diff Generation ──────────────────────────────────────────────────────────

export async function generateExtractionDiff(
  extraction: ExtractionResult,
  departmentId: string,
  operatorId: string,
): Promise<ExtractionDiff> {
  // Load current department members
  const currentMembers = await prisma.entity.findMany({
    where: {
      operatorId,
      parentDepartmentId: departmentId,
      category: "base",
      status: "active",
    },
    include: {
      propertyValues: {
        include: { property: { select: { slug: true, name: true } } },
      },
    },
  });

  if (extraction.type === "org-chart") {
    return generatePeopleDiff(extraction.people, currentMembers);
  }

  if (extraction.type === "playbook") {
    return { type: "playbook", summary: "Playbook uploaded (no entity extraction)" };
  }

  return { type: (extraction as ExtractionResult).type, summary: "Unknown extraction type" };
}

function generatePeopleDiff(
  extracted: ExtractedPerson[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentMembers: any[],
): ExtractionDiff {
  const diffs: PersonDiff[] = [];
  const matchedIds = new Set<string>();

  for (const person of extracted) {
    // Try to match by name (case-insensitive, partial match)
    const match = currentMembers.find(
      (m) =>
        m.displayName.toLowerCase().trim() === person.name.toLowerCase().trim() ||
        m.displayName.toLowerCase().includes(person.name.toLowerCase()) ||
        person.name.toLowerCase().includes(m.displayName.toLowerCase()),
    );

    if (match) {
      matchedIds.add(match.id);
      // Check for property changes
      const changes: Record<string, { from: string; to: string }> = {};
      const currentRole =
        match.propertyValues.find(
          (pv: { property: { slug: string } }) => pv.property.slug === "role",
        )?.value ?? "";
      const currentEmail =
        match.propertyValues.find(
          (pv: { property: { slug: string } }) => pv.property.slug === "email",
        )?.value ?? "";

      if (person.role && person.role !== currentRole) {
        changes.role = { from: currentRole, to: person.role };
      }
      if (person.email && person.email !== currentEmail) {
        changes.email = { from: currentEmail, to: person.email };
      }

      if (Object.keys(changes).length > 0) {
        diffs.push({
          action: "update",
          name: person.name,
          role: person.role,
          email: person.email,
          reportsTo: person.reportsTo,
          existingEntityId: match.id,
          changes,
          selected: true,
        });
      }
      // If no changes, skip (already in sync)
    } else {
      // New person
      diffs.push({
        action: "create",
        name: person.name,
        role: person.role,
        email: person.email,
        reportsTo: person.reportsTo,
        selected: true,
      });
    }
  }

  // Flag people in department but NOT in document
  for (const member of currentMembers) {
    if (!matchedIds.has(member.id)) {
      diffs.push({
        action: "flag-missing",
        name: member.displayName,
        existingEntityId: member.id,
        selected: false, // Don't auto-select removals
      });
    }
  }

  const creates = diffs.filter((d) => d.action === "create").length;
  const updates = diffs.filter((d) => d.action === "update").length;
  const missing = diffs.filter((d) => d.action === "flag-missing").length;

  const parts: string[] = [];
  if (creates > 0) parts.push(`${creates} new team member${creates > 1 ? "s" : ""}`);
  if (updates > 0) parts.push(`${updates} update${updates > 1 ? "s" : ""}`);
  if (missing > 0)
    parts.push(`${missing} existing member${missing > 1 ? "s" : ""} not found in document`);

  return {
    type: "people",
    people: diffs,
    summary: parts.length > 0 ? parts.join(", ") : "No changes detected",
  };
}

// ── Apply Confirmed Diff ─────────────────────────────────────────────────────

export async function applyExtractionDiff(
  diff: ExtractionDiff,
  departmentId: string,
  operatorId: string,
  documentId: string,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  if (diff.people) {
    for (const person of diff.people) {
      if (!person.selected) continue;

      if (person.action === "create") {
        // Ensure team-member entity type exists
        const def = HARDCODED_TYPE_DEFS["team-member"];
        let entityType = await prisma.entityType.findFirst({
          where: { operatorId, slug: "team-member" },
        });
        if (!entityType) {
          entityType = await prisma.entityType.create({
            data: {
              operatorId,
              slug: def.slug,
              name: def.name,
              description: def.description,
              icon: def.icon,
              color: def.color,
              defaultCategory: def.defaultCategory,
            },
          });
        }

        // Ensure properties exist
        for (const propDef of def.properties) {
          const existing = await prisma.entityProperty.findFirst({
            where: { entityTypeId: entityType.id, slug: propDef.slug },
          });
          if (!existing) {
            await prisma.entityProperty.create({
              data: {
                entityTypeId: entityType.id,
                slug: propDef.slug,
                name: propDef.name,
                dataType: propDef.dataType,
                identityRole: propDef.identityRole ?? null,
              },
            });
          }
        }

        // Check for duplicate by email if available
        let existingByEmail = null;
        if (person.email) {
          const emailProp = await prisma.entityProperty.findFirst({
            where: { entityTypeId: entityType.id, slug: "email" },
          });
          if (emailProp) {
            const pv = await prisma.propertyValue.findFirst({
              where: { propertyId: emailProp.id, value: person.email },
              include: { entity: true },
            });
            if (pv && pv.entity.operatorId === operatorId) {
              existingByEmail = pv.entity;
            }
          }
        }

        if (existingByEmail) {
          // Update existing entity — adopt into this department if not already
          if (existingByEmail.parentDepartmentId !== departmentId) {
            await prisma.entity.update({
              where: { id: existingByEmail.id },
              data: { parentDepartmentId: departmentId },
            });
          }
          updated++;
        } else {
          // Create new entity
          const entity = await prisma.entity.create({
            data: {
              operatorId,
              entityTypeId: entityType.id,
              displayName: person.name,
              category: "base",
              parentDepartmentId: departmentId,
              sourceSystem: "document",
              externalId: documentId,
            },
          });

          // Set properties
          const propDefs = await prisma.entityProperty.findMany({
            where: { entityTypeId: entityType.id },
          });
          const propMap = new Map(propDefs.map((p) => [p.slug, p.id]));

          if (person.role && propMap.has("role")) {
            await prisma.propertyValue.create({
              data: {
                entityId: entity.id,
                propertyId: propMap.get("role")!,
                value: person.role,
              },
            });
          }
          if (person.email && propMap.has("email")) {
            await prisma.propertyValue.create({
              data: {
                entityId: entity.id,
                propertyId: propMap.get("email")!,
                value: person.email,
              },
            });
          }
          if (person.phone && propMap.has("phone")) {
            await prisma.propertyValue.create({
              data: {
                entityId: entity.id,
                propertyId: propMap.get("phone")!,
                value: person.phone,
              },
            });
          }

          created++;
        }
      }

      if (person.action === "update" && person.existingEntityId && person.changes) {
        const entityType = await prisma.entityType.findFirst({
          where: { operatorId, slug: "team-member" },
        });
        if (!entityType) continue;

        for (const [propSlug, change] of Object.entries(person.changes)) {
          const prop = await prisma.entityProperty.findFirst({
            where: { entityTypeId: entityType.id, slug: propSlug },
          });
          if (!prop) continue;

          await prisma.propertyValue.upsert({
            where: {
              entityId_propertyId: {
                entityId: person.existingEntityId,
                propertyId: prop.id,
              },
            },
            update: { value: change.to },
            create: {
              entityId: person.existingEntityId,
              propertyId: prop.id,
              value: change.to,
            },
          });
        }
        updated++;
      }

      // Note: "flag-missing" with selected = true could mean "remove from department"
      // but we DON'T auto-remove. The flag is informational only.
      // If user wants to remove, they use the People section directly.
    }

    // Handle reports-to relationships for created/updated people
    // This runs after all creates so we can resolve names to IDs
    const allMembers = await prisma.entity.findMany({
      where: {
        operatorId,
        parentDepartmentId: departmentId,
        category: "base",
        status: "active",
      },
      select: { id: true, displayName: true, entityTypeId: true },
    });
    const memberByName = new Map(allMembers.map((m) => [m.displayName.toLowerCase(), m]));

    for (const person of diff.people.filter((p) => p.selected && p.reportsTo)) {
      const personEntity = memberByName.get(person.name.toLowerCase());
      const managerEntity = memberByName.get(person.reportsTo!.toLowerCase());
      if (!personEntity || !managerEntity) continue;

      // Ensure reports-to relationship type exists
      let relType = await prisma.relationshipType.findFirst({
        where: { operatorId, slug: "reports-to" },
      });
      if (!relType) {
        relType = await prisma.relationshipType.create({
          data: {
            operatorId,
            slug: "reports-to",
            name: "Reports To",
            fromEntityTypeId: personEntity.entityTypeId,
            toEntityTypeId: managerEntity.entityTypeId,
          },
        });
      }

      await prisma.relationship.upsert({
        where: {
          relationshipTypeId_fromEntityId_toEntityId: {
            relationshipTypeId: relType.id,
            fromEntityId: personEntity.id,
            toEntityId: managerEntity.id,
          },
        },
        update: {},
        create: {
          relationshipTypeId: relType.id,
          fromEntityId: personEntity.id,
          toEntityId: managerEntity.id,
        },
      });
    }
  }

  if (diff.properties) {
    for (const prop of diff.properties) {
      if (!prop.selected) continue;

      const entity = await prisma.entity.findFirst({
        where: { id: prop.targetEntityId, operatorId },
        include: { entityType: true },
      });
      if (!entity) continue;

      // Ensure property definition exists
      let propDef = await prisma.entityProperty.findFirst({
        where: { entityTypeId: entity.entityTypeId, slug: prop.property },
      });
      if (!propDef) {
        propDef = await prisma.entityProperty.create({
          data: {
            entityTypeId: entity.entityTypeId,
            slug: prop.property,
            name: prop.label,
            dataType: "STRING",
          },
        });
      }

      await prisma.propertyValue.upsert({
        where: {
          entityId_propertyId: { entityId: prop.targetEntityId, propertyId: propDef.id },
        },
        update: { value: prop.newValue },
        create: {
          entityId: prop.targetEntityId,
          propertyId: propDef.id,
          value: prop.newValue,
        },
      });

      if (prop.action === "create") created++;
      else updated++;
    }
  }

  return { created, updated };
}
