"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { PreviewProps } from "./get-preview-component";
import { isActMode } from "./get-preview-component";

function GridIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" />
    </svg>
  );
}

function PencilIcon({ size = 11, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

const MAX_VISIBLE_ROWS = 20;
const MAX_VISIBLE_COLS = 10;

export function SpreadsheetPreview({ step, isEditable, onParametersUpdate, locale: _locale }: PreviewProps) {
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};

  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [cellEditValue, setCellEditValue] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);

  const title = (params.title ?? params.name ?? "") as string;
  const sheetName = (params.sheetName ?? params.tabName ?? "") as string;
  const rawData = (params.initialData ?? params.values ?? params.rows ?? []) as unknown[][];
  const data: unknown[][] = Array.isArray(rawData) ? rawData : [];

  const canEdit = isEditable && step.status === "pending";

  // Determine max columns across all rows
  const maxCols = Math.min(
    MAX_VISIBLE_COLS,
    data.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0),
  );

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingCell) cellInputRef.current?.focus();
  }, [editingCell]);

  function startTitleEdit() {
    if (!canEdit) return;
    setEditingTitle(true);
    setEditTitleValue(title);
  }

  function saveTitleEdit() {
    if (!onParametersUpdate) return;
    onParametersUpdate({ ...params, title: editTitleValue });
    setEditingTitle(false);
  }

  function startCellEdit(row: number, col: number) {
    if (!canEdit) return;
    setEditingCell({ row, col });
    const rowData = data[row];
    const val = Array.isArray(rowData) && col < rowData.length ? rowData[col] : "";
    setCellEditValue(String(val ?? ""));
  }

  const saveCellEdit = useCallback(() => {
    if (!editingCell || !onParametersUpdate) return;
    const { row, col } = editingCell;
    const newData = data.map((r, ri) => {
      if (ri !== row) return Array.isArray(r) ? [...r] : r;
      const newRow = Array.isArray(r) ? [...r] : [];
      // Pad if needed
      while (newRow.length <= col) newRow.push("");
      newRow[col] = cellEditValue;
      return newRow;
    });
    // Write back using whichever key the params originally used
    const dataKey = params.initialData ? "initialData" : params.values ? "values" : "rows";
    onParametersUpdate({ ...params, [dataKey]: newData });
    setEditingCell(null);
  }, [editingCell, onParametersUpdate, data, cellEditValue, params]);

  function handleCellKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveCellEdit();
    }
  }

  const visibleData = data.slice(0, MAX_VISIBLE_ROWS + 1); // +1 for header row
  const hasMore = data.length > MAX_VISIBLE_ROWS + 1;
  const showAiDisclosure = isActMode(step);

  return (
    <div className="rounded-md overflow-hidden border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
        <GridIcon size={14} className="text-accent flex-shrink-0" />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{t("spreadsheet")}</span>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Title */}
        <div className="flex items-baseline gap-2 group">
          <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 56 }}>{t("spreadsheetTitle")}</span>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={editTitleValue}
              onChange={e => setEditTitleValue(e.target.value)}
              onBlur={saveTitleEdit}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveTitleEdit(); } }}
              className="flex-1 outline-none"
              style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 3, padding: "2px 6px" }}
            />
          ) : (
            <span
              className={canEdit ? "cursor-pointer hover:text-[#d0d0d0]" : ""}
              style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}
              onClick={startTitleEdit}
            >
              {title}
              {canEdit && (
                <PencilIcon size={11} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
              )}
            </span>
          )}
        </div>

        {/* Sheet name */}
        {sheetName && (
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 56 }}>{t("spreadsheetSheet")}</span>
            <span style={{ fontSize: 12, color: "var(--fg2)" }}>{sheetName}</span>
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />

        {/* Data table */}
        {data.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--fg2)", fontStyle: "italic" }}>{t("spreadsheetNoData")}</p>
        ) : (
          <div className="overflow-x-auto" style={{ maxWidth: "100%" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
              <thead>
                {visibleData.length > 0 && (
                  <tr>
                    {Array.from({ length: maxCols }).map((_, ci) => {
                      const headerRow = visibleData[0];
                      const val = Array.isArray(headerRow) && ci < headerRow.length ? headerRow[ci] : "";
                      return (
                        <th
                          key={ci}
                          style={{
                            padding: "4px 8px",
                            textAlign: "left",
                            fontWeight: 600,
                            color: "var(--muted)",
                            background: "color-mix(in srgb, var(--accent) 6%, transparent)",
                            borderBottom: "1px solid var(--border)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {editingCell?.row === 0 && editingCell?.col === ci ? (
                            <input
                              ref={cellInputRef}
                              value={cellEditValue}
                              onChange={e => setCellEditValue(e.target.value)}
                              onBlur={saveCellEdit}
                              onKeyDown={handleCellKeyDown}
                              style={{ fontSize: 12, fontWeight: 600, width: "100%", outline: "none", color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 2, padding: "1px 4px" }}
                            />
                          ) : (
                            <span
                              className={canEdit ? "cursor-pointer" : ""}
                              onClick={() => startCellEdit(0, ci)}
                            >
                              {String(val ?? "")}
                            </span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                )}
              </thead>
              <tbody>
                {visibleData.slice(1).map((row, ri) => {
                  const actualRow = ri + 1; // offset for header
                  return (
                    <tr key={ri}>
                      {Array.from({ length: maxCols }).map((_, ci) => {
                        const val = Array.isArray(row) && ci < row.length ? row[ci] : "";
                        return (
                          <td
                            key={ci}
                            style={{
                              padding: "3px 8px",
                              color: "var(--muted)",
                              borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {editingCell?.row === actualRow && editingCell?.col === ci ? (
                              <input
                                ref={cellInputRef}
                                value={cellEditValue}
                                onChange={e => setCellEditValue(e.target.value)}
                                onBlur={saveCellEdit}
                                onKeyDown={handleCellKeyDown}
                                style={{ fontSize: 12, width: "100%", outline: "none", color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 2, padding: "1px 4px" }}
                              />
                            ) : (
                              <span
                                className={canEdit ? "cursor-pointer" : ""}
                                onClick={() => startCellEdit(actualRow, ci)}
                              >
                                {String(val ?? "")}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hasMore && (
              <p style={{ fontSize: 11, color: "var(--fg2)", marginTop: 4, fontStyle: "italic" }}>
                … {data.length - MAX_VISIBLE_ROWS - 1} more rows
              </p>
            )}
          </div>
        )}

        {/* AI Disclosure footer */}
        {showAiDisclosure && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
            <p style={{ fontSize: 11, color: "var(--fg2)", fontStyle: "italic" }}>
              {t("aiDisclosure")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
