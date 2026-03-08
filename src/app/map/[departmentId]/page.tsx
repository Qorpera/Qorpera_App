"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import Link from "next/link";
import { DOCUMENT_SLOT_TYPES, type SlotType, isStructuralSlot } from "@/lib/document-slots";
import { fetchApi } from "@/lib/fetch-api";
import { CONNECTOR_ENTITY_TYPES } from "@/lib/connector-entity-types";
import { EntityRow } from "@/components/entity-row";

/* Inline diff types to avoid importing structural-extraction.ts (has server-only deps) */
type DiffAction = "create" | "update" | "flag-missing";
interface PersonDiff {
  action: DiffAction;
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  reportsTo?: string;
  existingEntityId?: string;
  changes?: Record<string, { from: string; to: string }>;
  selected: boolean;
}
interface PropertyDiff {
  action: "create" | "update";
  targetEntityId: string;
  targetEntityName: string;
  property: string;
  label: string;
  oldValue?: string;
  newValue: string;
  selected: boolean;
}
interface ExtractionDiff {
  type: string;
  people?: PersonDiff[];
  properties?: PropertyDiff[];
  summary: string;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PropertyValue {
  value: string;
  property: { slug: string; name: string; dataType: string };
}

interface Member {
  id: string;
  displayName: string;
  propertyValues: PropertyValue[];
}

interface ExternalLink {
  id: string;
  displayName: string;
  entityType: { name: string; icon: string | null; color: string | null };
  linkedVia: string;
}

interface DeptDetail {
  id: string;
  displayName: string;
  description: string | null;
  entityType: { slug: string };
}

interface ConnectorBinding {
  id: string;
  connectorId: string;
  connector: {
    id: string;
    provider: string;
    name: string;
    status: string;
    lastSyncAt: string | null;
  };
  entityTypeFilter: string[] | null;
  enabled: boolean;
}

interface ConnectedEntityGroup {
  typeSlug: string;
  typeName: string;
  typeColor: string;
  entities: Array<{
    id: string;
    displayName: string;
    properties: Record<string, string>;
    sourceSystem: string | null;
  }>;
}

interface AvailableConnector {
  id: string;
  provider: string;
  name: string;
  status: string;
}

interface SlotDocument {
  id: string;
  fileName: string;
  mimeType: string;
  documentType: string;
  status: string;
  embeddingStatus: string;
  entityId: string | null;
  createdAt: string;
}

interface DocumentsResponse {
  slots: Record<string, SlotDocument | null>;
  contextDocs: SlotDocument[];
}

const ALLOWED_MIMES = new Set([
  "text/plain",
  "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getProp(m: Member, slug: string): string {
  return m.propertyValues.find((pv) => pv.property.slug === slug)?.value ?? "";
}

/* ------------------------------------------------------------------ */
/*  Slot Icons (inline SVG)                                            */
/* ------------------------------------------------------------------ */

function SlotIcon({ icon, className }: { icon: string; className?: string }) {
  const cn = className ?? "w-5 h-5";
  switch (icon) {
    case "network":
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v3m0 12v3m-6-9H3m18 0h-3m-2.25-5.25L17.25 5.25m-10.5 0L8.25 6.75m0 10.5l-1.5 1.5m10.5-1.5l1.5 1.5M12 9a3 3 0 100 6 3 3 0 000-6z" />
        </svg>
      );
    case "wallet":
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h1.5M3 12v6.75A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V12M3 12V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25V12M3 12h18M15 12a3 3 0 100 6 3 3 0 000-6z" />
        </svg>
      );
    case "banknotes":
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      );
    case "clipboard-list":
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      );
    default:
      return (
        <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Inline editable text                                               */
/* ------------------------------------------------------------------ */

function InlineEdit({
  value,
  onSave,
  className,
  inputClassName,
  as: Tag = "span",
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  inputClassName?: string;
  as?: "span" | "h1" | "p";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setDraft(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`bg-transparent border-b border-purple-500/40 outline-none ${inputClassName ?? className ?? ""}`}
      />
    );
  }

  return (
    <Tag
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:border-b hover:border-white/20 transition ${className ?? ""}`}
    >
      {value || <span className="italic text-white/20">Click to edit</span>}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="wf-soft p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status, embeddingStatus }: { status: string; embeddingStatus: string }) {
  if (status === "confirmed") {
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">Confirmed</span>;
  }
  if (status === "extracted") {
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Ready for review</span>;
  }
  if (status === "processing" || embeddingStatus === "processing") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        Processing
      </span>
    );
  }
  if (embeddingStatus === "error") {
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">Error</span>;
  }
  if (embeddingStatus === "complete") {
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400">Embedded</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/40">Pending</span>;
}

/* ------------------------------------------------------------------ */
/*  Provider icon                                                      */
/* ------------------------------------------------------------------ */

function ProviderIcon({ provider }: { provider: string }) {
  const config: Record<string, { bg: string; label: string }> = {
    hubspot: { bg: "#ff7a59", label: "HS" },
    stripe: { bg: "#635bff", label: "S" },
    "google-sheets": { bg: "#34a853", label: "G" },
  };
  const c = config[provider] ?? { bg: "#666", label: "?" };
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold text-white flex-shrink-0"
      style={{ backgroundColor: c.bg }}>
      {c.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DepartmentDetailPage() {
  return (
    <Suspense fallback={null}>
      <DepartmentDetailInner />
    </Suspense>
  );
}

function DepartmentDetailInner() {
  const params = useParams();
  const router = useRouter();
  const deptId = params.departmentId as string;

  const [dept, setDept] = useState<DeptDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(true);

  const searchParams = useSearchParams();

  /* ---- edit mode ---- */
  const [editMode, setEditMode] = useState(false);

  /* ---- connected data ---- */
  const [bindings, setBindings] = useState<ConnectorBinding[]>([]);
  const [connectedEntities, setConnectedEntities] = useState<ConnectedEntityGroup[]>([]);
  const [availableConnectors, setAvailableConnectors] = useState<AvailableConnector[]>([]);
  const [showBindingModal, setShowBindingModal] = useState(false);
  const [bindingModalStep, setBindingModalStep] = useState<1 | 2>(1);
  const [selectedConnector, setSelectedConnector] = useState<string>("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string[]>([]);
  const [providers, setProviders] = useState<Array<{ id: string; name: string; configured: boolean }>>([]);
  const [editingBindingId, setEditingBindingId] = useState<string | null>(null);
  const [editingFilter, setEditingFilter] = useState<string[]>([]);
  const [removingBindingId, setRemovingBindingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState<string | null>(null);

  /* ---- add person ---- */
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addError, setAddError] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  /* ---- edit person ---- */
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editError, setEditError] = useState("");

  /* ---- remove person ---- */
  const [removeId, setRemoveId] = useState<string | null>(null);

  /* ---- documents ---- */
  const [docsData, setDocsData] = useState<DocumentsResponse | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [uploadingContext, setUploadingContext] = useState(false);
  const [docError, setDocError] = useState("");
  const [extractingDoc, setExtractingDoc] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  /* ---- diff preview modal ---- */
  const [diffModal, setDiffModal] = useState<{
    docId: string;
    slotType: string;
    diff: ExtractionDiff;
  } | null>(null);
  const [diffItems, setDiffItems] = useState<ExtractionDiff | null>(null);
  const [confirming, setConfirming] = useState(false);

  /* ---- delete doc confirmation ---- */
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);

  const slotFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const contextFileInputRef = useRef<HTMLInputElement | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Data fetching                                                    */
  /* ---------------------------------------------------------------- */

  const load = useCallback(async () => {
    try {
      const [deptRes, membersRes, linksRes] = await Promise.all([
        fetchApi(`/api/departments/${deptId}`),
        fetchApi(`/api/departments/${deptId}/members`),
        fetchApi(`/api/departments/${deptId}/external-links`),
      ]);
      if (!deptRes.ok) { setNotFound(true); return; }
      setDept(await deptRes.json());
      if (membersRes.ok) setMembers(await membersRes.json());
      if (linksRes.ok) setExternalLinks(await linksRes.json());
    } finally {
      setLoading(false);
    }
  }, [deptId]);

  const loadDocs = useCallback(async () => {
    const res = await fetchApi(`/api/departments/${deptId}/documents`);
    if (res.ok) setDocsData(await res.json());
  }, [deptId]);

  const fetchExternalLinks = useCallback(async () => {
    const res = await fetchApi(`/api/departments/${deptId}/external-links`);
    if (res.ok) setExternalLinks(await res.json());
  }, [deptId]);

  const fetchBindings = useCallback(async () => {
    const res = await fetchApi(`/api/departments/${deptId}/connectors`);
    if (res.ok) {
      const data = await res.json();
      setBindings(data.bindings ?? []);
    }
  }, [deptId]);

  const fetchConnectedEntities = useCallback(async () => {
    const res = await fetchApi(`/api/departments/${deptId}/connected-entities?limit=50`);
    if (res.ok) {
      const data = await res.json();
      setConnectedEntities(data.groups ?? []);
    }
  }, [deptId]);

  const fetchAvailableConnectors = useCallback(async () => {
    const res = await fetchApi("/api/connectors");
    if (res.ok) {
      const data = await res.json();
      const allConnectors: AvailableConnector[] = (data.connectors ?? []).map((c: any) => ({
        id: c.id, provider: c.provider, name: c.name || c.providerName, status: c.status,
      }));
      // Filter out connectors already bound to this department
      const boundIds = new Set(bindings.map((b) => b.connectorId));
      setAvailableConnectors(allConnectors.filter((c) => !boundIds.has(c.id)));
    }
  }, [bindings]);

  const fetchProviders = useCallback(async () => {
    const res = await fetchApi("/api/connectors/providers");
    if (res.ok) {
      const data = await res.json();
      setProviders(data.providers ?? []);
    }
  }, []);

  useEffect(() => {
    load(); loadDocs(); fetchBindings(); fetchConnectedEntities(); fetchProviders();
    fetchApi("/api/auth/me").then((r) => r.json()).then((data) => {
      setIsAdmin(data.role === "admin");
    }).catch(() => {});
  }, [load, loadDocs, fetchBindings, fetchConnectedEntities, fetchProviders]);

  // Handle OAuth return
  useEffect(() => {
    const hubspot = searchParams?.get("hubspot");
    const stripe = searchParams?.get("stripe");
    const google = searchParams?.get("google");
    if (hubspot === "connected" || stripe === "connected" || google === "connected") {
      fetchBindings();
      fetchAvailableConnectors();
      setToast("Connector connected successfully!");
      const url = new URL(window.location.href);
      url.searchParams.delete("hubspot");
      url.searchParams.delete("stripe");
      url.searchParams.delete("google");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, fetchBindings, fetchAvailableConnectors]);

  // Poll while any doc is processing
  useEffect(() => {
    if (!docsData) return;
    const hasProcessing =
      Object.values(docsData.slots).some(
        (d) => d && (d.status === "processing" || d.embeddingStatus === "processing"),
      ) ||
      docsData.contextDocs.some(
        (d) => d.status === "processing" || d.embeddingStatus === "processing",
      );
    if (!hasProcessing) return;
    const iv = setInterval(loadDocs, 5000);
    return () => clearInterval(iv);
  }, [docsData, loadDocs]);

  // Escape exits edit mode
  useEffect(() => {
    if (!editMode) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setEditMode(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editMode]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---------------------------------------------------------------- */
  /*  Connected data actions                                           */
  /* ---------------------------------------------------------------- */

  async function handleCreateBinding() {
    if (!selectedConnector) return;
    const filter = selectedTypeFilter.length > 0 ? selectedTypeFilter : null;
    const res = await fetchApi(`/api/departments/${deptId}/connectors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectorId: selectedConnector, entityTypeFilter: filter }),
    });
    if (res.ok) {
      setShowBindingModal(false);
      setSelectedConnector("");
      setSelectedTypeFilter([]);
      setBindingModalStep(1);
      fetchBindings();
      fetchConnectedEntities();
      fetchAvailableConnectors();
      setToast("Data source connected");
    }
  }

  async function triggerSync(connectorId: string) {
    setSyncing(connectorId);
    try {
      await fetchApi(`/api/connectors/${connectorId}/sync`, { method: "POST" });
      setTimeout(() => {
        fetchConnectedEntities();
        setSyncing(null);
      }, 3000);
    } catch {
      setSyncing(null);
    }
  }

  async function handleToggleBinding(binding: ConnectorBinding) {
    await fetchApi(`/api/departments/${deptId}/connectors/${binding.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !binding.enabled }),
    });
    fetchBindings();
  }

  async function handleSaveBindingFilter(bindingId: string) {
    await fetchApi(`/api/departments/${deptId}/connectors/${bindingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityTypeFilter: editingFilter.length > 0 ? editingFilter : null }),
    });
    setEditingBindingId(null);
    fetchBindings();
    fetchConnectedEntities();
  }

  async function handleRemoveBinding() {
    if (!removingBindingId) return;
    await fetchApi(`/api/departments/${deptId}/connectors/${removingBindingId}`, {
      method: "DELETE",
    });
    setRemovingBindingId(null);
    fetchBindings();
    fetchConnectedEntities();
    fetchAvailableConnectors();
  }

  function openBindingModal() {
    setShowBindingModal(true);
    setBindingModalStep(1);
    setSelectedConnector("");
    setSelectedTypeFilter([]);
    fetchAvailableConnectors();
    fetchProviders();
  }

  async function handleConnectNewProvider(providerId: string) {
    const authEndpoint = providerId === "hubspot"
      ? `/api/connectors/hubspot/auth-url?from=department:${deptId}`
      : providerId === "stripe"
        ? `/api/connectors/stripe/auth-url?from=department:${deptId}`
        : `/api/connectors/google-sheets/auth-url?from=department:${deptId}`;
    const res = await fetchApi(authEndpoint);
    if (res.ok) {
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Inline edit department fields                                    */
  /* ---------------------------------------------------------------- */

  async function saveDeptField(field: "name" | "description", value: string) {
    const res = await fetchApi(`/api/departments/${deptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const updated = await res.json();
      setDept((prev) => prev ? { ...prev, displayName: updated.displayName, description: updated.description } : prev);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Add person                                                       */
  /* ---------------------------------------------------------------- */

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim() || !addRole.trim() || !addEmail.trim()) {
      setAddError("All fields are required");
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      const res = await fetchApi(`/api/departments/${deptId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName.trim(), role: addRole.trim(), email: addEmail.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setAddError(err?.error ?? "Failed to add person");
        return;
      }
      const created: Member = await res.json();
      setMembers((prev) => [...prev, created]);
      setShowAdd(false);
      setAddName("");
      setAddRole("");
      setAddEmail("");
    } finally {
      setAddSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Edit person                                                      */
  /* ---------------------------------------------------------------- */

  function startEdit(m: Member) {
    setEditId(m.id);
    setEditName(m.displayName);
    setEditRole(getProp(m, "role"));
    setEditEmail(getProp(m, "email"));
    setEditError("");
  }

  async function saveEdit() {
    if (!editId) return;
    setEditError("");
    const res = await fetchApi(`/api/departments/${deptId}/members/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), role: editRole.trim(), email: editEmail.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setEditError(err?.error ?? "Failed to save");
      return;
    }
    const updated: Member = await res.json();
    setMembers((prev) => prev.map((m) => (m.id === editId ? updated : m)));
    setEditId(null);
  }

  /* ---------------------------------------------------------------- */
  /*  Remove person                                                    */
  /* ---------------------------------------------------------------- */

  async function confirmRemove() {
    if (!removeId) return;
    const res = await fetchApi(`/api/departments/${deptId}/members/${removeId}`, { method: "DELETE" });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== removeId));
    }
    setRemoveId(null);
  }

  /* ---------------------------------------------------------------- */
  /*  Document upload                                                   */
  /* ---------------------------------------------------------------- */

  async function uploadFile(file: File, documentType: string) {
    setDocError("");
    if (file.size > MAX_FILE_SIZE) {
      setDocError("File too large (max 10MB)");
      return;
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      setDocError("Unsupported file type. Accepted: TXT, CSV, PDF, DOCX");
      return;
    }

    const isSlot = isStructuralSlot(documentType);
    if (isSlot) setUploadingSlot(documentType);
    else setUploadingContext(true);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("documentType", documentType);

      const res = await fetchApi(`/api/departments/${deptId}/documents/upload`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setDocError(err?.error ?? "Upload failed");
        return;
      }

      const created = await res.json();
      await loadDocs();

      // For structural docs, auto-trigger extraction
      if (isSlot) {
        setExtractingDoc(created.id);
        try {
          const extRes = await fetch(
            `/api/departments/${deptId}/documents/${created.id}/extract`,
            { method: "POST" },
          );
          if (extRes.ok) {
            const { diff } = await extRes.json();
            await loadDocs();
            setDiffModal({ docId: created.id, slotType: documentType, diff });
            setDiffItems(diff);
          } else {
            const err = await extRes.json().catch(() => null);
            setDocError(err?.error ?? "Extraction failed");
            await loadDocs();
          }
        } finally {
          setExtractingDoc(null);
        }
      }
    } finally {
      setUploadingSlot(null);
      setUploadingContext(false);
    }
  }

  function handleSlotFileChange(e: React.ChangeEvent<HTMLInputElement>, slotType: string) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, slotType);
    e.target.value = "";
  }

  function handleContextFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      uploadFile(files[i], "context");
    }
    e.target.value = "";
  }

  /* ---------------------------------------------------------------- */
  /*  Re-extract a slot doc                                             */
  /* ---------------------------------------------------------------- */

  async function handleReExtract(docId: string, slotType: string) {
    setExtractingDoc(docId);
    setDocError("");
    try {
      const res = await fetchApi(`/api/departments/${deptId}/documents/${docId}/extract`, { method: "POST" });
      if (res.ok) {
        const { diff } = await res.json();
        await loadDocs();
        setDiffModal({ docId, slotType, diff });
        setDiffItems(diff);
      } else {
        const err = await res.json().catch(() => null);
        setDocError(err?.error ?? "Extraction failed");
      }
    } finally {
      setExtractingDoc(null);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Reprocess a context doc                                           */
  /* ---------------------------------------------------------------- */

  async function handleReprocess(docId: string) {
    setDocError("");
    const res = await fetchApi(`/api/departments/${deptId}/documents/${docId}/reprocess`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setDocError(err?.error ?? "Reprocess failed");
    }
    await loadDocs();
  }

  /* ---------------------------------------------------------------- */
  /*  Delete a document                                                 */
  /* ---------------------------------------------------------------- */

  async function handleDeleteDoc(docId: string) {
    const res = await fetchApi(`/api/departments/${deptId}/documents/${docId}`, { method: "DELETE" });
    if (res.ok) {
      await loadDocs();
    }
    setDeleteDocId(null);
  }

  /* ---------------------------------------------------------------- */
  /*  Confirm extraction diff                                           */
  /* ---------------------------------------------------------------- */

  async function handleConfirmDiff() {
    if (!diffModal || !diffItems) return;
    setConfirming(true);
    try {
      const res = await fetch(
        `/api/departments/${deptId}/documents/${diffModal.docId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diff: diffItems }),
        },
      );
      if (res.ok) {
        const { created, updated } = await res.json();
        const parts: string[] = [];
        if (created > 0) parts.push(`Created ${created}`);
        if (updated > 0) parts.push(`Updated ${updated}`);
        setToast(parts.join(", ") || "Changes applied");
        setDiffModal(null);
        setDiffItems(null);
        await Promise.all([loadDocs(), load()]);
        // Refresh members
        const membersRes = await fetchApi(`/api/departments/${deptId}/members`);
        if (membersRes.ok) setMembers(await membersRes.json());
      } else {
        const err = await res.json().catch(() => null);
        setDocError(err?.error ?? "Confirm failed");
      }
    } finally {
      setConfirming(false);
    }
  }

  function toggleDiffPerson(index: number) {
    if (!diffItems?.people) return;
    setDiffItems({
      ...diffItems,
      people: diffItems.people.map((p, i) => (i === index ? { ...p, selected: !p.selected } : p)),
    });
  }

  function toggleDiffProperty(index: number) {
    if (!diffItems?.properties) return;
    setDiffItems({
      ...diffItems,
      properties: diffItems.properties.map((p, i) =>
        i === index ? { ...p, selected: !p.selected } : p,
      ),
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <AppShell>
        <div className="p-8 text-white/30 text-sm">Loading...</div>
      </AppShell>
    );
  }

  if (notFound || !dept) {
    return (
      <AppShell>
        <div className="p-8">
          <p className="text-white/50 mb-4">Department not found</p>
          <Link href="/map" className="text-purple-400 hover:text-purple-300 text-sm">
            &larr; Back to Map
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-8 space-y-8">
        {/* ---- toast ---- */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-green-500/20 border border-green-500/30 text-green-300 text-sm px-4 py-2 rounded-lg shadow-lg">
            {toast}
          </div>
        )}

        {/* ---- header ---- */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.push("/map")}
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/60 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back to Map
            </button>
            {isAdmin && (
              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  editMode
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                {editMode ? "Done Editing" : "Edit"}
              </button>
            )}
          </div>

          <InlineEdit
            as="h1"
            value={dept.displayName}
            onSave={(v) => saveDeptField("name", v)}
            className="text-2xl font-semibold text-white/90 block"
            inputClassName="text-2xl font-semibold text-white/90 w-full"
          />
          <InlineEdit
            as="p"
            value={dept.description ?? ""}
            onSave={(v) => saveDeptField("description", v)}
            className="text-white/50 mt-1 block"
            inputClassName="text-white/50 mt-1 w-full"
          />
        </div>

        {/* ---- Section 1: People ---- */}
        <Section
          title="People"
          action={
            isAdmin && !showAdd && (
              <Button variant="default" size="sm" onClick={() => { setShowAdd(true); setAddError(""); }}>
                Add Person
              </Button>
            )
          }
        >
          {/* add form */}
          {showAdd && (
            <form onSubmit={handleAdd} className="wf-soft p-3 mb-4 space-y-3">
              <div className="flex gap-2">
                <input
                  placeholder="Name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-purple-500/50"
                  autoFocus
                />
                <input
                  placeholder="Role"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-purple-500/50"
                />
                <input
                  placeholder="Email"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/90 placeholder:text-white/30 outline-none focus:border-purple-500/50"
                />
              </div>
              {addError && <p className="text-xs text-red-400">{addError}</p>}
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={addSaving}>
                  {addSaving ? "Adding..." : "Add"}
                </Button>
                <Button type="button" variant="default" size="sm" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* member list */}
          {members.length === 0 && !showAdd ? (
            <p className="text-sm text-white/30 py-4 text-center">
              No team members yet. Add people to this department.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {members.map((m) => {
                const role = getProp(m, "role");
                const email = getProp(m, "email");

                /* ---- editing row ---- */
                if (editId === m.id) {
                  return (
                    <div key={m.id} className="py-2.5 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-purple-500/50"
                          autoFocus
                        />
                        <input
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-purple-500/50"
                        />
                        <input
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          type="email"
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/90 outline-none focus:border-purple-500/50"
                        />
                      </div>
                      {editError && <p className="text-xs text-red-400">{editError}</p>}
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="text-xs text-green-400 hover:text-green-300">Save</button>
                        <button onClick={() => setEditId(null)} className="text-xs text-white/40 hover:text-white/60">Cancel</button>
                      </div>
                    </div>
                  );
                }

                /* ---- remove confirmation ---- */
                if (removeId === m.id) {
                  return (
                    <div key={m.id} className="py-2.5 flex items-center justify-between">
                      <span className="text-sm text-white/60">Remove {m.displayName}?</span>
                      <div className="flex gap-2">
                        <button onClick={confirmRemove} className="text-xs text-red-400 hover:text-red-300">Confirm</button>
                        <button onClick={() => setRemoveId(null)} className="text-xs text-white/40 hover:text-white/60">Cancel</button>
                      </div>
                    </div>
                  );
                }

                /* ---- display row ---- */
                return (
                  <div key={m.id} className="group py-2.5 flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-white/90">{m.displayName}</span>
                      {role && <span className="ml-3 text-sm text-white/40">{role}</span>}
                      {email && <span className="ml-3 text-xs text-white/30">{email}</span>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => startEdit(m)}
                        title="Edit"
                        className="p-1 text-white/30 hover:text-white/60"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setRemoveId(m.id)}
                        title="Remove"
                        className="p-1 text-white/30 hover:text-red-400"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ---- Section 2a: Structural Document Slots ---- */}
        <Section title="Structural Documents">
          {docError && (
            <p className="text-xs text-red-400 mb-3">{docError}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(DOCUMENT_SLOT_TYPES) as [SlotType, typeof DOCUMENT_SLOT_TYPES[SlotType]][]).map(
              ([slotType, slotDef]) => {
                const doc = docsData?.slots[slotType] ?? null;
                const isUploading = uploadingSlot === slotType;
                const isExtracting = doc && extractingDoc === doc.id;

                return (
                  <div
                    key={slotType}
                    className={`rounded-lg border p-4 transition ${
                      doc
                        ? "border-white/10 border-l-2 border-l-purple-500/50"
                        : "border-dashed border-white/10 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <SlotIcon icon={slotDef.icon} className="w-4 h-4 text-white/40" />
                        <span className="text-sm font-medium text-white/70">{slotDef.label}</span>
                      </div>
                      {doc && doc.status === "confirmed" && (
                        <span className="w-2 h-2 rounded-full bg-green-500" title="Confirmed" />
                      )}
                      {doc && doc.status === "extracted" && (
                        <span className="w-2 h-2 rounded-full bg-amber-500" title="Needs review" />
                      )}
                    </div>

                    {!doc && !isUploading && (
                      <button
                        onClick={() => slotFileInputRefs.current[slotType]?.click()}
                        className="w-full py-4 border border-dashed border-white/10 rounded-md text-xs text-white/30 hover:text-white/50 hover:border-white/20 transition"
                      >
                        Drop file here or click to upload
                        <input
                          ref={(el) => { slotFileInputRefs.current[slotType] = el; }}
                          type="file"
                          accept=".txt,.csv,.pdf,.docx"
                          className="hidden"
                          onChange={(e) => handleSlotFileChange(e, slotType)}
                        />
                      </button>
                    )}

                    {isUploading && (
                      <div className="py-4 text-center">
                        <svg className="mx-auto w-5 h-5 text-purple-400 animate-spin mb-1" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-xs text-white/40">Uploading...</p>
                      </div>
                    )}

                    {doc && !isUploading && (
                      <div>
                        <p className="text-xs text-white/50 truncate">{doc.fileName}</p>
                        <div className="mt-2">
                          <StatusBadge status={doc.status} embeddingStatus={doc.embeddingStatus} />
                        </div>
                        {isExtracting && (
                          <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Extracting...
                          </p>
                        )}
                        <div className="flex gap-2 mt-3">
                          {doc.status === "extracted" && (
                            <button
                              onClick={() => handleReExtract(doc.id, slotType).then(() => {/* modal opens via handler */})}
                              className="text-[11px] text-purple-400 hover:text-purple-300"
                            >
                              Review Changes
                            </button>
                          )}
                          <button
                            onClick={() => slotFileInputRefs.current[slotType]?.click()}
                            className="text-[11px] text-white/40 hover:text-white/60"
                          >
                            Replace
                            <input
                              ref={(el) => { slotFileInputRefs.current[slotType] = el; }}
                              type="file"
                              accept=".txt,.csv,.pdf,.docx"
                              className="hidden"
                              onChange={(e) => handleSlotFileChange(e, slotType)}
                            />
                          </button>
                          {doc.status === "confirmed" && (
                            <button
                              onClick={() => handleReExtract(doc.id, slotType)}
                              disabled={!!isExtracting}
                              className="text-[11px] text-white/40 hover:text-white/60"
                            >
                              Re-extract
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>
        </Section>

        {/* ---- Section 2b: Context Documents ---- */}
        <Section title="Context Documents">
          {/* drop zone */}
          <button
            onClick={() => contextFileInputRef.current?.click()}
            className="w-full py-5 mb-4 border border-dashed border-white/10 rounded-lg text-center hover:border-white/20 transition"
          >
            <svg className="mx-auto w-6 h-6 text-white/20 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xs text-white/40">
              {uploadingContext ? "Uploading..." : "Drop files here or click to upload"}
            </p>
            <p className="text-[10px] text-white/25 mt-0.5">
              Process guides, playbooks, policies...
            </p>
            <input
              ref={contextFileInputRef}
              type="file"
              accept=".txt,.csv,.pdf,.docx"
              multiple
              className="hidden"
              onChange={handleContextFileChange}
            />
          </button>

          {/* doc list */}
          {docsData && docsData.contextDocs.length > 0 ? (
            <div className="space-y-1.5">
              {docsData.contextDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition"
                >
                  <svg className="w-4 h-4 text-white/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-sm text-white/70 flex-1 truncate">{doc.fileName}</span>
                  <StatusBadge status={doc.status} embeddingStatus={doc.embeddingStatus} />
                  <div className="flex gap-1">
                    {doc.embeddingStatus === "error" && (
                      <button
                        onClick={() => handleReprocess(doc.id)}
                        title="Retry"
                        className="p-1 text-white/30 hover:text-amber-400"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                        </svg>
                      </button>
                    )}
                    {deleteDocId === doc.id ? (
                      <div className="flex gap-1 items-center">
                        <button
                          onClick={() => handleDeleteDoc(doc.id)}
                          className="text-[10px] text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setDeleteDocId(null)}
                          className="text-[10px] text-white/40 hover:text-white/60"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteDocId(doc.id)}
                        title="Delete"
                        className="p-1 text-white/30 hover:text-red-400"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !uploadingContext && (
              <p className="text-xs text-white/25 text-center py-2">No context documents uploaded yet</p>
            )
          )}
        </Section>

        {/* ---- Section 3: Connected Data ---- */}
        <Section
          title="Connected Data"
          action={bindings.length > 0 ? (
            <button onClick={openBindingModal} className="text-[11px] text-purple-400 hover:text-purple-300 transition">
              + Connect Source
            </button>
          ) : undefined}
        >
          {bindings.length === 0 ? (
            <div className="py-8 text-center">
              <svg className="mx-auto w-8 h-8 text-white/15 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <p className="text-sm text-white/40">Connect a data source to see operational data here</p>
              <button
                onClick={openBindingModal}
                className="mt-3 text-xs text-purple-400 hover:text-purple-300 transition"
              >
                Connect a Data Source
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active bindings */}
              <div className="space-y-2">
                {bindings.map((b) => (
                  <div key={b.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center gap-3">
                      <ProviderIcon provider={b.connector.provider} />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-white/90">{b.connector.name}</span>
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                          b.connector.status === "active" ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {b.connector.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-white/30">
                        {b.entityTypeFilter ? b.entityTypeFilter.join(", ") : "All types"}
                      </span>
                      <button
                        onClick={() => handleToggleBinding(b)}
                        className={`w-8 h-4 rounded-full transition relative ${b.enabled ? "bg-purple-500" : "bg-white/10"}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${b.enabled ? "left-4" : "left-0.5"}`} />
                      </button>
                      <button
                        onClick={() => triggerSync(b.connectorId)}
                        disabled={syncing === b.connectorId}
                        className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center transition disabled:opacity-50"
                        title="Sync now"
                      >
                        <svg className={`w-3.5 h-3.5 text-white/40 ${syncing === b.connectorId ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.016 4.356v4.992" />
                        </svg>
                      </button>
                      <button
                        onClick={() => {
                          setEditingBindingId(b.id);
                          setEditingFilter(b.entityTypeFilter ?? []);
                        }}
                        className="text-white/30 hover:text-white/60 transition"
                        title="Edit filter"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setRemovingBindingId(b.id)}
                        className="text-white/30 hover:text-red-400 transition"
                        title="Remove binding"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    {/* Inline edit filter panel */}
                    {editingBindingId === b.id && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06]">
                        <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Entity type filter</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {(CONNECTOR_ENTITY_TYPES[b.connector.provider] ?? []).map((et) => (
                            <label key={et.slug} className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingFilter.length === 0 || editingFilter.includes(et.slug)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditingFilter((f) => [...f, et.slug]);
                                  } else {
                                    setEditingFilter((f) => f.filter((s) => s !== et.slug));
                                  }
                                }}
                                className="accent-purple-500"
                              />
                              {et.label}
                            </label>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveBindingFilter(b.id)} className="text-[11px] text-purple-400 hover:text-purple-300">Save</button>
                          <button onClick={() => setEditingBindingId(null)} className="text-[11px] text-white/40 hover:text-white/60">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Connected entities grouped by type */}
              {connectedEntities.length > 0 && (
                <div className="space-y-4 pt-2">
                  {connectedEntities.map((group) => {
                    const isExpanded = expandedGroups.has(group.typeSlug);
                    const visibleEntities = isExpanded ? group.entities : group.entities.slice(0, 10);
                    return (
                      <div key={group.typeSlug}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.typeColor }} />
                          <span className="text-xs font-medium text-white/60">{group.typeName}</span>
                          <span className="text-xs text-white/25">({group.entities.length})</span>
                        </div>
                        <div className="space-y-0.5">
                          {visibleEntities.map((e) => (
                            <EntityRow
                              key={e.id}
                              entity={{ ...e, entityType: { name: group.typeName, color: group.typeColor, slug: group.typeSlug } }}
                              editMode={editMode}
                              departmentId={deptId}
                              onRemoved={fetchConnectedEntities}
                              onUpdated={fetchConnectedEntities}
                            />
                          ))}
                        </div>
                        {group.entities.length > 10 && (
                          <button
                            onClick={() => setExpandedGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.typeSlug)) next.delete(group.typeSlug);
                              else next.add(group.typeSlug);
                              return next;
                            })}
                            className="text-[11px] text-purple-400 hover:text-purple-300 mt-1 ml-3"
                          >
                            {isExpanded ? "Show less" : `Show all ${group.entities.length}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ---- Section 4: External Links ---- */}
        <Section title="External Links">
          {externalLinks.length === 0 ? (
            <div className="py-8 text-center">
              <svg className="mx-auto w-8 h-8 text-white/15 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.856-2.07a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.343 8.07" />
              </svg>
              <p className="text-sm text-white/40">No external connections yet</p>
              <p className="text-xs text-white/25 mt-1">
                As your connected tools sync data, related customers and partners will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {externalLinks.map((link) => (
                <EntityRow
                  key={link.id}
                  entity={{
                    id: link.id,
                    displayName: link.displayName,
                    properties: {},
                    entityType: { name: link.entityType.name, color: link.entityType.color ?? "#a855f7", slug: "" },
                  }}
                  editMode={editMode}
                  departmentId={deptId}
                  onRemoved={fetchExternalLinks}
                  onUpdated={fetchExternalLinks}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* ---- Extraction Diff Preview Modal ---- */}
      <Modal
        open={!!diffModal}
        onClose={() => { setDiffModal(null); setDiffItems(null); }}
        title={`Review: ${diffModal ? DOCUMENT_SLOT_TYPES[diffModal.slotType as SlotType]?.label ?? diffModal.slotType : ""} Changes`}
        wide
      >
        {diffItems && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">{diffItems.summary}</p>

            {/* People diffs */}
            {diffItems.people && diffItems.people.length > 0 && (
              <div className="space-y-3">
                {/* Group by action */}
                {(() => {
                  const creates = diffItems.people.filter((p) => p.action === "create");
                  const updates = diffItems.people.filter((p) => p.action === "update");
                  const missing = diffItems.people.filter((p) => p.action === "flag-missing");
                  return (
                    <>
                      {creates.length > 0 && (
                        <div>
                          <h4 className="text-[10px] uppercase tracking-wider text-green-400/70 mb-2">
                            New Members
                          </h4>
                          {creates.map((p) => {
                            const idx = diffItems.people!.indexOf(p);
                            return (
                              <label key={idx} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-white/[0.02] rounded px-1">
                                <input
                                  type="checkbox"
                                  checked={p.selected}
                                  onChange={() => toggleDiffPerson(idx)}
                                  className="mt-0.5 accent-purple-500"
                                />
                                <div className="text-sm">
                                  <span className="text-white/90 font-medium">{p.name}</span>
                                  {p.role && <span className="text-white/40 ml-2">— {p.role}</span>}
                                  {p.email && (
                                    <p className="text-xs text-white/30">email: {p.email}</p>
                                  )}
                                  {p.reportsTo && (
                                    <p className="text-xs text-white/30">reports to: {p.reportsTo}</p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {updates.length > 0 && (
                        <div>
                          <h4 className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-2">
                            Updates
                          </h4>
                          {updates.map((p) => {
                            const idx = diffItems.people!.indexOf(p);
                            return (
                              <label key={idx} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-white/[0.02] rounded px-1">
                                <input
                                  type="checkbox"
                                  checked={p.selected}
                                  onChange={() => toggleDiffPerson(idx)}
                                  className="mt-0.5 accent-purple-500"
                                />
                                <div className="text-sm">
                                  <span className="text-white/90 font-medium">{p.name}</span>
                                  {p.changes && Object.entries(p.changes).map(([key, change]) => (
                                    <p key={key} className="text-xs text-white/40">
                                      {key}: <span className="text-white/30">&ldquo;{change.from}&rdquo;</span>
                                      {" → "}
                                      <span className="text-white/70">&ldquo;{change.to}&rdquo;</span>
                                    </p>
                                  ))}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {missing.length > 0 && (
                        <div>
                          <h4 className="text-[10px] uppercase tracking-wider text-white/30 mb-2">
                            Not in Document (will not be removed)
                          </h4>
                          {missing.map((p) => {
                            const idx = diffItems.people!.indexOf(p);
                            return (
                              <label key={idx} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-white/[0.02] rounded px-1">
                                <input
                                  type="checkbox"
                                  checked={p.selected}
                                  onChange={() => toggleDiffPerson(idx)}
                                  className="mt-0.5 accent-purple-500"
                                />
                                <div className="text-sm">
                                  <span className="text-white/50">{p.name}</span>
                                  <p className="text-xs text-white/25">
                                    Exists in department but not in this document
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Property diffs */}
            {diffItems.properties && diffItems.properties.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-wider text-white/40 mb-2">
                  Properties
                </h4>
                {diffItems.properties.map((p, i) => (
                  <label key={i} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-white/[0.02] rounded px-1">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={() => toggleDiffProperty(i)}
                      className="mt-0.5 accent-purple-500"
                    />
                    <div className="text-sm">
                      <span className="text-white/70">{p.label}:</span>
                      <span className="text-white/90 ml-1">{p.newValue}</span>
                      {p.targetEntityName !== "Department" && (
                        <span className="text-xs text-white/30 ml-2">({p.targetEntityName})</span>
                      )}
                      {p.oldValue && (
                        <p className="text-xs text-white/30">
                          was: {p.oldValue}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Empty extraction */}
            {(!diffItems.people || diffItems.people.length === 0) &&
              (!diffItems.properties || diffItems.properties.length === 0) && (
                <p className="text-sm text-white/40 py-4 text-center">
                  No data found in document
                </p>
              )}

            <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.06]">
              <Button
                variant="default"
                size="sm"
                onClick={() => { setDiffModal(null); setDiffItems(null); }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmDiff}
                disabled={confirming}
              >
                {confirming ? "Applying..." : "Apply Selected Changes"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Connect Data Source Modal ---- */}
      <Modal
        open={showBindingModal}
        onClose={() => { setShowBindingModal(false); setBindingModalStep(1); setSelectedConnector(""); setSelectedTypeFilter([]); }}
        title={bindingModalStep === 1 ? "Connect a Data Source" : "Configure Entity Types"}
      >
        {bindingModalStep === 1 ? (
          <div className="space-y-4">
            {availableConnectors.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Existing connectors</p>
                <div className="space-y-1">
                  {availableConnectors.map((c) => (
                    <label key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] cursor-pointer transition">
                      <input
                        type="radio"
                        name="connector"
                        value={c.id}
                        checked={selectedConnector === c.id}
                        onChange={() => setSelectedConnector(c.id)}
                        className="accent-purple-500"
                      />
                      <ProviderIcon provider={c.provider} />
                      <span className="text-sm text-white/80">{c.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        c.status === "active" ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"
                      }`}>
                        {c.status}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Connect new</p>
              <div className="flex gap-2">
                {providers.filter((p) => p.configured).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleConnectNewProvider(p.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.08] hover:border-white/20 transition text-sm text-white/70 hover:text-white/90"
                  >
                    <ProviderIcon provider={p.id} />
                    {p.name}
                  </button>
                ))}
                {providers.filter((p) => p.configured).length === 0 && (
                  <p className="text-xs text-white/30">No providers configured. Set environment variables for HubSpot, Stripe, or Google Sheets.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="sm"
                disabled={!selectedConnector}
                onClick={() => {
                  const conn = availableConnectors.find((c) => c.id === selectedConnector);
                  if (conn) {
                    const types = CONNECTOR_ENTITY_TYPES[conn.provider];
                    if (types && types.length > 0) {
                      setSelectedTypeFilter(types.map((t) => t.slug));
                      setBindingModalStep(2);
                    } else {
                      handleCreateBinding();
                    }
                  }
                }}
              >
                Next
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {(() => {
              const conn = availableConnectors.find((c) => c.id === selectedConnector);
              const types = conn ? (CONNECTOR_ENTITY_TYPES[conn.provider] ?? []) : [];
              const allSelected = types.every((t) => selectedTypeFilter.includes(t.slug));
              return (
                <>
                  <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => {
                        if (allSelected) setSelectedTypeFilter([]);
                        else setSelectedTypeFilter(types.map((t) => t.slug));
                      }}
                      className="accent-purple-500"
                    />
                    Select All
                  </label>
                  <div className="space-y-1">
                    {types.map((et) => (
                      <label key={et.slug} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] cursor-pointer text-sm text-white/70">
                        <input
                          type="checkbox"
                          checked={selectedTypeFilter.includes(et.slug)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedTypeFilter((f) => [...f, et.slug]);
                            else setSelectedTypeFilter((f) => f.filter((s) => s !== et.slug));
                          }}
                          className="accent-purple-500"
                        />
                        {et.label}
                      </label>
                    ))}
                  </div>
                </>
              );
            })()}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="default" size="sm" onClick={() => setBindingModalStep(1)}>Back</Button>
              <Button variant="primary" size="sm" onClick={handleCreateBinding}>Connect</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Remove Binding Confirmation ---- */}
      <Modal
        open={!!removingBindingId}
        onClose={() => setRemovingBindingId(null)}
        title="Remove Data Source"
      >
        <p className="text-sm text-white/60 mb-4">
          This will disconnect this data source from this department. Existing entities will remain but no new data will be routed here.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="default" size="sm" onClick={() => setRemovingBindingId(null)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleRemoveBinding}>Remove</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
