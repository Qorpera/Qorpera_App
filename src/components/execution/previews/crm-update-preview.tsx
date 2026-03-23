"use client";

import { useState, useEffect } from "react";
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

export function CrmUpdatePreview(props: PreviewProps) {
  const { step, locale } = props;
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};

  const entityId = params.entityId as string | undefined;
  const updates = (params.updates ?? {}) as Record<string, unknown>;

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
    return <GenericStepPreview {...props} />;
  }

  // Error or entity not found — show warning + raw values
  if (error || (!loading && entityId && !entity)) {
    return (
      <div className="rounded-md overflow-hidden" style={{ border: "1px solid #2a2a2a", background: "#141414" }}>
        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid #222", background: "#181818" }}>
          <DatabaseIcon size={14} className="text-purple-400 flex-shrink-0" />
          <span style={{ fontSize: 12, fontWeight: 500, color: "#b0b0b0" }}>{t("crmUpdate")}</span>
        </div>
        <div className="px-4 py-3">
          <p style={{ fontSize: 12, color: "#f59e0b", marginBottom: 8 }}>
            {t("entityNotFound")} — {t("showingRawValues")}
          </p>
          <div className="space-y-1.5">
            {Object.entries(updates).map(([key, val]) => (
              <div key={key} className="flex items-baseline gap-2">
                <span style={{ fontSize: 11, color: "#585858", fontWeight: 500 }}>{titleCase(key)}</span>
                <span style={{ fontSize: 13, color: "#b0b0b0" }}>{String(val)}</span>
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
    <div className="rounded-md overflow-hidden" style={{ border: "1px solid #2a2a2a", background: "#141414" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid #222", background: "#181818" }}>
        <DatabaseIcon size={14} className="text-purple-400 flex-shrink-0" />
        <span style={{ fontSize: 12, fontWeight: 500, color: "#b0b0b0" }}>{t("crmUpdate")}</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Entity info */}
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-40 rounded animate-pulse" style={{ background: "#222" }} />
            <div className="h-3 w-24 rounded animate-pulse" style={{ background: "#1e1e1e" }} />
          </div>
        ) : entity ? (
          <div>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 14, fontWeight: 600, color: "#d0d0d0" }}>{entity.displayName}</span>
              {entity.entityType && (
                <span style={{ fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3, background: "rgba(168,85,247,0.12)", color: "#c084fc" }}>
                  {entity.entityType.name}
                </span>
              )}
              {entity.sourceSystem && (
                <span style={{ fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3, background: "rgba(59,130,246,0.12)", color: "#60a5fa" }}>
                  {entity.sourceSystem}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: "#484848", marginTop: 2 }}>
              {t("lastSynced", { time: formatRelativeTime(entity.updatedAt, locale) })}
            </p>
          </div>
        ) : null}

        {/* Diff table */}
        {updateEntries.length > 0 && (
          <div style={{ border: "1px solid #222", borderRadius: 4, overflow: "hidden" }}>
            {/* Table header */}
            <div className="flex" style={{ background: "#181818", borderBottom: "1px solid #222" }}>
              <div className="flex-1 px-3 py-1.5" style={{ fontSize: 10, fontWeight: 600, color: "#585858", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("field")}
              </div>
              <div className="flex-1 px-3 py-1.5" style={{ fontSize: 10, fontWeight: 600, color: "#585858", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("currentValue")}
              </div>
              <div style={{ width: 24 }} />
              <div className="flex-1 px-3 py-1.5" style={{ fontSize: 10, fontWeight: 600, color: "#585858", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {t("newValue")}
              </div>
            </div>

            {/* Rows */}
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex" style={{ borderBottom: i < 2 ? "1px solid #1e1e1e" : "none" }}>
                  <div className="flex-1 px-3 py-2"><div className="h-3 w-16 rounded animate-pulse" style={{ background: "#1e1e1e" }} /></div>
                  <div className="flex-1 px-3 py-2"><div className="h-3 w-20 rounded animate-pulse" style={{ background: "#1e1e1e" }} /></div>
                  <div style={{ width: 24 }} />
                  <div className="flex-1 px-3 py-2"><div className="h-3 w-20 rounded animate-pulse" style={{ background: "#1e1e1e" }} /></div>
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
                      borderBottom: i < updateEntries.length - 1 ? "1px solid #1e1e1e" : "none",
                      background: isChanged ? "rgba(34,197,94,0.03)" : "transparent",
                    }}
                  >
                    <div className="flex-1 px-3 py-2">
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#909090" }}>{titleCase(key)}</span>
                    </div>
                    <div className="flex-1 px-3 py-2">
                      <span style={{ fontSize: 12, color: isChanged ? "#707070" : "#484848", textDecoration: isChanged ? "line-through" : "none" }}>
                        {currentVal}
                      </span>
                    </div>
                    <div style={{ width: 24, textAlign: "center" }}>
                      <span style={{ fontSize: 11, color: isChanged ? "#585858" : "#333" }}>&rarr;</span>
                    </div>
                    <div className="flex-1 px-3 py-2">
                      <span style={{ fontSize: 12, fontWeight: isChanged ? 500 : 400, color: isChanged ? "#22c55e" : "#484848" }}>
                        {newValStr}
                        {!isChanged && (
                          <span style={{ fontSize: 10, color: "#484848", marginLeft: 4 }}>({t("unchanged")})</span>
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

