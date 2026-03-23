"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import Link from "next/link";
import { DOCUMENT_SLOT_TYPES, type SlotType, isStructuralSlot } from "@/lib/document-slots";
import { fetchApi } from "@/lib/fetch-api";
import { EntityRow } from "@/components/entity-row";
import { useUser } from "@/components/user-provider";
import { useTranslations } from "next-intl";

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
  crossDepartment?: boolean;
  homeDepartment?: string | null;
  departmentRole?: string | null;
  relationshipId?: string | null;
  entityType?: { slug: string; name: string; icon: string | null; color: string | null };
  ownerUser?: { name: string } | null;
  autonomySummary?: { supervised: number; notify: number; autonomous: number } | null;
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
  slots: Record<string, SlotDocument[]>;
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
        className={`bg-transparent border-b border-accent outline-none ${inputClassName ?? className ?? ""}`}
      />
    );
  }

  return (
    <Tag
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:border-b hover:border-border-strong transition ${className ?? ""}`}
    >
      {value || <span className="italic text-[var(--fg3)]">Click to edit</span>}
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg2)]">{title}</h2>
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
  const t = useTranslations("map");
  if (status === "confirmed") {
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok">{t("confirmed")}</span>;
  }
  if (status === "extracted") {
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn">{t("readyForReview")}</span>;
  }
  if (status === "processing" || embeddingStatus === "processing") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn">
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        {t("processing")}
      </span>
    );
  }
  if (embeddingStatus === "error") {
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger">{t("error")}</span>;
  }
  if (embeddingStatus === "complete") {
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok">{t("embedded")}</span>;
  }
  return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-hover text-[var(--fg2)]">{t("pending")}</span>;
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
  const { isAdmin } = useUser();
  const t = useTranslations("map");
  const tc = useTranslations("common");

  const [dept, setDept] = useState<DeptDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ---- edit mode ---- */
  const [editMode, setEditMode] = useState(false);

  /* ---- connected data ---- */
  const [connectedEntities, setConnectedEntities] = useState<ConnectedEntityGroup[]>([]);
  const [connectedOffset, setConnectedOffset] = useState(0);
  const [connectedHasMore, setConnectedHasMore] = useState(false);
  const [connectedTotal, setConnectedTotal] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  /* ---- entity account creation (invite flow) ---- */
  const [inviteEntityId, setInviteEntityId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [entityAccountStatus, setEntityAccountStatus] = useState<Record<string, "account" | "pending" | null>>({});
  const [entityInviteLinks, setEntityInviteLinks] = useState<Record<string, string>>({});

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
      if (deptRes.status === 403) { router.push("/map"); return; }
      if (!deptRes.ok) { setNotFound(true); return; }
      setDept(await deptRes.json());
      if (membersRes.ok) setMembers(await membersRes.json());
      if (linksRes.ok) {
        const linksData = await linksRes.json();
        setExternalLinks(linksData.links ?? linksData);
      }
    } finally {
      setLoading(false);
    }
  }, [deptId]);

  // Load account statuses for members (which entities have user accounts or pending invites)
  const loadAccountStatuses = useCallback(async () => {
    try {
      const [usersRes, invitesRes] = await Promise.all([
        fetchApi("/api/users"),
        fetchApi("/api/users/invite"),
      ]);
      const statuses: Record<string, "account" | "pending" | null> = {};
      const links: Record<string, string> = {};
      if (usersRes.ok) {
        const users: Array<{ entityId: string | null; email: string }> = await usersRes.json();
        for (const u of users) {
          if (u.entityId) statuses[u.entityId] = "account";
        }
      }
      if (invitesRes.ok) {
        const invites: Array<{ id: string; entityId: string; link: string }> = await invitesRes.json();
        for (const inv of invites) {
          if (!statuses[inv.entityId]) statuses[inv.entityId] = "pending";
          links[inv.entityId] = inv.link;
        }
      }
      setEntityAccountStatus(statuses);
      setEntityInviteLinks(links);
    } catch { /* best-effort */ }
  }, []);

  const loadDocs = useCallback(async () => {
    const res = await fetchApi(`/api/departments/${deptId}/documents`);
    if (res.ok) setDocsData(await res.json());
  }, [deptId]);

  const fetchExternalLinks = useCallback(async () => {
    const res = await fetchApi(`/api/departments/${deptId}/external-links`);
    if (res.ok) {
      const data = await res.json();
      setExternalLinks(data.links ?? data);
    }
  }, [deptId]);

  const fetchConnectedEntities = useCallback(async (append = false) => {
    const currentOffset = append ? connectedOffset : 0;
    const res = await fetchApi(`/api/departments/${deptId}/connected-entities?limit=50&offset=${currentOffset}`);
    if (res.ok) {
      const data = await res.json();
      const newGroups: ConnectedEntityGroup[] = data.groups ?? [];
      if (append && currentOffset > 0) {
        setConnectedEntities((prev) => {
          const merged = new Map<string, ConnectedEntityGroup>();
          for (const g of prev) merged.set(g.typeSlug, { ...g, entities: [...g.entities] });
          for (const g of newGroups) {
            const existing = merged.get(g.typeSlug);
            if (existing) {
              existing.entities.push(...g.entities);
            } else {
              merged.set(g.typeSlug, g);
            }
          }
          return Array.from(merged.values());
        });
      } else {
        setConnectedEntities(newGroups);
      }
      setConnectedHasMore(data.hasMore ?? false);
      setConnectedTotal(data.totalCount ?? 0);
    }
  }, [deptId, connectedOffset]);

  useEffect(() => {
    load(); loadDocs(); fetchConnectedEntities(); loadAccountStatuses();
  }, [load, loadDocs, fetchConnectedEntities, loadAccountStatuses]);

  // Poll while any doc is processing
  useEffect(() => {
    if (!docsData) return;
    const hasProcessing =
      Object.values(docsData.slots).flat().some(
        (d) => d.status === "processing" || d.embeddingStatus === "processing",
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
  /*  Inline edit department fields                                    */
  /* ---------------------------------------------------------------- */

  async function saveDeptField(field: "name" | "description", value: string) {
    const res = await fetchApi(`/api/departments/${deptId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field === "name" ? "displayName" : field]: value }),
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
      body: JSON.stringify({ displayName: editName.trim(), role: editRole.trim(), email: editEmail.trim() }),
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
        <div className="p-8 text-[var(--fg3)] text-sm">{tc("loading")}</div>
      </AppShell>
    );
  }

  if (notFound || !dept) {
    return (
      <AppShell>
        <div className="p-8">
          <p className="text-[var(--fg2)] mb-4">{t("departmentNotFound")}</p>
          <Link href="/map" className="text-accent hover:text-accent text-sm">
            &larr; {t("backToMap")}
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
          <div className="fixed top-4 right-4 z-50 bg-[color-mix(in_srgb,var(--ok)_20%,transparent)] border border-[color-mix(in_srgb,var(--ok)_30%,transparent)] text-ok text-sm px-4 py-2 rounded-lg shadow-lg">
            {toast}
          </div>
        )}

        {/* ---- header ---- */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.push("/map")}
              className="flex items-center gap-1.5 text-sm text-[var(--fg2)] hover:text-[var(--fg2)] transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              {t("backToMap")}
            </button>
            {isAdmin && (
              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  editMode
                    ? "bg-[color-mix(in_srgb,var(--warn)_20%,transparent)] text-warn border border-[color-mix(in_srgb,var(--warn)_30%,transparent)]"
                    : "bg-hover text-[var(--fg2)] hover:bg-hover hover:text-[var(--fg2)]"
                }`}
              >
                {editMode ? t("doneEditing") : tc("edit")}
              </button>
            )}
          </div>

          <InlineEdit
            as="h1"
            value={dept.displayName}
            onSave={(v) => saveDeptField("name", v)}
            className="text-2xl font-semibold text-foreground block"
            inputClassName="text-2xl font-semibold text-foreground w-full"
          />
          <InlineEdit
            as="p"
            value={dept.description ?? ""}
            onSave={(v) => saveDeptField("description", v)}
            className="text-[var(--fg2)] mt-1 block"
            inputClassName="text-[var(--fg2)] mt-1 w-full"
          />
        </div>

        {/* ---- Section 1: People ---- */}
        <Section
          title={t("people")}
          action={
            isAdmin && !showAdd && (
              <Button variant="default" size="sm" onClick={() => { setShowAdd(true); setAddError(""); }}>
                {t("addMember")}
              </Button>
            )
          }
        >
          {/* add form */}
          {showAdd && (
            <form onSubmit={handleAdd} className="wf-soft p-3 mb-4 space-y-3">
              <div className="flex gap-2">
                <input
                  placeholder={t("name")}
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  className="flex-1 bg-hover border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-[var(--fg3)] outline-none focus:border-accent"
                  autoFocus
                />
                <input
                  placeholder={t("role")}
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                  className="flex-1 bg-hover border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-[var(--fg3)] outline-none focus:border-accent"
                />
                <input
                  placeholder={t("email")}
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  className="flex-1 bg-hover border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-[var(--fg3)] outline-none focus:border-accent"
                />
              </div>
              {addError && <p className="text-xs text-danger">{addError}</p>}
              <div className="flex gap-2">
                <Button type="submit" variant="primary" size="sm" disabled={addSaving}>
                  {addSaving ? t("adding") : tc("add")}
                </Button>
                <Button type="button" variant="default" size="sm" onClick={() => setShowAdd(false)}>
                  {tc("cancel")}
                </Button>
              </div>
            </form>
          )}

          {/* member list */}
          {members.length === 0 && !showAdd ? (
            <p className="text-sm text-[var(--fg3)] py-4 text-center">
              {t("noMembers")}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {members.map((m) => {
                const isAiAgent = m.entityType?.slug === "ai-agent";
                const role = getProp(m, "role");
                const email = getProp(m, "email");

                /* ---- AI agent card ---- */
                if (isAiAgent) {
                  const s = m.autonomySummary;
                  return (
                    <div key={m.id} className="py-2.5" style={{ backgroundColor: "rgba(99,102,241,0.08)", borderRadius: 8, paddingLeft: 10, paddingRight: 10, marginTop: 2, marginBottom: 2 }}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                          </svg>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground">{m.displayName}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-indigo-300/60">AI Assistant</span>
                              {m.ownerUser && (
                                <span className="text-[11px] text-[var(--fg3)]">Paired with {m.ownerUser.name}</span>
                              )}
                            </div>
                            {s ? (
                              <p className="text-[11px] text-[var(--fg3)] mt-0.5">
                                {s.supervised} supervised · {s.notify} notify · {s.autonomous} autonomous
                              </p>
                            ) : (
                              <p className="text-[11px] text-[var(--fg3)] mt-0.5">No tasks assigned yet</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                /* ---- editing row ---- */
                if (editId === m.id) {
                  return (
                    <div key={m.id} className="py-2.5 space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 bg-hover border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                          autoFocus
                        />
                        <input
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="flex-1 bg-hover border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                        />
                        <input
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          type="email"
                          className="flex-1 bg-hover border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
                        />
                      </div>
                      {editError && <p className="text-xs text-danger">{editError}</p>}
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="text-xs text-ok hover:text-ok">{tc("save")}</button>
                        <button onClick={() => setEditId(null)} className="text-xs text-[var(--fg2)] hover:text-[var(--fg2)]">{tc("cancel")}</button>
                      </div>
                    </div>
                  );
                }

                /* ---- remove confirmation ---- */
                if (removeId === m.id) {
                  return (
                    <div key={m.id} className="py-2.5 flex items-center justify-between">
                      <span className="text-sm text-[var(--fg2)]">{tc("remove")} {m.displayName}?</span>
                      <div className="flex gap-2">
                        <button onClick={confirmRemove} className="text-xs text-danger hover:text-danger">{tc("confirm")}</button>
                        <button onClick={() => setRemoveId(null)} className="text-xs text-[var(--fg2)] hover:text-[var(--fg2)]">{tc("cancel")}</button>
                      </div>
                    </div>
                  );
                }

                /* ---- display row ---- */
                const acctStatus = entityAccountStatus[m.id];
                const isInviteTarget = inviteEntityId === m.id;
                const displayRole = m.departmentRole || role;

                return (
                  <div key={m.id}>
                    <div className="group py-2.5 flex items-center justify-between">
                      <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{m.displayName}</span>
                        {displayRole && <span className="text-sm text-[var(--fg2)]">{displayRole}</span>}
                        {email && <span className="text-xs text-[var(--fg3)]">{email}</span>}
                        {m.crossDepartment && m.homeDepartment && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] border border-[color-mix(in_srgb,var(--warn)_20%,transparent)] text-warn">
                            Home: {m.homeDepartment}
                          </span>
                        )}
                        {/* Account status badges */}
                        {acctStatus === "account" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok">{t("hasAccount")}</span>
                        )}
                        {acctStatus === "pending" && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn">
                            {t("invitePending")}
                            <button
                              className="text-accent hover:text-accent"
                              onClick={() => {
                                const link = entityInviteLinks[m.id];
                                if (link) { navigator.clipboard.writeText(link); setToast("Link copied"); }
                              }}
                            >
                              copy
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 items-center">
                        {isAdmin && !acctStatus && (
                          <button
                            onClick={() => {
                              setInviteEntityId(m.id);
                              setInviteEmail(email || "");
                              setInvitePassword("");
                              setInviteRole("member");
                              setInviteError("");
                            }}
                            className="text-[10px] text-accent hover:text-accent mr-2"
                          >
                            {t("createAccount")}
                          </button>
                        )}
                        {isAdmin && !isAiAgent && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button onClick={() => startEdit(m)} title={tc("edit")} className="p-1 text-[var(--fg3)] hover:text-[var(--fg2)]">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            </button>
                            <button onClick={() => setRemoveId(m.id)} title={tc("remove")} className="p-1 text-[var(--fg3)] hover:text-danger">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Inline invite form */}
                    {isInviteTarget && (
                      <div className="pb-3 pl-4 space-y-2">
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <label className="text-[10px] text-[var(--fg2)] block mb-0.5">{t("email")}</label>
                            <input
                              type="email"
                              value={inviteEmail}
                              onChange={(e) => setInviteEmail(e.target.value)}
                              className="w-full bg-hover border border-border rounded px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-accent"
                              placeholder="email@company.com"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-[var(--fg2)] block mb-0.5">{t("password")}</label>
                            <input
                              type="password"
                              value={invitePassword}
                              onChange={(e) => setInvitePassword(e.target.value)}
                              className="w-full bg-hover border border-border rounded px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-accent"
                              placeholder="Min 8 chars"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-[var(--fg2)] block mb-0.5">{t("role")}</label>
                            <select
                              value={inviteRole}
                              onChange={(e) => setInviteRole(e.target.value)}
                              className="bg-hover border border-border rounded px-2 py-1.5 text-xs text-[var(--fg2)]"
                            >
                              <option value="member">Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                        </div>
                        {inviteError && <p className="text-xs text-danger">{inviteError}</p>}
                        <div className="flex gap-2">
                          <button
                            disabled={inviteCreating || !inviteEmail || invitePassword.length < 8}
                            className="text-xs text-accent hover:text-accent disabled:text-[var(--fg3)]"
                            onClick={async () => {
                              setInviteCreating(true);
                              setInviteError("");
                              try {
                                const res = await fetchApi("/api/users/invite", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ entityId: m.id, email: inviteEmail, password: invitePassword, role: inviteRole }),
                                });
                                const data = await res.json();
                                if (!res.ok) { setInviteError(data.error || "Failed"); return; }
                                navigator.clipboard.writeText(data.invite.link);
                                setToast("Invite created! Link copied to clipboard.");
                                setInviteEntityId(null);
                                loadAccountStatuses();
                              } catch { setInviteError("Connection error"); }
                              finally { setInviteCreating(false); }
                            }}
                          >
                            {inviteCreating ? t("creating") : t("createAndCopyLink")}
                          </button>
                          <button className="text-xs text-[var(--fg2)] hover:text-[var(--fg2)]" onClick={() => setInviteEntityId(null)}>
                            {tc("cancel")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ---- Section 2a: Structural Document Slots ---- */}
        <Section title={t("structuralDocuments")}>
          {docError && (
            <p className="text-xs text-danger mb-3">{docError}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(DOCUMENT_SLOT_TYPES) as [SlotType, typeof DOCUMENT_SLOT_TYPES[SlotType]][]).map(
              ([slotType, slotDef]) => {
                const slotDocs = docsData?.slots[slotType] ?? [];
                const isUploading = uploadingSlot === slotType;

                return (
                  <div
                    key={slotType}
                    className={`rounded-lg border p-4 transition ${
                      slotDocs.length > 0
                        ? "border-border border-l-2 border-l-accent"
                        : "border-dashed border-border hover:border-border-strong"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <SlotIcon icon={slotDef.icon} className="w-4 h-4 text-[var(--fg2)]" />
                        <span className="text-sm font-medium text-[var(--fg2)]">{slotDef.label}</span>
                      </div>
                      {slotDocs.length > 0 && (
                        <span className="text-[10px] text-[var(--fg3)]">{slotDocs.length} file{slotDocs.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>

                    {slotDocs.length === 0 && !isUploading && isAdmin && (
                      <button
                        onClick={() => slotFileInputRefs.current[slotType]?.click()}
                        className="w-full py-4 border border-dashed border-border rounded-md text-xs text-[var(--fg3)] hover:text-[var(--fg2)] hover:border-border-strong transition"
                      >
                        {t("dropOrClick")}
                        <input
                          ref={(el) => { slotFileInputRefs.current[slotType] = el; }}
                          type="file"
                          accept=".txt,.csv,.pdf,.docx,.md,.xlsx,.xls,text/plain,text/csv,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                          className="hidden"
                          onChange={(e) => handleSlotFileChange(e, slotType)}
                        />
                      </button>
                    )}
                    {slotDocs.length === 0 && !isUploading && !isAdmin && (
                      <p className="py-4 text-center text-xs text-[var(--fg3)]">{t("noDocuments")}</p>
                    )}

                    {isUploading && (
                      <div className="py-4 text-center">
                        <svg className="mx-auto w-5 h-5 text-accent animate-spin mb-1" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        <p className="text-xs text-[var(--fg2)]">{t("uploading")}</p>
                      </div>
                    )}

                    {slotDocs.length > 0 && !isUploading && (
                      <div className="space-y-2">
                        {slotDocs.map((doc) => {
                          const isExtracting = extractingDoc === doc.id;
                          return (
                            <div key={doc.id}>
                              <p className="text-xs text-[var(--fg2)] truncate">{doc.fileName}</p>
                              <div className="mt-1">
                                <StatusBadge status={doc.status} embeddingStatus={doc.embeddingStatus} />
                              </div>
                              {isExtracting && (
                                <p className="text-xs text-warn mt-1 flex items-center gap-1">
                                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                  {t("extracting")}
                                </p>
                              )}
                              <div className="flex gap-2 mt-2">
                                {doc.status === "extracted" && isAdmin && (
                                  <button
                                    onClick={() => handleReExtract(doc.id, slotType).then(() => {/* modal opens via handler */})}
                                    className="text-[11px] text-accent hover:text-accent"
                                  >
                                    {t("reviewChanges")}
                                  </button>
                                )}
                                {doc.status === "confirmed" && isAdmin && (
                                  <button
                                    onClick={() => handleReExtract(doc.id, slotType)}
                                    disabled={!!isExtracting}
                                    className="text-[11px] text-[var(--fg2)] hover:text-[var(--fg2)]"
                                  >
                                    {t("reExtract")}
                                  </button>
                                )}
                                {isAdmin && (
                                  deleteDocId === doc.id ? (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleDeleteDoc(doc.id)}
                                        className="text-[11px] text-danger hover:text-danger"
                                      >
                                        {tc("delete")}
                                      </button>
                                      <button
                                        onClick={() => setDeleteDocId(null)}
                                        className="text-[11px] text-[var(--fg2)] hover:text-[var(--fg2)]"
                                      >
                                        {tc("cancel")}
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteDocId(doc.id)}
                                      className="text-[11px] text-danger/60 hover:text-danger"
                                    >
                                      {tc("remove")}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {isAdmin && (
                          <button
                            onClick={() => slotFileInputRefs.current[slotType]?.click()}
                            className="text-[11px] text-accent hover:text-accent mt-1"
                          >
                            {t("addMore")}
                            <input
                              ref={(el) => { slotFileInputRefs.current[slotType] = el; }}
                              type="file"
                              accept=".txt,.csv,.pdf,.docx,.md,.xlsx,.xls,text/plain,text/csv,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                              className="hidden"
                              onChange={(e) => handleSlotFileChange(e, slotType)}
                            />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>
        </Section>

        {/* ---- Section 2b: Context Documents ---- */}
        <Section title={t("contextDocuments")}>
          {/* drop zone */}
          {isAdmin && (
          <button
            onClick={() => contextFileInputRef.current?.click()}
            className="w-full py-5 mb-4 border border-dashed border-border rounded-lg text-center hover:border-border-strong transition"
          >
            <svg className="mx-auto w-6 h-6 text-[var(--fg3)] mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xs text-[var(--fg2)]">
              {uploadingContext ? t("uploading") : t("dropOrClick")}
            </p>
            <p className="text-[10px] text-[var(--fg3)] mt-0.5">
              {t("contextDocHint")}
            </p>
            <input
              ref={contextFileInputRef}
              type="file"
              accept=".txt,.csv,.pdf,.docx,.md,.xlsx,.xls,text/plain,text/csv,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              multiple
              className="hidden"
              onChange={handleContextFileChange}
            />
          </button>
          )}

          {/* doc list */}
          {docsData && docsData.contextDocs.length > 0 ? (
            <div className="space-y-1.5">
              {docsData.contextDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-hover transition"
                >
                  <svg className="w-4 h-4 text-[var(--fg3)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-sm text-[var(--fg2)] flex-1 truncate">{doc.fileName}</span>
                  <StatusBadge status={doc.status} embeddingStatus={doc.embeddingStatus} />
                  <div className="flex gap-1">
                    {doc.embeddingStatus === "error" && (
                      <button
                        onClick={() => handleReprocess(doc.id)}
                        title={t("retry")}
                        className="p-1 text-[var(--fg3)] hover:text-warn"
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
                          className="text-[10px] text-danger hover:text-danger"
                        >
                          {tc("delete")}
                        </button>
                        <button
                          onClick={() => setDeleteDocId(null)}
                          className="text-[10px] text-[var(--fg2)] hover:text-[var(--fg2)]"
                        >
                          {tc("cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteDocId(doc.id)}
                        title={tc("delete")}
                        className="p-1 text-[var(--fg3)] hover:text-danger"
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
              <p className="text-xs text-[var(--fg3)] text-center py-2">{t("noContextDocuments")}</p>
            )
          )}
        </Section>

        {/* ---- Section 3: Connected Data ---- */}
        <Section title={t("connectedData")}>
          {connectedEntities.length === 0 ? (
            <p className="text-xs text-[var(--fg3)] text-center py-2">{t("noConnectedData")}</p>
          ) : (
            <div className="space-y-4">
              {connectedEntities.map((group) => {
                const isExpanded = expandedGroups.has(group.typeSlug);
                const visibleEntities = isExpanded ? group.entities : group.entities.slice(0, 10);
                return (
                  <div key={group.typeSlug}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.typeColor }} />
                      <span className="text-xs font-medium text-[var(--fg2)]">{group.typeName}</span>
                      <span className="text-xs text-[var(--fg3)]">({group.entities.length})</span>
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
                        className="text-[11px] text-accent hover:text-accent mt-1 ml-3"
                      >
                        {isExpanded ? t("showLess") : t("showAll", { count: group.entities.length })}
                      </button>
                    )}
                  </div>
                );
              })}
              {connectedHasMore && (
                <button
                  onClick={() => {
                    const newOffset = connectedOffset + 50;
                    setConnectedOffset(newOffset);
                    fetchConnectedEntities(true);
                  }}
                  className="w-full py-2 text-xs text-accent hover:text-accent transition"
                >
                  {t("loadMore", { count: connectedTotal - connectedOffset - 50 })}
                </button>
              )}
            </div>
          )}
        </Section>

        {/* ---- Section 4: External Links ---- */}
        <Section title={t("externalLinks")}>
          {externalLinks.length === 0 ? (
            <div className="py-8 text-center">
              <svg className="mx-auto w-8 h-8 text-[var(--fg3)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.856-2.07a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.343 8.07" />
              </svg>
              <p className="text-sm text-[var(--fg2)]">{t("noExternalLinks")}</p>
              <p className="text-xs text-[var(--fg3)] mt-1">
                {t("externalLinksHint")}
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
                    entityType: { name: link.entityType.name, color: link.entityType.color ?? "var(--accent)", slug: "" },
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
            <p className="text-sm text-[var(--fg2)]">{diffItems.summary}</p>

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
                          <h4 className="text-[10px] uppercase tracking-wider text-ok mb-2">
                            {t("newMembers")}
                          </h4>
                          {creates.map((p) => {
                            const idx = diffItems.people!.indexOf(p);
                            return (
                              <label key={idx} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-hover rounded px-1">
                                <input
                                  type="checkbox"
                                  checked={p.selected}
                                  onChange={() => toggleDiffPerson(idx)}
                                  className="mt-0.5 accent-purple-500"
                                />
                                <div className="text-sm">
                                  <span className="text-foreground font-medium">{p.name}</span>
                                  {p.role && <span className="text-[var(--fg2)] ml-2">— {p.role}</span>}
                                  {p.email && (
                                    <p className="text-xs text-[var(--fg3)]">email: {p.email}</p>
                                  )}
                                  {p.reportsTo && (
                                    <p className="text-xs text-[var(--fg3)]">reports to: {p.reportsTo}</p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {updates.length > 0 && (
                        <div>
                          <h4 className="text-[10px] uppercase tracking-wider text-warn mb-2">
                            {t("updates")}
                          </h4>
                          {updates.map((p) => {
                            const idx = diffItems.people!.indexOf(p);
                            return (
                              <label key={idx} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-hover rounded px-1">
                                <input
                                  type="checkbox"
                                  checked={p.selected}
                                  onChange={() => toggleDiffPerson(idx)}
                                  className="mt-0.5 accent-purple-500"
                                />
                                <div className="text-sm">
                                  <span className="text-foreground font-medium">{p.name}</span>
                                  {p.changes && Object.entries(p.changes).map(([key, change]) => (
                                    <p key={key} className="text-xs text-[var(--fg2)]">
                                      {key}: <span className="text-[var(--fg3)]">&ldquo;{change.from}&rdquo;</span>
                                      {" → "}
                                      <span className="text-[var(--fg2)]">&ldquo;{change.to}&rdquo;</span>
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
                          <h4 className="text-[10px] uppercase tracking-wider text-[var(--fg3)] mb-2">
                            {t("notInDocument")}
                          </h4>
                          {missing.map((p) => {
                            const idx = diffItems.people!.indexOf(p);
                            return (
                              <label key={idx} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-hover rounded px-1">
                                <input
                                  type="checkbox"
                                  checked={p.selected}
                                  onChange={() => toggleDiffPerson(idx)}
                                  className="mt-0.5 accent-purple-500"
                                />
                                <div className="text-sm">
                                  <span className="text-[var(--fg2)]">{p.name}</span>
                                  <p className="text-xs text-[var(--fg3)]">
                                    {t("existsButNotInDoc")}
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
                <h4 className="text-[10px] uppercase tracking-wider text-[var(--fg2)] mb-2">
                  {t("properties")}
                </h4>
                {diffItems.properties.map((p, i) => (
                  <label key={i} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-hover rounded px-1">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={() => toggleDiffProperty(i)}
                      className="mt-0.5 accent-purple-500"
                    />
                    <div className="text-sm">
                      <span className="text-[var(--fg2)]">{p.label}:</span>
                      <span className="text-foreground ml-1">{p.newValue}</span>
                      {p.targetEntityName !== "Department" && (
                        <span className="text-xs text-[var(--fg3)] ml-2">({p.targetEntityName})</span>
                      )}
                      {p.oldValue && (
                        <p className="text-xs text-[var(--fg3)]">
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
                <p className="text-sm text-[var(--fg2)] py-4 text-center">
                  {t("noDataInDocument")}
                </p>
              )}

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button
                variant="default"
                size="sm"
                onClick={() => { setDiffModal(null); setDiffItems(null); }}
              >
                {tc("cancel")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmDiff}
                disabled={confirming}
              >
                {confirming ? t("applying") : t("applySelectedChanges")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

    </AppShell>
  );
}
