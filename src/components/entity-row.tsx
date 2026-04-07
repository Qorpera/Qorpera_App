"use client";

import { useState } from "react";
import { fetchApi } from "@/lib/fetch-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Relationship {
  id: string;
  direction: "outgoing" | "incoming";
  relationshipType: { id: string; name: string; slug: string };
  fromEntityId: string;
  toEntityId: string;
  fromEntity?: { id: string; displayName: string };
  toEntity?: { id: string; displayName: string };
}

interface EntityRowProps {
  entity: {
    id: string;
    displayName: string;
    properties: Record<string, string>;
    entityType?: { name: string; color: string; slug: string };
    sourceSystem?: string | null;
  };
  editMode: boolean;
  domainId: string;
  onRemoved?: () => void;
  onUpdated?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function prettifySlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EntityRow({ entity, editMode, domainId, onRemoved, onUpdated }: EntityRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingProps, setEditingProps] = useState<Record<string, string>>({});
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loadingRels, setLoadingRels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function expand() {
    setExpanded(true);
    let props = { ...entity.properties };

    // If properties are empty, fetch full entity
    if (Object.keys(props).length === 0) {
      const entityRes = await fetchApi(`/api/entities/${entity.id}`);
      if (entityRes.ok) {
        const fullEntity = await entityRes.json();
        const fetched: Record<string, string> = {};
        for (const pv of fullEntity.propertyValues ?? []) {
          fetched[pv.property?.slug ?? pv.propertyId] = pv.value;
        }
        props = fetched;
      }
    }

    setEditingProps(props);

    // Load relationships
    setLoadingRels(true);
    const res = await fetchApi(`/api/entities/${entity.id}/relationships`);
    if (res.ok) {
      const data = await res.json();
      // Flatten outgoing + incoming with direction marker
      const rels: Relationship[] = [];
      if (data.relationships?.outgoing) {
        for (const r of data.relationships.outgoing) {
          rels.push({ ...r, direction: "outgoing" as const });
        }
      }
      if (data.relationships?.incoming) {
        for (const r of data.relationships.incoming) {
          rels.push({ ...r, direction: "incoming" as const });
        }
      }
      setRelationships(rels);
    }
    setLoadingRels(false);
  }

