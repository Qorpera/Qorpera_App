"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";
import type { PreviewProps } from "./get-preview-component";
import { GenericStepPreview } from "./generic-step-preview";
import { titleCase } from "./html-helpers";

function DatabaseIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

interface EntityData {
  id: string;
  displayName: string;
  sourceSystem: string | null;
  updatedAt: string;
  entityType: { name: string };
  propertyValues: Array<{
    value: string;
    property: { name: string; slug: string };
  }>;
}

const RESERVED_KEYS = new Set(["previewType", "priorOutputs", "entityId", "_demo"]);

function isCreateSlug(slug: string): boolean {
  return slug.startsWith("create_");
}

function recordTypeFromSlug(slug: string): string {
  return titleCase(slug.replace("create_", "").replace(/_/g, " "));
}

export function CrmUpdatePreview(props: PreviewProps) {
  const { step, isEditable, onParametersUpdate, locale, inPanel } = props;
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};

  const slug = step.actionCapability?.slug ?? "";
  const isCreateAction = isCreateSlug(slug);

  // ── Create action: new record card ──────────────────────────────────────
  if (isCreateAction) {
    const fields = Object.fromEntries(
      Object.entries(params).filter(([k]) => !RESERVED_KEYS.has(k) && !k.startsWith("_")),
    );
    const recordType = recordTypeFromSlug(slug);
    const connectorName = step.actionCapability?.name?.split(" — ")[1] || "CRM";
    // Best guess at display name from fields
    const displayName = (
      (fields.name as string)
      || (fields.title as string)
      || (fields.dealname as string)
      || (fields.subject as string)
      || (fields.firstname ? `${fields.firstname} ${fields.lastname || ""}`.trim() : "")
    ) as string;

    return (
      <CrmNewRecordCard
        fields={fields}
        recordType={recordType}
        displayName={displayName}
        connectorName={connectorName}
        isEditable={isEditable}
        onParametersUpdate={onParametersUpdate}
        params={params}
        inPanel={inPanel}
        t={t}
      />
    );
  }

  // ── Update action: existing diff table ──────────────────────────────────
  const entityId = params.entityId as string | undefined;
  const updates = (params.updates ?? {}) as Record<string, unknown>;

  return (
    <CrmUpdateCard
      entityId={entityId}
      updates={updates}
      isEditable={isEditable}
      locale={locale}
      inPanel={inPanel}
      t={t}
      fallbackProps={props}
    />
  );
}

// ── New Record Card ─────────────────────────────────────────────────────────

function CrmNewRecordCard({
  fields,
  recordType,
  displayName,
  connectorName,
  isEditable,
  onParametersUpdate,
  params,
  inPanel,
  t,
}: {
  fields: Record<string, unknown>;
  recordType: string;
  displayName: string;
  connectorName: string;
  isEditable: boolean;
  onParametersUpdate?: (params: Record<string, unknown>) => void;
  params: Record<string, unknown>;
  inPanel?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [editingField]);

  function startEdit(key: string) {
    if (!isEditable) return;
    setEditingField(key);
    setEditValue(String(fields[key] ?? ""));
  }

  function saveEdit() {
    if (!editingField || !onParametersUpdate) return;
    onParametersUpdate({ ...params, [editingField]: editValue });
    setEditingField(null);
  }

  const fieldEntries = Object.entries(fields);

  return (
    <div className={inPanel ? "" : "rounded-md overflow-hidden border border-border bg-surface"}>
      {!inPanel && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
          <DatabaseIcon size={14} className="text-accent flex-shrink-0" />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{t("newRecord")}</span>
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        {/* Record header with NEW badge */}
        <div className="flex items-center gap-2">
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 3,
            background: "color-mix(in srgb, var(--ok) 15%, transparent)", color: "var(--ok)",
          }}>
            + NEW
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
            {recordType}
          </span>
        </div>

        {displayName && (
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginTop: -4 }}>
            {displayName}
          </p>
        )}

        {/* Field list */}
        <div className="space-y-1.5">
          {fieldEntries.map(([key, val]) => (
            <div key={key} className="flex items-baseline gap-2 group">
              <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 90 }}>
                {titleCase(key)}
              </span>
              {editingField === key ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
                    else if (e.key === "Escape") setEditingField(null);
                  }}
                  style={{
                    fontSize: 13, color: "var(--foreground)", width: "100%",
                    background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                    borderRadius: 3, padding: "2px 6px",
                  }}
                />
              ) : (
                <span
                  className={isEditable ? "cursor-pointer" : ""}
                  style={{ fontSize: 13, color: "var(--muted)" }}
                  onClick={() => startEdit(key)}
                >
                  {String(val)}
                  {isEditable && (
                    <PencilIcon size={11} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                  )}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p style={{ fontSize: 11, color: "var(--fg3)", marginTop: 8 }}>
          {t("willCreate", { connector: connectorName })}
        </p>
      </div>
    </div>
  );
}

