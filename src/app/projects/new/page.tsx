"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { fetchApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────────────────────────

interface TemplateSection {
  id: string;
  title: string;
  generationMode: string;
  description: string;
}

interface ProjectTemplate {
  id: string;
  operatorId: string | null;
  name: string;
  description: string;
  category: string;
  analysisFramework: { sections: TemplateSection[] };
  dataExpectations: { requiredTypes: string[] };
}

interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  restrictionText: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
}

interface WizardState {
  template: ProjectTemplate | null;
  isBlank: boolean;
  name: string;
  description: string;
  dueDate: string;
  members: TeamMember[];
  files: File[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const STEPS = ["Template", "Details", "Team", "Data", "Review"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  financial: "Financial",
  legal: "Legal",
  audit: "Accounting & Audit",
  consulting: "Management Consulting",
  real_estate: "Real Estate",
  it_cyber: "IT & Cybersecurity",
  hr: "HR & Recruitment",
  compliance: "Compliance & Risk",
  healthcare: "Healthcare",
  media: "Media & Publishing",
  education: "Education",
  insurance: "Insurance",
  sustainability: "Sustainability",
};

const CATEGORY_COLORS: Record<string, string> = {
  financial: "#3b82f6",
  legal: "#8b5cf6",
  audit: "#f59e0b",
  consulting: "#10b981",
  real_estate: "#ef4444",
  it_cyber: "#06b6d4",
  hr: "#ec4899",
  compliance: "#f97316",
  healthcare: "#14b8a6",
  media: "#a855f7",
  education: "#6366f1",
  insurance: "#0ea5e9",
  sustainability: "#22c55e",
};

const ACCEPTED_TYPES = [
  ".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg", ".pptx",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["xls", "xlsx"].includes(ext)) return "XLS";
  if (ext === "csv") return "CSV";
  if (ext === "pptx") return "PPT";
  if (["png", "jpg", "jpeg"].includes(ext)) return "IMG";
  return "TXT";
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NewProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState("");

  const [state, setState] = useState<WizardState>({
    template: null,
    isBlank: false,
    name: "",
    description: "",
    dueDate: "",
    members: [],
    files: [],
  });

  // Load current user as first member
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchApi("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          const u = data.user;
          setState((s) => ({
            ...s,
            members: [
              { userId: u.id, name: u.name, email: u.email, role: "owner", restrictionText: "" },
            ],
          }));
        }
      } catch {}
    })();
  }, []);

  // ── Validation ──

  const canAdvance = useCallback((): boolean => {
    if (step === 0) return state.template !== null || state.isBlank;
    if (step === 1) return state.name.trim().length > 0;
    return true;
  }, [step, state.template, state.isBlank, state.name]);

  const goNext = useCallback(() => {
    if (canAdvance() && step < STEPS.length - 1) setStep(step + 1);
  }, [canAdvance, step]);

  const goBack = useCallback(() => {
    if (step > 0) setStep(step - 1);
  }, [step]);

  // ── Create ──

  const handleCreate = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setCreateStatus("Creating project...");
    try {
      const body: Record<string, unknown> = {
        name: state.name.trim(),
        description: state.description.trim() || null,
        dueDate: state.dueDate || null,
        templateId: state.template?.id ?? null,
        members: state.members.map((m) => ({
          userId: m.userId,
          role: m.role,
          restrictionText: m.restrictionText || null,
        })),
      };
      const res = await fetchApi("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setCreating(false);
        setCreateStatus("");
        return;
      }
      const data = await res.json();
      const projectId = data.project?.id ?? data.id;

      // Upload files (if any) — one at a time via existing upload endpoint
      if (state.files.length > 0) {
        setCreateStatus(`Uploading files (0/${state.files.length})...`);
        for (let i = 0; i < state.files.length; i++) {
          setCreateStatus(`Uploading files (${i + 1}/${state.files.length})...`);
          const formData = new FormData();
          formData.append("file", state.files[i]);
          try {
            await fetchApi(`/api/projects/${projectId}/upload`, {
              method: "POST",
              body: formData,
            });
          } catch {
            // Non-fatal — files can be uploaded later
          }
        }
      }

      router.push(`/projects/${projectId}`);
    } catch {
      setCreating(false);
      setCreateStatus("");
    }
  }, [creating, state, router]);

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px 80px" }}>

          {/* ── Header with step dots ── */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", marginBottom: 16 }}>
              New project
            </h1>
            <StepDots current={step} steps={STEPS} onJump={(i) => { if (i <= step) setStep(i); }} />
          </div>

          {/* ── Step content ── */}
          {step === 0 && (
            <StepTemplate
              selected={state.template}
              isBlank={state.isBlank}
              onSelect={(t) => {
                setState((s) => ({
                  ...s,
                  template: t,
                  isBlank: false,
                  name: t ? `${t.name} — ` : s.name,
                }));
              }}
              onBlank={() => setState((s) => ({ ...s, template: null, isBlank: true }))}
            />
          )}
          {step === 1 && (
            <StepDetails
              name={state.name}
              description={state.description}
              dueDate={state.dueDate}
              onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            />
          )}
          {step === 2 && (
            <StepTeam
              members={state.members}
              onChange={(members) => setState((s) => ({ ...s, members }))}
            />
          )}
          {step === 3 && (
            <StepData
              files={state.files}
              onChange={(files) => setState((s) => ({ ...s, files }))}
            />
          )}
          {step === 4 && <StepReview state={state} />}

          {/* ── Footer nav ── */}
          <div className="flex items-center justify-between" style={{ marginTop: 32 }}>
            <button
              onClick={step === 0 ? () => router.push("/projects") : goBack}
              style={{
                fontSize: 13,
                fontWeight: 500,
                padding: "8px 20px",
                borderRadius: 7,
                background: "rgba(255,255,255,0.06)",
                border: "0.5px solid rgba(255,255,255,0.1)",
                color: "var(--fg2)",
                cursor: "pointer",
              }}
              className="hover:brightness-125 transition"
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>

            {step < STEPS.length - 1 ? (
              <button
                onClick={goNext}
                disabled={!canAdvance()}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 24px",
                  borderRadius: 7,
                  background: canAdvance() ? "var(--foreground)" : "rgba(255,255,255,0.06)",
                  color: canAdvance() ? "var(--accent-ink)" : "var(--fg4)",
                  border: "none",
                  cursor: canAdvance() ? "pointer" : "not-allowed",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={creating}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 24px",
                  borderRadius: 7,
                  background: creating ? "rgba(255,255,255,0.06)" : "var(--foreground)",
                  color: creating ? "var(--fg4)" : "var(--accent-ink)",
                  border: "none",
                  cursor: creating ? "wait" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                {creating ? (createStatus || "Creating...") : "Create project"}
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Step Dots ────────────────────────────────────────────────────────────────

function StepDots({
  current,
  steps,
  onJump,
}: {
  current: number;
  steps: readonly string[];
  onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((label, i) => (
        <button
          key={label}
          onClick={() => onJump(i)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 12,
            border: "none",
            background: i === current ? "rgba(255,255,255,0.1)" : "transparent",
            cursor: i <= current ? "pointer" : "default",
            transition: "background 0.15s",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background:
                i < current
                  ? "var(--foreground)"
                  : i === current
                    ? "var(--foreground)"
                    : "rgba(255,255,255,0.15)",
              transition: "background 0.2s",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: i === current ? 600 : 400,
              color: i <= current ? "var(--fg2)" : "var(--fg4)",
            }}
          >
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Step 1: Template ─────────────────────────────────────────────────────────

function StepTemplate({
  selected,
  isBlank,
  onSelect,
  onBlank,
}: {
  selected: ProjectTemplate | null;
  isBlank: boolean;
  onSelect: (t: ProjectTemplate) => void;
  onBlank: () => void;
}) {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchApi("/api/project-templates");
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates ?? []);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (CATEGORY_LABELS[t.category] ?? "").toLowerCase().includes(q),
    );
  }, [templates, search]);

  // Group by operator (custom first), then category
  const operatorTemplates = useMemo(
    () => filtered.filter((t) => t.operatorId !== null),
    [filtered],
  );
  const platformTemplates = useMemo(
    () => filtered.filter((t) => t.operatorId === null),
    [filtered],
  );

  const groupByCategory = (list: ProjectTemplate[]) => {
    const groups: Record<string, ProjectTemplate[]> = {};
    for (const t of list) {
      (groups[t.category] ??= []).push(t);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "var(--fg4)", fontSize: 13 }}>
        Loading templates...
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        placeholder="Search templates..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: 8,
          border: "0.5px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          color: "var(--foreground)",
          fontSize: 13,
          outline: "none",
          marginBottom: 20,
        }}
      />

      {/* Blank project card */}
      <button
        onClick={onBlank}
        style={{
          width: "100%",
          padding: "14px 18px",
          borderRadius: 9,
          border: isBlank
            ? "1.5px solid var(--foreground)"
            : "1.5px dashed rgba(255,255,255,0.15)",
          background: isBlank ? "rgba(255,255,255,0.06)" : "transparent",
          color: "var(--fg2)",
          fontSize: 13,
          fontWeight: 500,
          textAlign: "left",
          cursor: "pointer",
          transition: "border-color 0.15s, background 0.15s",
          marginBottom: 24,
        }}
        className="hover:brightness-110"
      >
        <span style={{ fontWeight: 600 }}>Blank project</span>
        <span style={{ fontSize: 11, color: "var(--fg4)", marginLeft: 10 }}>
          Start from scratch — no template
        </span>
      </button>

      {/* Operator custom templates */}
      {operatorTemplates.length > 0 && (
        <TemplateGroup
          label="Your templates"
          templates={operatorTemplates}
          selectedId={selected?.id ?? null}
          onSelect={onSelect}
        />
      )}

      {/* Platform templates grouped by category */}
      {groupByCategory(platformTemplates).map(([cat, list]) => (
        <TemplateGroup
          key={cat}
          label={CATEGORY_LABELS[cat] ?? cat}
          templates={list}
          selectedId={selected?.id ?? null}
          onSelect={onSelect}
        />
      ))}

      {filtered.length === 0 && !isBlank && (
        <p style={{ textAlign: "center", color: "var(--fg4)", fontSize: 12, padding: 20 }}>
          No templates match your search.
        </p>
      )}
    </div>
  );
}

