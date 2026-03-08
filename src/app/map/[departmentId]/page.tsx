"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getProp(m: Member, slug: string): string {
  return m.propertyValues.find((pv) => pv.property.slug === slug)?.value ?? "";
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
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DepartmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const deptId = params.departmentId as string;

  const [dept, setDept] = useState<DeptDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

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

  /* ---------------------------------------------------------------- */
  /*  Data fetching                                                    */
  /* ---------------------------------------------------------------- */

  const load = useCallback(async () => {
    try {
      const [deptRes, membersRes, linksRes] = await Promise.all([
        fetch(`/api/departments/${deptId}`),
        fetch(`/api/departments/${deptId}/members`),
        fetch(`/api/departments/${deptId}/external-links`),
      ]);
      if (!deptRes.ok) { setNotFound(true); return; }
      setDept(await deptRes.json());
      if (membersRes.ok) setMembers(await membersRes.json());
      if (linksRes.ok) setExternalLinks(await linksRes.json());
    } finally {
      setLoading(false);
    }
  }, [deptId]);

  useEffect(() => { load(); }, [load]);

  /* ---------------------------------------------------------------- */
  /*  Inline edit department fields                                    */
  /* ---------------------------------------------------------------- */

  async function saveDeptField(field: "name" | "description", value: string) {
    const res = await fetch(`/api/departments/${deptId}`, {
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
      const res = await fetch(`/api/departments/${deptId}/members`, {
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
    const res = await fetch(`/api/departments/${deptId}/members/${editId}`, {
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
    const res = await fetch(`/api/departments/${deptId}/members/${removeId}`, { method: "DELETE" });
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.id !== removeId));
    }
    setRemoveId(null);
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
        {/* ---- header ---- */}
        <div>
          <button
            onClick={() => router.push("/map")}
            className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/60 transition mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to Map
          </button>

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
            !showAdd && (
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

        {/* ---- Section 2: Documents (shell) ---- */}
        <Section title="Documents">
          <div className="py-8 text-center">
            <svg className="mx-auto w-8 h-8 text-white/15 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-white/40">Upload documents to provide context for this department</p>
            <p className="text-xs text-white/25 mt-1">
              Process guides, playbooks, policies — anything that helps the AI understand how this team works
            </p>
            <span className="inline-block mt-3 text-[10px] uppercase tracking-wider text-white/20 border border-white/10 rounded px-2 py-0.5">
              Coming in next update
            </span>
          </div>
        </Section>

        {/* ---- Section 3: Connected Data (shell) ---- */}
        <Section title="Connected Data">
          <div className="py-8 text-center">
            <svg className="mx-auto w-8 h-8 text-white/15 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <p className="text-sm text-white/40">Connect a data source to see operational data here</p>
            <p className="text-xs text-white/25 mt-1">
              CRM records, invoices, deals, and other operational data from your connected tools will appear here
            </p>
            <Link
              href="/settings?tab=connections"
              className="inline-block mt-3 text-xs text-purple-400 hover:text-purple-300 transition"
            >
              Manage Connections &rarr;
            </Link>
          </div>
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
            <div className="space-y-2">
              {externalLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition cursor-default"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: link.entityType.color ?? "#a855f7" }}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-white/90">{link.displayName}</span>
                    <span className="ml-2 text-xs text-white/30">{link.entityType.name}</span>
                  </div>
                  <span className="text-xs text-white/25 truncate max-w-[200px]">{link.linkedVia}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
