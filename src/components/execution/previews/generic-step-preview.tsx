"use client";

import { useTranslations } from "next-intl";
import type { PreviewProps } from "./get-preview-component";
import { titleCase } from "./html-helpers";

function renderValue(value: unknown): { isComplex: boolean; display: string } {
  if (value === null || value === undefined) return { isComplex: false, display: "—" };
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { isComplex: false, display: String(value) };
  }
  if (Array.isArray(value)) {
    const allSimple = value.every(v => typeof v === "string" || typeof v === "number");
    if (allSimple) return { isComplex: false, display: value.join(", ") };
    return { isComplex: true, display: JSON.stringify(value, null, 2) };
  }
  return { isComplex: true, display: JSON.stringify(value, null, 2) };
}

export function GenericStepPreview({ step, inPanel }: PreviewProps) {
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};
  const entries = Object.entries(params).filter(([key]) => key !== "previewType");

  if (entries.length === 0) {
    return (
      <div className={inPanel ? "" : "rounded-md overflow-hidden"} style={inPanel ? { padding: 16 } : { border: "1px solid #2a2a2a", background: "#141414" }}>
        <div
          className={inPanel ? "" : "px-4 py-3"}
          style={inPanel ? { border: "0.5px solid var(--border)", borderRadius: 8, background: "var(--surface)", padding: "16px 20px" } : undefined}
        >
          <div style={{ fontSize: inPanel ? 17 : 14, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3, marginBottom: step.description ? 8 : 0 }}>
            {step.title}
          </div>
          {step.description && (
            <div style={{ fontSize: inPanel ? 14 : 13, lineHeight: 1.65, color: "var(--fg2)" }}>
              {step.description}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={inPanel ? "" : "rounded-md overflow-hidden"} style={inPanel ? {} : { border: "1px solid #2a2a2a", background: "#141414" }}>
      {!inPanel && (
        <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #222", background: "#181818" }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#b0b0b0" }}>{t("parameter")}</span>
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        {entries.map(([key, value]) => {
          const { isComplex, display } = renderValue(value);
          return (
            <div key={key}>
              <span style={{ fontSize: 11, color: "#585858", fontWeight: 500 }}>{titleCase(key)}</span>
              {isComplex ? (
                <pre
                  className="mt-1 overflow-x-auto"
                  style={{ fontSize: 12, color: "#808080", background: "rgba(255,255,255,0.03)", padding: "6px 8px", borderRadius: 3, fontFamily: "monospace" }}
                >
                  {display}
                </pre>
              ) : (
                <p style={{ fontSize: 13, color: "#b0b0b0", marginTop: 1 }}>{display}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