function TemplateGroup({
  label,
  templates,
  selectedId,
  onSelect,
}: {
  label: string;
  templates: ProjectTemplate[];
  selectedId: string | null;
  onSelect: (t: ProjectTemplate) => void;
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--fg4)",
          marginBottom: 10,
        }}
      >
        {label}
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {templates.map((t) => {
          const isSelected = t.id === selectedId;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                border: isSelected
                  ? "1.5px solid var(--foreground)"
                  : "0.5px solid rgba(255,255,255,0.08)",
                background: isSelected ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.025)",
                textAlign: "left",
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
              className="hover:brightness-110"
            >
              <span
                style={{
                  display: "inline-block",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: `${CATEGORY_COLORS[t.category] ?? "#888"}22`,
                  color: CATEGORY_COLORS[t.category] ?? "#888",
                  marginBottom: 6,
                }}
              >
                {CATEGORY_LABELS[t.category] ?? t.category}
              </span>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--foreground)",
                  lineHeight: 1.3,
                  marginBottom: 4,
                }}
              >
                {t.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--fg3)",
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {t.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 2: Details ──────────────────────────────────────────────────────────

function StepDetails({
  name,
  description,
  dueDate,
  onChange,
}: {
  name: string;
  description: string;
  dueDate: string;
  onChange: (patch: Partial<WizardState>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <FieldGroup label="Project name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Enter project name"
          autoFocus
          style={inputStyle}
        />
      </FieldGroup>

      <FieldGroup label="Description">
        <textarea
          value={description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Brief description (optional)"
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </FieldGroup>

      <FieldGroup label="Due date">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => onChange({ dueDate: e.target.value })}
          style={{ ...inputStyle, maxWidth: 200 }}
        />
      </FieldGroup>
    </div>
  );
}

function FieldGroup({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg2)" }}>
        {label}
        {required && <span style={{ color: "var(--warn)", marginLeft: 3 }}>*</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "0.5px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--foreground)",
  fontSize: 13,
  outline: "none",
};

// ── Step 3: Team ─────────────────────────────────────────────────────────────

function StepTeam({
  members,
  onChange,
}: {
  members: TeamMember[];
  onChange: (members: TeamMember[]) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch users when search opens
  useEffect(() => {
    if (!searchOpen || users.length > 0) return;
    setLoadingUsers(true);
    (async () => {
      try {
        const res = await fetchApi("/api/users");
        if (res.ok) {
          const data = await res.json();
          // API returns plain array (not wrapped)
          const list = Array.isArray(data) ? data : (data.users ?? []);
          setUsers(
            list.map((u: { id: string; name: string; email: string }) => ({
              id: u.id,
              name: u.name,
              email: u.email,
            })),
          );
        }
      } catch {}
      setLoadingUsers(false);
    })();
  }, [searchOpen, users.length]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  const existingIds = new Set(members.map((m) => m.userId));
  const filteredUsers = users.filter((u) => {
    if (existingIds.has(u.id)) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const updateMember = (idx: number, patch: Partial<TeamMember>) => {
    const next = [...members];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeMember = (idx: number) => {
    onChange(members.filter((_, i) => i !== idx));
  };

  const addMember = (u: UserItem) => {
    onChange([
      ...members,
      { userId: u.id, name: u.name, email: u.email, role: "analyst", restrictionText: "" },
    ]);
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {members.map((m, i) => (
          <div
            key={m.userId}
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              border: "0.5px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.025)",
            }}
          >
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--fg2)",
                  flexShrink: 0,
                }}
              >
                {m.name.charAt(0).toUpperCase()}
              </div>

              {/* Name + email */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-1">
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
                    {m.name}
                  </span>
                  {m.restrictionText && (
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--fg4)" }}>{m.email}</div>
              </div>

              {/* Role dropdown */}
              <select
                value={m.role}
                onChange={(e) => updateMember(i, { role: e.target.value })}
                disabled={m.role === "owner"}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "4px 8px",
                  borderRadius: 5,
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--fg2)",
                  cursor: m.role === "owner" ? "default" : "pointer",
                  appearance: m.role === "owner" ? "none" : undefined,
                }}
              >
                <option value="owner">Owner</option>
                <option value="analyst">Analyst</option>
                <option value="reviewer">Reviewer</option>
                <option value="viewer">Viewer</option>
              </select>

              {/* Remove */}
              {m.role !== "owner" && (
                <button
                  onClick={() => removeMember(i)}
                  style={{
                    padding: 4,
                    border: "none",
                    background: "transparent",
                    color: "var(--fg4)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                  className="hover:brightness-150"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Restriction text (not for owner) */}
            {m.role !== "owner" && (
              <input
                type="text"
                value={m.restrictionText}
                onChange={(e) => updateMember(i, { restrictionText: e.target.value })}
                placeholder="Describe access restrictions (optional)..."
                style={{
                  ...inputStyle,
                  fontSize: 11,
                  padding: "6px 10px",
                  marginTop: 8,
                  background: "rgba(255,255,255,0.02)",
                  border: "0.5px solid rgba(255,255,255,0.06)",
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Add member */}
      <div ref={searchRef} style={{ position: "relative", marginTop: 14 }}>
        {!searchOpen ? (
          <button
            onClick={() => setSearchOpen(true)}
            style={{
              fontSize: 12,
              fontWeight: 500,
              padding: "8px 14px",
              borderRadius: 7,
              background: "transparent",
              border: "0.5px dashed rgba(255,255,255,0.15)",
              color: "var(--fg3)",
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
            }}
            className="hover:brightness-125"
          >
            + Add team member
          </button>
        ) : (
          <div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              autoFocus
              style={{ ...inputStyle, fontSize: 12 }}
            />
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                maxHeight: 200,
                overflowY: "auto",
                background: "var(--bg1, #1a1a1a)",
                border: "0.5px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                marginTop: 4,
                zIndex: 10,
              }}
            >
              {loadingUsers ? (
                <div style={{ padding: 12, fontSize: 12, color: "var(--fg4)" }}>Loading...</div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, color: "var(--fg4)" }}>No matching users</div>
              ) : (
                filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => addMember(u)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "8px 12px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    className="hover:bg-white/5"
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 600,
                        color: "var(--fg3)",
                      }}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--foreground)" }}>{u.name}</div>
                      <div style={{ fontSize: 10, color: "var(--fg4)" }}>{u.email}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 4: Data ─────────────────────────────────────────────────────────────

function StepData({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = (newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    onChange([...files, ...arr]);
  };

  const removeFile = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          padding: "40px 20px",
          borderRadius: 10,
          border: dragOver
            ? "2px dashed var(--foreground)"
            : "2px dashed rgba(255,255,255,0.12)",
          background: dragOver ? "rgba(255,255,255,0.04)" : "transparent",
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <svg
          width={28}
          height={28}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--fg4)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ margin: "0 auto 10px" }}
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p style={{ fontSize: 13, color: "var(--fg2)", marginBottom: 4 }}>
          Drag files here or click to browse
        </p>
        <p style={{ fontSize: 11, color: "var(--fg4)" }}>
          PDF, DOCX, XLSX, CSV, TXT, images, PPTX — up to 50MB each
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 10 }}>
            {files.length} file{files.length !== 1 ? "s" : ""} selected ({formatBytes(totalSize)} total)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-3"
                style={{
                  padding: "8px 12px",
                  borderRadius: 7,
                  background: "rgba(255,255,255,0.025)",
                  border: "0.5px solid rgba(255,255,255,0.06)",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 5px",
                    borderRadius: 3,
                    background: "rgba(255,255,255,0.06)",
                    color: "var(--fg3)",
                    flexShrink: 0,
                  }}
                >
                  {fileIcon(f.name)}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: "var(--foreground)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </span>
                <span style={{ fontSize: 10, color: "var(--fg4)", flexShrink: 0 }}>
                  {formatBytes(f.size)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--fg4)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 2,
                  }}
                  className="hover:brightness-150"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {files.length === 0 && (
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--fg4)", marginTop: 16 }}>
          You can upload files after project creation too
        </p>
      )}
    </div>
  );
}

// ── Step 5: Review ───────────────────────────────────────────────────────────

function StepReview({ state }: { state: WizardState }) {
  const sections = state.template?.analysisFramework?.sections ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Template */}
      <ReviewSection label="Template">
        {state.isBlank ? (
          <span style={{ color: "var(--fg3)" }}>Blank project</span>
        ) : state.template ? (
          <div className="flex items-center gap-2">
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                padding: "2px 6px",
                borderRadius: 3,
                background: `${CATEGORY_COLORS[state.template.category] ?? "#888"}22`,
                color: CATEGORY_COLORS[state.template.category] ?? "#888",
              }}
            >
              {CATEGORY_LABELS[state.template.category] ?? state.template.category}
            </span>
            <span style={{ fontSize: 13, color: "var(--foreground)" }}>
              {state.template.name}
            </span>
          </div>
        ) : null}
      </ReviewSection>

      {/* Project */}
      <ReviewSection label="Project">
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
          {state.name}
        </div>
        {state.description && (
          <div
            style={{
              fontSize: 12,
              color: "var(--fg3)",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {state.description}
          </div>
        )}
        {state.dueDate && (
          <div style={{ fontSize: 11, color: "var(--fg4)", marginTop: 4 }}>
            Due: {state.dueDate}
          </div>
        )}
      </ReviewSection>

      {/* Team */}
      <ReviewSection label="Team">
        <div className="flex flex-wrap gap-2">
          {state.members.map((m) => (
            <span
              key={m.userId}
              className="flex items-center gap-1"
              style={{
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                color: "var(--fg2)",
              }}
            >
              {m.name}
              <span style={{ color: "var(--fg4)" }}>({m.role})</span>
              {m.restrictionText && (
                <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
            </span>
          ))}
        </div>
      </ReviewSection>

      {/* Data */}
      <ReviewSection label="Data">
        {state.files.length > 0 ? (
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>
            {state.files.length} file{state.files.length !== 1 ? "s" : ""} (
            {formatBytes(state.files.reduce((s, f) => s + f.size, 0))})
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--fg4)" }}>
            No files — you can upload later
          </span>
        )}
      </ReviewSection>

      {/* Deliverables */}
      <ReviewSection label="Deliverables">
        {sections.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sections.map((s) => (
              <span key={s.id} style={{ fontSize: 12, color: "var(--fg2)" }}>
                {s.title}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: "var(--fg4)" }}>
            No auto-generated deliverables — create from workboard
          </span>
        )}
      </ReviewSection>
    </div>
  );
}

function ReviewSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 8,
        border: "0.5px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--fg4)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
