"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { FileDrop } from "@/components/ui/file-drop";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface EntityType {
  id: string;
  name: string;
  slug: string;
  properties: { id: string; name: string; slug: string }[];
}

interface ColumnMapping {
  sourceColumn: string;
  targetProperty: string | null;
  targetPropertyId: string | null;
}

interface ImportJob {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  rowsTotal: number;
  rowsProcessed: number;
  rowsSkipped: number;
  targetTypeSlug: string | null;
  createdAt: string;
}

interface UploadResult {
  job: ImportJob;
  headers: string[];
  previewRows: Record<string, string>[];
  inferredTypes: Record<string, string>;
  suggestedMapping: { sourceColumn: string; targetProperty: string | null }[] | null;
}

export default function ImportPage() {
  const [types, setTypes] = useState<EntityType[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [targetTypeSlug, setTargetTypeSlug] = useState("");
  const [columnMapping, setColumnMapping] = useState<ColumnMapping[]>([]);
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch entity types and import jobs
  const fetchData = useCallback(async () => {
    try {
      const [typesRes, jobsRes] = await Promise.all([
        fetch("/api/entity-types"),
        fetch("/api/import"),
      ]);
      if (typesRes.ok) setTypes(await typesRes.json());
      if (jobsRes.ok) setJobs(await jobsRes.json());
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle file upload
  const handleFile = useCallback(
    async (content: string, fileName: string) => {
      setUploadError(null);
      const fileType = fileName.endsWith(".json") ? "json" : "csv";

      try {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName,
            fileType,
            content,
            targetTypeSlug: targetTypeSlug || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const result: UploadResult = await res.json();
        setUploadResult(result);

        // Initialize column mapping from headers
        const mapping: ColumnMapping[] = result.headers.map((col) => {
          const suggested = result.suggestedMapping?.find(
            (m) => m.sourceColumn === col,
          );
          return {
            sourceColumn: col,
            targetProperty: suggested?.targetProperty ?? null,
            targetPropertyId: null,
          };
        });
        setColumnMapping(mapping);
        fetchData();
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Upload failed",
        );
      }
    },
    [targetTypeSlug, fetchData],
  );

  // Handle column mapping change
  const updateMapping = (index: number, targetProperty: string | null) => {
    setColumnMapping((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], targetProperty };
      return next;
    });
  };

  // Process import
  const handleProcess = async () => {
    if (!uploadResult || !targetTypeSlug) return;
    setProcessing(true);
    setUploadError(null);

    try {
      // Save mapping first
      await fetch(`/api/import/${uploadResult.job.id}/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetTypeSlug,
          columnMapping: columnMapping.filter((m) => m.targetProperty),
        }),
      });

      // Process
      const res = await fetch(`/api/import/${uploadResult.job.id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      setUploadResult(null);
      setColumnMapping([]);
      fetchData();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Processing failed",
      );
    } finally {
      setProcessing(false);
    }
  };

  const typeOptions = [
    { value: "", label: "Select entity type..." },
    ...types.map((t) => ({ value: t.slug, label: t.name })),
  ];

  const currentType = types.find((t) => t.slug === targetTypeSlug);
  const propertyOptions = [
    { value: "", label: "-- Skip --" },
    { value: "__displayName", label: "Display Name (required)" },
    ...(currentType?.properties.map((p) => ({
      value: p.slug,
      label: p.name,
    })) ?? []),
  ];

  const statusColor: Record<string, string> = {
    pending: "amber",
    processing: "blue",
    completed: "green",
    failed: "red",
  };

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <h1 className="text-2xl font-semibold text-white/90">Import Data</h1>

        {/* File drop */}
        {!uploadResult && <FileDrop onFile={handleFile} />}

        {uploadError && (
          <div className="text-sm text-red-400">{uploadError}</div>
        )}

        {/* Column mapping UI */}
        {uploadResult && (
          <div className="wf-soft p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-white/90">
                  {uploadResult.job.fileName}
                </h2>
                <p className="text-xs text-white/40">
                  {uploadResult.headers.length} columns detected
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setUploadResult(null);
                  setColumnMapping([]);
                }}
              >
                Cancel
              </Button>
            </div>

            {/* Target type selector */}
            <Select
              label="Target Entity Type"
              options={typeOptions}
              value={targetTypeSlug}
              onChange={(e) => setTargetTypeSlug(e.target.value)}
            />

            {/* Column mapping table */}
            {targetTypeSlug && (
              <div>
                <h3 className="text-sm font-medium text-white/60 mb-3">
                  Column Mapping
                </h3>
                <div className="space-y-2">
                  {columnMapping.map((col, i) => (
                    <div
                      key={col.sourceColumn}
                      className="flex items-center gap-4"
                    >
                      <span className="text-sm text-white/70 w-40 truncate">
                        {col.sourceColumn}
                      </span>
                      <svg
                        className="w-4 h-4 text-white/20 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                        />
                      </svg>
                      <div className="flex-1">
                        <Select
                          options={propertyOptions}
                          value={col.targetProperty ?? ""}
                          onChange={(e) =>
                            updateMapping(i, e.target.value || null)
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Process button */}
            {targetTypeSlug && (
              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  onClick={handleProcess}
                  disabled={
                    processing ||
                    !columnMapping.some((m) => m.targetProperty)
                  }
                >
                  {processing ? "Processing..." : "Process Import"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Recent import jobs */}
        <section>
          <h2 className="text-lg font-medium text-white/80 mb-4">
            Recent Imports
          </h2>
          {loading && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
            </div>
          )}
          {!loading && jobs.length === 0 && (
            <p className="text-sm text-white/40">No import jobs yet.</p>
          )}
          {!loading && jobs.length > 0 && (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="wf-soft px-5 py-3 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-sm text-white/80 truncate">
                      {job.fileName}
                    </div>
                    <div className="text-xs text-white/40">
                      {job.rowsProcessed} / {job.rowsTotal} rows
                      {job.rowsSkipped > 0 && ` (${job.rowsSkipped} skipped)`}
                    </div>
                  </div>
                  <Badge
                    variant={
                      (statusColor[job.status] as "green" | "amber" | "red" | "blue") ??
                      "default"
                    }
                  >
                    {job.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