  async function saveProperties() {
    setSaving(true);
    await fetchApi(`/api/entities/${entity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ properties: editingProps }),
    });
    setSaving(false);
    setExpanded(false);
    onUpdated?.();
  }

  async function removeRelationship(relId: string) {
    await fetchApi(`/api/relationships/${relId}`, { method: "DELETE" });
    setRelationships((prev) => prev.filter((r) => r.id !== relId));
  }

  async function removeFromDepartment() {
    const deptMemberRel = relationships.find(
      (r) =>
        r.relationshipType?.slug === "department-member" &&
        (r.toEntityId === domainId || r.fromEntityId === domainId),
    );
    if (deptMemberRel) {
      await fetchApi(`/api/relationships/${deptMemberRel.id}`, { method: "DELETE" });
    }
    setExpanded(false);
    setConfirmRemove(false);
    onRemoved?.();
  }

  async function deleteEntity() {
    await fetchApi(`/api/entities/${entity.id}`, { method: "DELETE" });
    setExpanded(false);
    onRemoved?.();
  }

  const color = entity.entityType?.color ?? "var(--accent)";
  const propEntries = Object.entries(entity.properties).slice(0, 3);

  return (
    <div className={`rounded-lg transition ${expanded ? "bg-hover border border-border" : ""}`}>
      {/* Collapsed row */}
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-hover transition">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm text-foreground flex-1 min-w-0 truncate">{entity.displayName}</span>
        {entity.entityType && (
          <span className="text-[10px] text-[var(--fg3)]">{entity.entityType.name}</span>
        )}
        {!expanded && propEntries.map(([k, v]) => (
          <span key={k} className="text-[10px] text-[var(--fg3)] truncate max-w-[100px] hidden sm:inline">{v}</span>
        ))}
        {entity.sourceSystem && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-hover text-[var(--fg3)]">{entity.sourceSystem}</span>
        )}
        {editMode && (
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); expanded ? setExpanded(false) : expand(); }}
              className="w-5 h-5 rounded bg-hover hover:bg-skeleton flex items-center justify-center transition"
              title={expanded ? "Collapse" : "Edit"}
            >
              <svg className="w-3 h-3 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Expanded area */}
      {expanded && editMode && (
        <div className="px-4 pb-4 pt-2 space-y-4">
          {/* Properties */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--fg2)] mb-2">Properties</p>
            {Object.keys(editingProps).length === 0 ? (
              <p className="text-xs text-[var(--fg3)]">No properties</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(editingProps).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-[var(--fg2)] w-28 flex-shrink-0 truncate">{prettifySlug(key)}</span>
                    <input
                      value={value}
                      onChange={(e) => setEditingProps((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="flex-1 bg-hover border border-border rounded px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>
            )}
            {Object.keys(editingProps).length > 0 && (
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={saveProperties} disabled={saving} className="text-[11px] text-accent hover:text-accent disabled:opacity-50">
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setExpanded(false)} className="text-[11px] text-[var(--fg2)] hover:text-foreground">Cancel</button>
              </div>
            )}
          </div>

          {/* Relationships */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--fg2)] mb-2">
              Relationships {!loadingRels && `(${relationships.length})`}
            </p>
            {loadingRels ? (
              <p className="text-xs text-[var(--fg3)]">Loading...</p>
            ) : relationships.length === 0 ? (
              <p className="text-xs text-[var(--fg3)]">No relationships</p>
            ) : (
              <div className="space-y-1">
                {relationships.map((rel) => {
                  const isOutgoing = rel.direction === "outgoing";
                  const linkedEntity = isOutgoing ? rel.toEntity : rel.fromEntity;
                  return (
                    <div key={rel.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-hover transition text-xs">
                      <span className="text-[var(--fg3)]">{isOutgoing ? "\u2192" : "\u2190"}</span>
                      <span className="text-[var(--fg2)]">{rel.relationshipType.name}</span>
                      <span className="text-[var(--fg2)] flex-1 truncate">{linkedEntity?.displayName ?? "Unknown"}</span>
                      <button
                        onClick={() => removeRelationship(rel.id)}
                        className="w-4 h-4 rounded bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] flex items-center justify-center transition flex-shrink-0"
                        title="Remove relationship"
                      >
                        <svg className="w-2.5 h-2.5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-border pt-3 flex items-center gap-4">
            {confirmRemove ? (
              <div className="flex-1">
                <p className="text-xs text-[var(--fg2)] mb-2">This will unlink the entity from this department. The entity will not be deleted.</p>
                <div className="flex gap-2">
                  <button onClick={removeFromDepartment} className="text-[11px] text-danger hover:text-danger">Confirm Remove</button>
                  <button onClick={() => setConfirmRemove(false)} className="text-[11px] text-[var(--fg2)] hover:text-foreground">Cancel</button>
                </div>
              </div>
            ) : confirmDelete ? (
              <div className="flex-1">
                <p className="text-xs text-danger/80 mb-2">Permanently delete this entity and all its relationships? This cannot be undone.</p>
                <div className="flex gap-2">
                  <button onClick={deleteEntity} className="text-[11px] text-danger hover:text-danger">Delete Permanently</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-[11px] text-[var(--fg2)] hover:text-foreground">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <button onClick={() => setConfirmRemove(true)} className="text-[11px] text-danger/70 hover:text-danger transition">
                  Remove from department
                </button>
                <button onClick={() => setConfirmDelete(true)} className="text-[11px] text-danger/50 hover:text-danger transition">
                  Delete entity
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