function PencilIcon({ size = 11, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

// ── Update Card (original diff table) ───────────────────────────────────────

function CrmUpdateCard({
  entityId,
  updates,
  isEditable,
  locale,
  inPanel,
  t,
  fallbackProps,
}: {
  entityId: string | undefined;
  updates: Record<string, unknown>;
  isEditable: boolean;
  locale: string;
  inPanel?: boolean;
  t: ReturnType<typeof useTranslations>;
  fallbackProps: PreviewProps;
}) {
  const [entity, setEntity] = useState<EntityData | null>(null);
  const [loading, setLoading] = useState(!!entityId);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!entityId) { setLoading(false); return; }
    let cancelled = false;
    fetch(`/api/entities/${entityId}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => { if (!cancelled) setEntity(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityId]);

  // No entityId or no updates — fall through to generic
  if (!entityId && Object.keys(updates).length === 0) {
    return <GenericStepPreview {...fallbackProps} />;
  }

  // Error or entity not found — show warning + raw values
  if (error || (!loading && entityId && !entity)) {
    return (
      <div className={inPanel ? "" : "rounded-md overflow-hidden border border-border bg-surface"}>
        {!inPanel && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
            <DatabaseIcon size={14} className="text-accent flex-shrink-0" />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{t("crmUpdate")}</span>
          </div>
        )}
        <div className="px-4 py-3">
          <p style={{ fontSize: 12, color: "var(--warn)", marginBottom: 8 }}>
            {t("entityNotFound")} — {t("showingRawValues")}
          </p>
          <div className="space-y-1.5">
            {Object.entries(updates).map(([key, val]) => (
              <div key={key} className="flex items-baseline gap-2">
                <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500 }}>{titleCase(key)}</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>{String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Build property map from entity
  const currentValues: Record<string, string> = {};
  if (entity) {
    for (const pv of entity.propertyValues) {
      currentValues[pv.property.slug] = pv.value;
      currentValues[pv.property.name] = pv.value;
    }
  }

  const updateEntries = Object.entries(updates);

  return (
    <div className={inPanel ? "" : "rounded-md overflow-hidden border border-border bg-surface"}>
      {!inPanel && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
          <DatabaseIcon size={14} className="text-accent flex-shrink-0" />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{t("crmUpdate")}</span>
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        {/* Entity info */}
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-40 rounded animate-pulse bg-skeleton" />
            <div className="h-3 w-24 rounded animate-pulse bg-skeleton" />
          </div>
        ) : entity ? (
          <div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{entity.displayName}</span>
              {entity.entityType && (
                <span style={{ fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3, background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
                  {entity.entityType.name}
                </span>
              )}
              {entity.sourceSystem && (
                <span style={{ fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3, background: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)" }}>
                  {entity.sourceSystem}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>
              {t("lastSynced", { time: formatRelativeTime(entity.updatedAt, locale) })}
            </p>
          </div>
        ) : null}

        {/* Diff table */}
        {updateEntries.length > 0 && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
            {/* Table header */}
            <div className="flex" style={{ background: "var(--elevated)", borderBottom: "1px solid var(--border)" }}>
              <div className="flex-1 px-3 py-1.5" style={{ fontSize: 10, fontWeight: 600, color: "var(--fg2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("field")}
              </div>
              <div className="flex-1 px-3 py-1.5" style={{ fontSize: 10, fontWeight: 600, color: "var(--fg2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("currentValue")}
              </div>
              <div style={{ width: 24 }} />
              <div className="flex-1 px-3 py-1.5" style={{ fontSize: 10, fontWeight: 600, color: "var(--fg2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("newValue")}
              </div>
            </div>

            {/* Rows */}
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex" style={{ borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
                  <div className="flex-1 px-3 py-2"><div className="h-3 w-16 rounded animate-pulse" style={{ background: "var(--skeleton)" }} /></div>
                  <div className="flex-1 px-3 py-2"><div className="h-3 w-20 rounded animate-pulse" style={{ background: "var(--skeleton)" }} /></div>
                  <div style={{ width: 24 }} />
                  <div className="flex-1 px-3 py-2"><div className="h-3 w-20 rounded animate-pulse" style={{ background: "var(--skeleton)" }} /></div>
                </div>
              ))
            ) : (
              updateEntries.map(([key, newVal], i) => {
                const currentVal = currentValues[key] ?? "—";
                const newValStr = String(newVal);
                const isChanged = currentVal !== newValStr;

                return (
                  <div
                    key={key}
                    className="flex items-center"
                    style={{
                      borderBottom: i < updateEntries.length - 1 ? "1px solid var(--border)" : "none",
                      background: isChanged ? "color-mix(in srgb, var(--ok) 3%, transparent)" : "transparent",
                    }}
                  >
                    <div className="flex-1 px-3 py-2">
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{titleCase(key)}</span>
                    </div>
                    <div className="flex-1 px-3 py-2">
                      <span style={{ fontSize: 12, color: isChanged ? "var(--fg2)" : "var(--fg3)", textDecoration: isChanged ? "line-through" : "none" }}>
                        {currentVal}
                      </span>
                    </div>
                    <div style={{ width: 24, textAlign: "center" }}>
                      <span style={{ fontSize: 11, color: isChanged ? "var(--fg2)" : "var(--fg3)" }}>&rarr;</span>
                    </div>
                    <div className="flex-1 px-3 py-2">
                      <span style={{ fontSize: 12, fontWeight: isChanged ? 500 : 400, color: isChanged ? "var(--ok)" : "var(--fg3)" }}>
                        {newValStr}
                        {!isChanged && (
                          <span style={{ fontSize: 10, color: "var(--fg3)", marginLeft: 4 }}>({t("unchanged")})</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
