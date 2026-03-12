"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { DOCUMENT_SLOT_TYPES, type SlotType } from "@/lib/document-slots";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { OnboardingMapBuilder } from "@/components/onboarding/onboarding-map-builder";
import { OnboardingDepartmentList } from "@/components/onboarding/onboarding-department-list";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

import type {
  OnboardingStep, Department, Member, InternalDoc, DocsData,
  PersonDiff, PropertyDiff, ExtractionDiff, Provider,
} from "@/components/onboarding/types";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */


const INDUSTRY_OPTIONS = [
  { value: "", label: "Select industry (optional)" },
  { value: "Technology", label: "Technology" },
  { value: "Finance", label: "Finance" },
  { value: "Healthcare", label: "Healthcare" },
  { value: "Retail", label: "Retail" },
  { value: "Manufacturing", label: "Manufacturing" },
  { value: "Professional Services", label: "Professional Services" },
  { value: "Other", label: "Other" },
];

const CARD_W = 180;
const CARD_H = 80;
const CLICK_THRESHOLD = 5;

const SLOT_ICONS: Record<string, string> = {
  network: "M12 3v3m0 12v3m-6-9H3m18 0h-3m-2.25-5.25L17.25 5.25m-10.5 0L8.25 6.75m0 10.5l-1.5 1.5m10.5-1.5l1.5 1.5M12 9a3 3 0 100 6 3 3 0 000-6z",
  "clipboard-list": "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
};

const PROVIDER_COLORS: Record<string, string> = {
  hubspot: "#ff7a59",
  stripe: "#635bff",
};

const PROVIDER_LABELS: Record<string, string> = {
  hubspot: "HubSpot",
  stripe: "Stripe",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function defaultPosition(index: number, total: number) {
  const radius = 180;
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function OnboardingPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[rgba(8,12,16,1)]"><div className="text-white/30 text-sm">Loading...</div></div>}>
      <OnboardingPage />
    </Suspense>
  );
}

function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<OnboardingStep | null>(null);

  // Step 1 state
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [originalCompanyName, setOriginalCompanyName] = useState("");
  const [originalIndustry, setOriginalIndustry] = useState("");
  const [savingStep1, setSavingStep1] = useState(false);

  // Step 2 state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [addingDept, setAddingDept] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptDesc, setDeptDesc] = useState("");
  const [deptError, setDeptError] = useState("");
  const [savingDept, setSavingDept] = useState(false);

  // Step 2 map state
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [, forceRender] = useState(0);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // Step 3 state
  const [deptMembers, setDeptMembers] = useState<Record<string, Member[]>>({});
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberError, setMemberError] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [memberHints, setMemberHints] = useState<Record<string, string>>({});
  const [savingStep3, setSavingStep3] = useState(false);

  // Step 4 state (documents)
  const [docsPerDept, setDocsPerDept] = useState<Record<string, DocsData>>({});
  const [expandedDocDept, setExpandedDocDept] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [uploadingContext, setUploadingContext] = useState(false);
  const [docError, setDocError] = useState("");
  const [extractingDoc, setExtractingDoc] = useState<string | null>(null);
  const [diffModal, setDiffModal] = useState<{
    deptId: string;
    docId: string;
    slotType: string;
    diff: ExtractionDiff;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const slotFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const contextFileInputRef = useRef<HTMLInputElement | null>(null);

  // Step 5 state (connectors)
  const [providers, setProviders] = useState<Provider[]>([]);
  const [companyConnectors, setCompanyConnectors] = useState<Array<{ id: string; provider: string; name: string; status: string }>>([]);

  // Step 6 state (sync)
  const [syncStarted, setSyncStarted] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [manualSyncInProgress, setManualSyncInProgress] = useState(false);
  const [manualSyncResult, setManualSyncResult] = useState<{
    synced: Array<{ name: string; status: string }>;
    errors: Array<{ name: string; error: string }>;
  } | null>(null);
  const [deptEntityCounts, setDeptEntityCounts] = useState<Record<string, number>>({});
  const [totalEntities, setTotalEntities] = useState(0);
  const [totalRelationships, setTotalRelationships] = useState(0);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCountsRef = useRef<string>("");
  const stableCountRef = useRef(0);

  /* ---------------------------------------------------------------- */
  /*  On mount — detect progress                                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    async function detectStep() {
      const [deptRes, orientRes, operatorRes] = await Promise.all([
        fetch("/api/departments"),
        fetch("/api/orientation/current"),
        fetch("/api/operator"),
      ]);
      const allDepts: Department[] = deptRes.ok ? await deptRes.json() : [];
      const orientation = orientRes.ok ? await orientRes.json() : {};
      const operator = operatorRes.ok ? await operatorRes.json() : {};
      const phase = orientation.session?.phase ?? "mapping";

      // Pre-fill step 1 fields
      if (operator.companyName) {
        setCompanyName(operator.companyName);
        setOriginalCompanyName(operator.companyName);
      }
      if (operator.industry) {
        setIndustry(operator.industry);
        setOriginalIndustry(operator.industry);
      }

      // Load departments state
      setDepartments(allDepts);
      initPositions(allDepts);

      // If returning from OAuth, force step 5 so the callback effect can fire
      const isOAuthReturn = searchParams.get("hubspot") === "connected"
        || searchParams.get("stripe") === "connected";
      if (isOAuthReturn) {
        setStep(5);
        return;
      }

      const depts = allDepts.filter(d => d.entityType?.slug === "department");

      // Step 1-2: Need departments
      if (depts.length < 2) {
        setStep(1);
        return;
      }

      // Step 3: Need people in all departments
      const allHavePeople = depts.every(d => d.memberCount > 0);
      if (!allHavePeople) {
        setStep(3);
        return;
      }

      // Step 4: Documents (optional — check phase)
      if (phase === "mapping" || phase === "populating") {
        setStep(4);
        return;
      }

      // Step 6: Syncing
      if (phase === "connecting" || phase === "syncing") {
        setStep(6);
        return;
      }

      // If orienting → redirect to copilot
      if (phase === "orienting") {
        router.replace("/copilot");
        return;
      }

      // If active → redirect to /map
      if (phase === "active") {
        router.replace("/map");
        return;
      }

      // Default to step 4
      setStep(4);
    }
    detectStep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Position helpers                                                  */
  /* ---------------------------------------------------------------- */

  function initPositions(depts: Department[]) {
    const nonHQ = depts.filter(d => d.entityType?.slug === "department");
    depts.forEach(d => {
      const isHQ = d.entityType?.slug === "organization";
      if (isHQ) {
        positionsRef.current[d.id] = d.mapX != null && d.mapY != null
          ? { x: d.mapX, y: d.mapY }
          : { x: 0, y: 0 };
      } else {
        const idx = nonHQ.indexOf(d);
        positionsRef.current[d.id] = d.mapX != null && d.mapY != null
          ? { x: d.mapX, y: d.mapY }
          : defaultPosition(idx, nonHQ.length);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Step 1: Continue                                                  */
  /* ---------------------------------------------------------------- */

  async function handleStep1Continue() {
    if (!companyName.trim()) return;
    setSavingStep1(true);

    try {
      const patchData: Record<string, string> = {};
      if (companyName.trim() !== originalCompanyName) {
        patchData.companyName = companyName.trim();
      }
      if (industry !== originalIndustry) {
        patchData.industry = industry;
      }

      if (Object.keys(patchData).length > 0) {
        await fetch("/api/operator", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchData),
        });
      }

      // Store industry in orientation context if changed
      if (industry && industry !== originalIndustry) {
        await fetch("/api/orientation/advance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: JSON.stringify({ industry }) }),
        });
      }

      // Load departments for step 2
      const res = await fetch("/api/departments");
      if (res.ok) {
        const data: Department[] = await res.json();
        setDepartments(data);
        initPositions(data);
      }

      setStep(2);
    } finally {
      setSavingStep1(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Step 2: Department management                                     */
  /* ---------------------------------------------------------------- */

  const loadDepartments = useCallback(async () => {
    const res = await fetch("/api/departments");
    if (res.ok) {
      const data: Department[] = await res.json();
      setDepartments(data);
      const nonHQ = data.filter(d => d.entityType?.slug === "department");
      data.forEach(d => {
        if (!positionsRef.current[d.id]) {
          const isHQ = d.entityType?.slug === "organization";
          if (isHQ) {
            positionsRef.current[d.id] = d.mapX != null && d.mapY != null
              ? { x: d.mapX, y: d.mapY }
              : { x: 0, y: 0 };
          } else {
            const idx = nonHQ.indexOf(d);
            positionsRef.current[d.id] = d.mapX != null && d.mapY != null
              ? { x: d.mapX, y: d.mapY }
              : defaultPosition(idx, nonHQ.length);
          }
        }
      });
    }
  }, []);

  async function handleAddDepartment() {
    if (!deptName.trim() || !deptDesc.trim()) {
      setDeptError("Both name and description are required");
      return;
    }
    setSavingDept(true);
    setDeptError("");

    try {
      const nonHQ = departments.filter(d => d.entityType?.slug === "department");
      const pos = defaultPosition(nonHQ.length, nonHQ.length + 1);

      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: deptName.trim(),
          description: deptDesc.trim(),
          mapX: pos.x,
          mapY: pos.y,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setDeptError(err?.error ?? "Failed to create department");
        return;
      }

      setDeptName("");
      setDeptDesc("");
      setAddingDept(false);
      await loadDepartments();
    } finally {
      setSavingDept(false);
    }
  }

  const [deletingDept, setDeletingDept] = useState(false);

  async function handleDeleteDepartment(dept: Department) {
    if (dept.memberCount > 0) {
      const ok = window.confirm(
        `"${dept.displayName}" has ${dept.memberCount} member${dept.memberCount > 1 ? "s" : ""}. Delete this department?`
      );
      if (!ok) return;
    }
    setDeletingDept(true);
    try {
      const res = await fetch(`/api/departments/${dept.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setDeptError(err?.error ?? "Failed to delete department");
        return;
      }
      delete positionsRef.current[dept.id];
      await loadDepartments();
    } finally {
      setDeletingDept(false);
    }
  }

  const deptCount = departments.filter(d => d.entityType?.slug === "department").length;
  const canContinueStep2 = deptCount >= 2;

  /* ---------------------------------------------------------------- */
  /*  Step 2: Card drag                                                */
  /* ---------------------------------------------------------------- */

  const onCardMouseDown = useCallback((e: React.MouseEvent, deptId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = positionsRef.current[deptId] ?? { x: 0, y: 0 };
    dragRef.current = {
      id: deptId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
    setDragId(deptId);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) > CLICK_THRESHOLD || Math.abs(dy) > CLICK_THRESHOLD) {
        d.moved = true;
      }
      positionsRef.current[d.id] = { x: d.origX + dx, y: d.origY + dy };
      forceRender(n => n + 1);
    };

    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setDragId(null);
      if (d.moved) {
        const pos = positionsRef.current[d.id];
        fetch(`/api/departments/${d.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mapX: pos.x, mapY: pos.y }),
        });
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Step 3: Member management                                        */
  /* ---------------------------------------------------------------- */

  const realDepts = departments.filter(d => d.entityType?.slug === "department");

  const loadMembers = useCallback(async (deptId: string) => {
    const res = await fetch(`/api/departments/${deptId}/members`);
    if (res.ok) {
      const data: Member[] = await res.json();
      setDeptMembers(prev => ({ ...prev, [deptId]: data }));
    }
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    realDepts.forEach(d => loadMembers(d.id));
    if (realDepts.length > 0 && !expandedDept) {
      setExpandedDept(realDepts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleAddMember(deptId: string) {
    if (!memberName.trim() || !memberRole.trim() || !memberEmail.trim()) {
      setMemberError("All fields are required");
      return;
    }
    setSavingMember(true);
    setMemberError("");

    try {
      const res = await fetch(`/api/departments/${deptId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: memberName.trim(),
          role: memberRole.trim(),
          email: memberEmail.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setMemberError(err?.error ?? "Failed to add member");
        return;
      }

      const emailNorm = memberEmail.trim().toLowerCase();
      const userCheck = await fetch(`/api/users/invite`);
      if (userCheck.ok) {
        const data = await userCheck.json();
        const users = data.users || [];
        const found = users.some((u: { email: string }) => u.email.toLowerCase() === emailNorm);
        if (!found) {
          setMemberHints(prev => ({
            ...prev,
            [emailNorm]: "This person doesn't have a Qorpera account yet — invite them from Settings → Team.",
          }));
        }
      }

      setMemberName("");
      setMemberRole("");
      setMemberEmail("");
      await loadMembers(deptId);
      await loadDepartments();
    } finally {
      setSavingMember(false);
    }
  }

  const allDeptsHaveMembers = realDepts.length > 0 && realDepts.every(d => {
    const members = deptMembers[d.id];
    return (members && members.length > 0) || d.memberCount > 0;
  });

  async function handleStep3Continue() {
    setSavingStep3(true);
    try {
      await fetch("/api/orientation/advance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setStep(4);
    } finally {
      setSavingStep3(false);
    }
  }

  async function handleStep2Continue() {
    const res = await fetch("/api/departments");
    if (res.ok) {
      const data: Department[] = await res.json();
      setDepartments(data);
    }
    setStep(3);
  }

  /* ---------------------------------------------------------------- */
  /*  Step 4: Document management                                      */
  /* ---------------------------------------------------------------- */

  const loadDocs = useCallback(async (deptId: string) => {
    const res = await fetch(`/api/departments/${deptId}/documents`);
    if (res.ok) {
      const data: DocsData = await res.json();
      setDocsPerDept(prev => ({ ...prev, [deptId]: data }));
    }
  }, []);

  useEffect(() => {
    if (step !== 4) return;
    realDepts.forEach(d => loadDocs(d.id));
    if (realDepts.length > 0 && !expandedDocDept) {
      setExpandedDocDept(realDepts[0].id);
    }
    // Poll for doc status updates every 5 seconds
    const poll = setInterval(() => {
      realDepts.forEach(d => loadDocs(d.id));
    }, 5000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function uploadFile(deptId: string, file: File, documentType: string) {
    const isSlot = documentType !== "context";
    if (isSlot) setUploadingSlot(documentType);
    else setUploadingContext(true);
    setDocError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);

      let res: Response;
      try {
        res = await fetch(`/api/departments/${deptId}/documents/upload`, {
          method: "POST",
          body: formData,
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        setDocError(`Upload failed: ${msg}`);
        return;
      }

      if (!res.ok) {
        let errorMsg = `Upload failed (${res.status})`;
        try {
          const err = await res.json();
          errorMsg = err?.error || errorMsg;
        } catch {
          try { errorMsg = await res.text() || errorMsg; } catch { /* fallback */ }
        }
        setDocError(errorMsg);
        return;
      }

      const doc = await res.json();
      await loadDocs(deptId);

      // Auto-trigger extraction for structural docs
      if (isSlot) {
        setExtractingDoc(doc.id);
        try {
          const extRes = await fetch(`/api/departments/${deptId}/documents/${doc.id}/extract`, {
            method: "POST",
          });
          if (extRes.ok) {
            const extData = await extRes.json();
            if (extData.diff) {
              setDiffModal({
                deptId,
                docId: doc.id,
                slotType: documentType,
                diff: extData.diff,
              });
            }
          }
          await loadDocs(deptId);
        } finally {
          setExtractingDoc(null);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDocError(`Upload error: ${msg}`);
    } finally {
      if (isSlot) setUploadingSlot(null);
      else setUploadingContext(false);
    }
  }

  async function handleDeleteDoc(deptId: string, docId: string) {
    try {
      const res = await fetch(`/api/departments/${deptId}/documents/${docId}`, { method: "DELETE" });
      if (res.ok) await loadDocs(deptId);
    } catch {
      setDocError("Failed to delete document");
    }
  }

  async function handleRetryDoc(deptId: string, docId: string) {
    try {
      await fetch(`/api/departments/${deptId}/documents/${docId}/reprocess`, { method: "POST" });
      await loadDocs(deptId);
    } catch {
      setDocError("Failed to retry processing");
    }
  }

  async function handleSlotFileChange(e: React.ChangeEvent<HTMLInputElement>, deptId: string, slotType: string) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = "";
    for (let i = 0; i < files.length; i++) {
      await uploadFile(deptId, files[i], slotType);
      if (i < files.length - 1) await new Promise(r => setTimeout(r, 200));
    }
  }

  async function handleContextFileChange(e: React.ChangeEvent<HTMLInputElement>, deptId: string) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = "";
    for (let i = 0; i < files.length; i++) {
      await uploadFile(deptId, files[i], "context");
      if (i < files.length - 1) await new Promise(r => setTimeout(r, 200));
    }
  }

  async function handleConfirmDiff() {
    if (!diffModal) return;
    setConfirming(true);
    try {
      await fetch(`/api/departments/${diffModal.deptId}/documents/${diffModal.docId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diff: diffModal.diff }),
      });
      await loadDocs(diffModal.deptId);
      setDiffModal(null);
    } finally {
      setConfirming(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Step 5: Connector management                                     */
  /* ---------------------------------------------------------------- */

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/connectors/providers");
    if (res.ok) {
      const data = await res.json();
      setProviders(data.providers || []);
    }
  }, []);

  const loadCompanyConnectors = useCallback(async () => {
    const res = await fetch("/api/connectors");
    if (res.ok) {
      const data = await res.json();
      // Company connectors have no userId — filter to HubSpot/Stripe
      const company = (data.connectors || []).filter((c: { provider: string; userId?: string | null }) =>
        !c.userId && (c.provider === "hubspot" || c.provider === "stripe")
      );
      setCompanyConnectors(company);
    }
  }, []);

  useEffect(() => {
    if (step !== 5) return;
    loadProviders();
    loadCompanyConnectors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Detect OAuth return
  useEffect(() => {
    if (step !== 5) return;
    const connected = searchParams.get("hubspot") === "connected"
      || searchParams.get("stripe") === "connected";

    if (!connected) return;

    // A company provider just connected — refresh connector list
    (async () => {
      await loadCompanyConnectors();
      window.history.replaceState({}, "", "/onboarding");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, searchParams]);

  function handleConnectProvider(providerId: string) {
    fetch(`/api/connectors/${providerId}/auth-url?from=onboarding`)
      .then(r => r.json())
      .then(data => {
        if (data.url) window.location.href = data.url;
      });
  }

  const canContinueStep5 = true; // Tools are optional — always allow continuing

  async function handleStep5Continue() {
    // Advance: populating → connecting
    await fetch("/api/orientation/advance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setStep(6);
  }

  /* ---------------------------------------------------------------- */
  /*  Step 6: Sync + learn                                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (step !== 6) return;

    // Auto-trigger sync
    if (!syncStarted) {
      setSyncStarted(true);
      fetch("/api/connectors/sync-all", { method: "POST" })
        .then(r => r.json())
        .then(() => {
          // Sync call returns when done (it's synchronous per-connector)
          setSyncDone(true);
        })
        .catch(() => setSyncDone(true));
    }

    // Poll for entity counts every 3 seconds
    if (syncPollRef.current) return;
    syncPollRef.current = setInterval(async () => {
      try {
        const [deptRes, ctxRes] = await Promise.all([
          fetch("/api/departments"),
          fetch("/api/copilot/context"),
        ]);
        if (deptRes.ok) {
          const depts: Department[] = await deptRes.json();
          setDepartments(depts);
          const counts: Record<string, number> = {};
          depts.forEach(d => {
            if (d.entityType?.slug === "department") {
              counts[d.id] = d.memberCount;
            }
          });
          setDeptEntityCounts(counts);

          // Check for stable counts (same for 2 polls)
          const snapshot = JSON.stringify(counts);
          if (snapshot === prevCountsRef.current) {
            stableCountRef.current++;
          } else {
            stableCountRef.current = 0;
          }
          prevCountsRef.current = snapshot;
        }
        if (ctxRes.ok) {
          const ctx = await ctxRes.json();
          setTotalEntities(ctx.totalEntities ?? 0);
          setTotalRelationships(ctx.totalRelationships ?? 0);
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => {
      if (syncPollRef.current) {
        clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const syncComplete = syncDone || stableCountRef.current >= 2;

  async function handleStep6Finish() {
    // Stop polling
    if (syncPollRef.current) {
      clearInterval(syncPollRef.current);
      syncPollRef.current = null;
    }
    // Advance directly to orienting phase (skipping intermediate phases)
    const res = await fetch("/api/orientation/advance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPhase: "orienting" }),
    });
    if (!res.ok) {
      // Fallback: try one step at a time
      await fetch("/api/orientation/advance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      await fetch("/api/orientation/advance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    }
    router.replace("/copilot");
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (step === null) {
    return (
      <div className="min-h-screen bg-[rgba(8,12,16,1)] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
      </div>
    );
  }

  const hq = departments.find(d => d.entityType?.slug === "organization");
  const nonHQ = departments.filter(d => d.entityType?.slug === "department");

  return (
    <div className="min-h-screen bg-[rgba(8,12,16,1)] flex flex-col items-center px-4 py-12">
      <OnboardingProgress step={step} />

      {/* Content area */}
      <div className="w-full max-w-[600px]">
        {/* ============================================================ */}
        {/*  Step 1: Name Your Company                                    */}
        {/* ============================================================ */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-xs text-white/30 uppercase tracking-wider">Step 1 of 6</p>
              <h1 className="text-2xl font-semibold text-white/90">What&apos;s your company called?</h1>
            </div>

            <div className="space-y-4">
              <Input
                label="Company name"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Acme Corp"
                autoFocus
              />
              <Select
                label="What industry are you in?"
                options={INDUSTRY_OPTIONS}
                value={industry}
                onChange={e => setIndustry(e.target.value)}
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="md"
                onClick={handleStep1Continue}
                disabled={!companyName.trim() || savingStep1}
              >
                {savingStep1 ? "Saving..." : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 2: Build Your Departments                               */}
        {/* ============================================================ */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-xs text-white/30 uppercase tracking-wider">Step 2 of 6</p>
              <h1 className="text-2xl font-semibold text-white/90">Build your departments</h1>
              <p className="text-sm text-white/45">
                Add the teams that make up your company.
              </p>
            </div>

            <OnboardingMapBuilder
              hq={hq ?? null}
              departments={nonHQ}
              positionsRef={positionsRef}
              dragId={dragId}
              onCardMouseDown={onCardMouseDown}
              onDeleteDepartment={handleDeleteDepartment}
            />

            {addingDept ? (
              <div className="wf-soft p-4 space-y-3">
                <div className="text-xs text-white/30 uppercase tracking-wider">New department</div>
                <Input
                  placeholder="Department name"
                  value={deptName}
                  onChange={e => { setDeptName(e.target.value); setDeptError(""); }}
                  autoFocus
                />
                <Input
                  placeholder="What does this department do?"
                  value={deptDesc}
                  onChange={e => { setDeptDesc(e.target.value); setDeptError(""); }}
                />
                {deptError && <p className="text-xs text-red-400">{deptError}</p>}
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={handleAddDepartment} disabled={savingDept}>
                    {savingDept ? "Adding..." : "Add"}
                  </Button>
                  <Button variant="default" size="sm" onClick={() => { setAddingDept(false); setDeptName(""); setDeptDesc(""); setDeptError(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingDept(true)}
                className="w-full py-3 rounded-xl border border-dashed border-white/[0.1] text-sm text-white/40 hover:text-white/60 hover:border-white/20 transition"
              >
                + Add Department
              </button>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className={`w-4 h-4 ${canContinueStep2 ? "text-emerald-400" : "text-white/20"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className={`text-xs ${canContinueStep2 ? "text-white/50" : "text-white/30"}`}>
                  Add at least 2 departments to continue
                </span>
              </div>
              <span className={`text-xs font-medium ${canContinueStep2 ? "text-emerald-400" : "text-white/30"}`}>
                {deptCount}/2
              </span>
            </div>

            {nonHQ.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {nonHQ.map(dept => (
                  <div key={dept.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-xs text-white/70">{dept.displayName}</span>
                    <button
                      onClick={() => handleDeleteDepartment(dept)}
                      disabled={deletingDept}
                      className="ml-0.5 text-white/20 hover:text-red-400 transition"
                      title="Delete department"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="text-sm text-white/40 hover:text-white/60 transition"
              >
                &larr; Back
              </button>
              <Button
                variant="primary"
                size="md"
                onClick={handleStep2Continue}
                disabled={!canContinueStep2}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 3: Add Your Team                                        */}
        {/* ============================================================ */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-xs text-white/30 uppercase tracking-wider">Step 3 of 6</p>
              <h1 className="text-2xl font-semibold text-white/90">Add your team</h1>
              <p className="text-sm text-white/45">
                Add at least one person to each department.
              </p>
            </div>

            <div className="space-y-4">
              {realDepts.map(dept => {
                const members = deptMembers[dept.id] ?? [];
                const hasMember = members.length > 0 || dept.memberCount > 0;
                const isExpanded = expandedDept === dept.id;

                return (
                  <div key={dept.id} className="wf-soft overflow-hidden">
                    <button
                      onClick={() => setExpandedDept(isExpanded ? null : dept.id)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white/90">{dept.displayName}</h3>
                        {dept.description && (
                          <p className="text-xs text-white/40 mt-0.5">{dept.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 ml-3">
                        <span className="text-xs text-white/30">{members.length} {members.length === 1 ? "person" : "people"}</span>
                        <CheckCircle done={hasMember} />
                        <ChevronDown open={isExpanded} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 space-y-3 border-t border-white/[0.06] pt-3">
                        {members.length > 0 ? (
                          <div className="space-y-2">
                            {members.map(m => {
                              const isCross = !!m.crossDepartment;
                              const homeDept = m.homeDepartment;
                              const role = m.departmentRole || m.propertyValues.find(pv => pv.property.slug === "role")?.value || "";
                              const email = m.propertyValues.find(pv => pv.property.slug === "email")?.value ?? "";
                              return (
                                <div key={m.id} className="flex items-center gap-2 text-sm">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCross ? "bg-amber-400" : "bg-purple-400"}`} />
                                  <span className="text-white/80">{m.displayName}</span>
                                  {role && <span className="text-white/30">— {role}</span>}
                                  {email && <span className="text-white/20">— {email}</span>}
                                  {isCross && homeDept && (
                                    <span className="text-[10px] text-amber-400/60 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/15">
                                      Home: {homeDept}
                                    </span>
                                  )}
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setRemovingMember(m.id);
                                      try {
                                        await fetch(`/api/departments/${dept.id}/members/${m.id}`, { method: "DELETE" });
                                        await loadMembers(dept.id);
                                        await loadDepartments();
                                      } finally {
                                        setRemovingMember(null);
                                      }
                                    }}
                                    disabled={removingMember === m.id}
                                    className="ml-auto text-white/20 hover:text-red-400 transition shrink-0"
                                    title="Remove"
                                  >
                                    {removingMember === m.id ? (
                                      <div className="w-3 h-3 rounded-full border border-white/20 border-t-white/40 animate-spin" />
                                    ) : (
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                            {members.map(m => {
                              const email = m.propertyValues.find(pv => pv.property.slug === "email")?.value ?? "";
                              const hint = memberHints[email.toLowerCase()];
                              if (!hint) return null;
                              return (
                                <p key={`hint-${m.id}`} className="text-[11px] text-amber-400/60 italic pl-3.5">
                                  {hint}
                                </p>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-white/25 italic">(no team members yet)</p>
                        )}

                        <div className="pt-2 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={memberName}
                              onChange={e => { setMemberName(e.target.value); setMemberError(""); }}
                              placeholder="Name"
                              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                            />
                            <input
                              type="text"
                              value={memberRole}
                              onChange={e => { setMemberRole(e.target.value); setMemberError(""); }}
                              placeholder="Role"
                              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                            />
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="email"
                              value={memberEmail}
                              onChange={e => { setMemberEmail(e.target.value); setMemberError(""); }}
                              placeholder="Email"
                              className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                            />
                            <Button variant="primary" size="sm" onClick={() => handleAddMember(dept.id)} disabled={savingMember}>
                              {savingMember ? "..." : "Add"}
                            </Button>
                          </div>
                          {memberError && <p className="text-xs text-red-400">{memberError}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 ${allDeptsHaveMembers ? "text-emerald-400" : "text-white/20"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className={`text-xs ${allDeptsHaveMembers ? "text-white/50" : "text-white/30"}`}>
                Add at least 1 person per department
              </span>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(2)}
                className="text-sm text-white/40 hover:text-white/60 transition"
              >
                &larr; Back
              </button>
              <Button
                variant="primary"
                size="md"
                onClick={handleStep3Continue}
                disabled={!allDeptsHaveMembers || savingStep3}
              >
                {savingStep3 ? "Saving..." : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 4: Share Knowledge (Documents — optional)               */}
        {/* ============================================================ */}
        {step === 4 && (() => {
          const allDocs = Object.values(docsPerDept).flatMap(d => {
            if (!d) return [];
            return [...Object.values(d.slots).flat(), ...d.contextDocs];
          });
          const totalDocs = allDocs.length;
          const processingDocs = allDocs.filter(d => d.embeddingStatus === "processing" || d.embeddingStatus === "pending");
          const errorDocs = allDocs.filter(d => d.embeddingStatus === "error");
          const completeDocs = allDocs.filter(d => d.embeddingStatus === "complete");

          return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-xs text-white/30 uppercase tracking-wider">Step 4 of 6</p>
              <h1 className="text-2xl font-semibold text-white/90">Share your knowledge</h1>
              <p className="text-sm text-white/45">
                Drop in documents to help the AI understand how each department works. <span className="text-white/30">(optional)</span>
              </p>
            </div>

            {totalDocs > 0 && (
              <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 ${
                errorDocs.length > 0
                  ? "bg-red-500/10 border border-red-500/15 text-red-400"
                  : processingDocs.length > 0
                    ? "bg-amber-500/10 border border-amber-500/15 text-amber-400"
                    : "bg-emerald-500/10 border border-emerald-500/15 text-emerald-400"
              }`}>
                {errorDocs.length > 0 ? (
                  <>
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                    </svg>
                    <span>Error processing: {errorDocs.map(d => d.fileName).join(", ")}</span>
                  </>
                ) : processingDocs.length > 0 ? (
                  <>
                    <div className="w-3 h-3 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin shrink-0" />
                    <span>Processing {processingDocs.length} {processingDocs.length === 1 ? "document" : "documents"}...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>All {completeDocs.length} {completeDocs.length === 1 ? "document" : "documents"} processed successfully</span>
                  </>
                )}
              </div>
            )}

            {docError && (
              <div className="rounded-lg px-4 py-2.5 text-xs bg-red-500/10 border border-red-500/15 text-red-400 flex items-center gap-2">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
                <span className="flex-1">{docError}</span>
                <button onClick={() => setDocError("")} className="text-red-400/60 hover:text-red-400 ml-2">×</button>
              </div>
            )}

            <div className="space-y-4">
              {realDepts.map(dept => {
                const docs = docsPerDept[dept.id];
                const isExpanded = expandedDocDept === dept.id;

                return (
                  <div key={dept.id} className="wf-soft overflow-hidden">
                    <button
                      onClick={() => setExpandedDocDept(isExpanded ? null : dept.id)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white/90">{dept.displayName}</h3>
                        {dept.description && (
                          <p className="text-xs text-white/40 mt-0.5">{dept.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 ml-3">
                        {docs && (
                          <span className="text-xs text-white/30">
                            {Object.values(docs.slots).flat().length + docs.contextDocs.length} docs
                          </span>
                        )}
                        <ChevronDown open={isExpanded} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 space-y-4 border-t border-white/[0.06] pt-3">
                        {/* Structural slots */}
                        <div className="grid grid-cols-2 gap-2">
                          {(Object.keys(DOCUMENT_SLOT_TYPES) as SlotType[]).map(slotType => {
                            const slotDef = DOCUMENT_SLOT_TYPES[slotType];
                            const slotDocs = docs?.slots[slotType] ?? [];
                            const isUploading = uploadingSlot === slotType;

                            return (
                              <div
                                key={slotType}
                                className={`relative rounded-lg border p-3 ${
                                  slotDocs.length > 0 ? "border-white/[0.1] bg-white/[0.02]" : "border-dashed border-white/[0.08]"
                                } transition`}
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <svg className={`w-3.5 h-3.5 ${slotDocs.length > 0 ? "text-purple-400" : "text-white/20"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={SLOT_ICONS[slotDef.icon] || ""} />
                                  </svg>
                                  <span className="text-xs font-medium text-white/70">{slotDef.label}</span>
                                  {slotDocs.length > 0 && (
                                    <span className="text-[10px] text-white/30 ml-auto">{slotDocs.length} file{slotDocs.length !== 1 ? "s" : ""}</span>
                                  )}
                                </div>

                                {slotDocs.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {slotDocs.map(doc => {
                                      const isExtracting = extractingDoc === doc.id;
                                      const needsReview = doc.status === "extracted";
                                      return (
                                        <div key={doc.id} className="space-y-1">
                                          <p className="text-[10px] text-white/40 truncate">{doc.fileName}</p>
                                          <div className="flex items-center gap-2">
                                            <EmbeddingBadge status={doc.embeddingStatus} />
                                            {isExtracting && (
                                              <span className="text-[10px] text-amber-400/70">Extracting...</span>
                                            )}
                                            {needsReview && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  fetch(`/api/departments/${dept.id}/documents/${doc.id}/extract`, { method: "POST" })
                                                    .then(r => r.json())
                                                    .then(data => {
                                                      if (data.diff) {
                                                        setDiffModal({ deptId: dept.id, docId: doc.id, slotType, diff: data.diff });
                                                      }
                                                    });
                                                }}
                                                className="text-[10px] text-amber-400 hover:text-amber-300 font-medium"
                                              >
                                                Review Changes
                                              </button>
                                            )}
                                            {(doc.embeddingStatus === "error" || doc.embeddingStatus === "pending" || doc.embeddingStatus === "processing") && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); handleRetryDoc(dept.id, doc.id); }}
                                                className="text-[10px] text-purple-400 hover:text-purple-300 font-medium"
                                              >
                                                Retry
                                              </button>
                                            )}
                                            <button
                                              onClick={(e) => { e.stopPropagation(); handleDeleteDoc(dept.id, doc.id); }}
                                              className="text-[10px] text-red-400/60 hover:text-red-400 font-medium"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    <input
                                      ref={el => { slotFileInputRefs.current[`${dept.id}-${slotType}`] = el; }}
                                      type="file"
                                      multiple
                                      accept=".txt,.csv,.pdf,.docx,.md,.xlsx,.xls,text/plain,text/csv,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                      className="hidden"
                                      onChange={e => handleSlotFileChange(e, dept.id, slotType)}
                                    />
                                    <button
                                      onClick={(e) => { e.stopPropagation(); slotFileInputRefs.current[`${dept.id}-${slotType}`]?.click(); }}
                                      className="text-[10px] text-purple-400 hover:text-purple-300 font-medium mt-1"
                                    >
                                      {isUploading ? "Uploading..." : "+ Add more"}
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    className="cursor-pointer hover:border-white/15 hover:bg-white/[0.02] transition rounded p-1"
                                    onClick={() => {
                                      if (!isUploading) slotFileInputRefs.current[`${dept.id}-${slotType}`]?.click();
                                    }}
                                  >
                                    <input
                                      ref={el => { slotFileInputRefs.current[`${dept.id}-${slotType}`] = el; }}
                                      type="file"
                                      multiple
                                      accept=".txt,.csv,.pdf,.docx,.md,.xlsx,.xls,text/plain,text/csv,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                      className="hidden"
                                      onChange={e => handleSlotFileChange(e, dept.id, slotType)}
                                    />
                                    <span className="text-[10px] text-white/30">
                                      {isUploading ? "Uploading..." : "Click to upload"}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Context docs */}
                        <div className="space-y-2">
                          <div className="text-xs text-white/30">Context Documents</div>
                          {docs?.contextDocs && docs.contextDocs.length > 0 && (
                            <div className="space-y-1">
                              {docs.contextDocs.map(cdoc => (
                                <div key={cdoc.id} className="flex items-center gap-2 text-sm">
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                                  <span className="text-white/60 text-xs truncate flex-1">{cdoc.fileName}</span>
                                  <EmbeddingBadge status={cdoc.embeddingStatus} />
                                  {(cdoc.embeddingStatus === "error" || cdoc.embeddingStatus === "pending" || cdoc.embeddingStatus === "processing") && (
                                    <button
                                      onClick={() => handleRetryDoc(dept.id, cdoc.id)}
                                      className="text-[10px] text-purple-400 hover:text-purple-300 font-medium shrink-0"
                                    >
                                      Retry
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeleteDoc(dept.id, cdoc.id)}
                                    className="text-[10px] text-red-400/60 hover:text-red-400 font-medium shrink-0"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <input
                            ref={contextFileInputRef}
                            type="file"
                            accept=".txt,.csv,.pdf,.docx,.md,.xlsx,.xls,text/plain,text/csv,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                            multiple
                            className="hidden"
                            onChange={e => handleContextFileChange(e, dept.id)}
                          />
                          <button
                            onClick={() => contextFileInputRef.current?.click()}
                            disabled={uploadingContext}
                            className="w-full py-2 rounded-lg border border-dashed border-white/[0.08] text-xs text-white/30 hover:text-white/50 hover:border-white/15 transition"
                          >
                            {uploadingContext ? "Uploading..." : "+ Add context documents (guides, playbooks, policies)"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(3)}
                className="text-sm text-white/40 hover:text-white/60 transition"
              >
                &larr; Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(5)}
                  className="text-sm text-white/40 hover:text-white/60 transition"
                >
                  Skip for now
                </button>
                <Button variant="primary" size="md" onClick={() => setStep(5)}>
                  Continue
                </Button>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ============================================================ */}
        {/*  Step 5: Connect Your Tools                                   */}
        {/* ============================================================ */}
        {step === 5 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-xs text-white/30 uppercase tracking-wider">Step 5 of 6</p>
              <h1 className="text-2xl font-semibold text-white/90">Link your company tools</h1>
              <p className="text-sm text-white/45">
                Connect your CRM and payment tools. Personal tools like Gmail can be connected from your account page after setup.
              </p>
            </div>

            {/* Company connectors */}
            <div className="space-y-3">
              {providers.filter(p => p.configured && p.id !== "google" && p.id !== "google-sheets").map(p => {
                const label = PROVIDER_LABELS[p.id] ?? p.name;
                const color = PROVIDER_COLORS[p.id] ?? "#888";
                const connected = companyConnectors.some(c => c.provider === p.id);

                return (
                  <div key={p.id} className="wf-soft px-5 py-4 flex items-center gap-3">
                    <span
                      className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {label.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white/80">{label}</span>
                    </div>
                    {connected ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-400">Connected</span>
                        <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnectProvider(p.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-xs text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition"
                      >
                        Connect {label}
                      </button>
                    )}
                  </div>
                );
              })}

              {providers.filter(p => p.configured && p.id !== "google" && p.id !== "google-sheets").length === 0 && (
                <div className="wf-soft px-5 py-4">
                  <p className="text-xs text-white/25">No company connectors configured. Set environment variables for HubSpot or Stripe to enable them.</p>
                </div>
              )}
            </div>

            {/* Gate indicator */}
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-white/50">
                Company tools are optional — you can always connect them later in Settings.
              </span>
              {companyConnectors.length > 0 && (
                <span className="text-xs font-medium ml-auto text-emerald-400">
                  {companyConnectors.length} connected
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(4)}
                className="text-sm text-white/40 hover:text-white/60 transition"
              >
                &larr; Back
              </button>
              <Button
                variant="primary"
                size="md"
                onClick={handleStep5Continue}
                disabled={!canContinueStep5}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  Step 6: Learning Your Business (Sync)                        */}
        {/* ============================================================ */}
        {step === 6 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-xs text-white/30 uppercase tracking-wider">Step 6 of 6</p>
              <h1 className="text-2xl font-semibold text-white/90">
                {syncComplete ? "Your business model" : "Learning your business..."}
              </h1>
              <p className="text-sm text-white/45">
                {syncComplete
                  ? "Here's what we discovered from your connected tools."
                  : "Syncing and analyzing your connected data sources."}
              </p>
            </div>

            {/* Manual Start Sync button */}
            <div className="flex flex-col items-center gap-3">
              <Button
                variant="primary"
                size="md"
                disabled={manualSyncInProgress}
                onClick={async () => {
                  setManualSyncInProgress(true);
                  setManualSyncResult(null);
                  try {
                    const res = await fetch("/api/connectors/sync-all", { method: "POST" });
                    if (res.ok) {
                      const data = await res.json();
                      setManualSyncResult({
                        synced: (data.synced || []).map((s: { name: string; status: string }) => ({ name: s.name, status: s.status })),
                        errors: (data.errors || []).map((e: { name: string; error: string }) => ({ name: e.name, error: e.error })),
                      });
                    } else {
                      setManualSyncResult({ synced: [], errors: [{ name: "Sync", error: "Request failed" }] });
                    }
                  } catch {
                    setManualSyncResult({ synced: [], errors: [{ name: "Sync", error: "Network error" }] });
                  }
                  setManualSyncInProgress(false);
                }}
              >
                {manualSyncInProgress ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Syncing...
                  </span>
                ) : "Start Sync"}
              </Button>
              {manualSyncResult && (
                <div className="w-full space-y-1">
                  <p className="text-xs text-center text-white/60">
                    Synced {manualSyncResult.synced.length} connector{manualSyncResult.synced.length !== 1 ? "s" : ""}.
                    {manualSyncResult.errors.length > 0 && (
                      <span className="text-red-400"> {manualSyncResult.errors.length} error{manualSyncResult.errors.length !== 1 ? "s" : ""}.</span>
                    )}
                  </p>
                  {manualSyncResult.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-red-400/80 text-center">{e.name}: {e.error}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Per-department progress */}
            <div className="space-y-3">
              {realDepts.map(dept => {
                const count = deptEntityCounts[dept.id] ?? dept.memberCount ?? 0;
                // Simple progress: show entities found
                return (
                  <div key={dept.id} className="wf-soft p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white/90">{dept.displayName}</h3>
                      {syncComplete ? (
                        <span className="text-xs text-emerald-400 font-medium">Done</span>
                      ) : (
                        <div className="w-3 h-3 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
                      )}
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${syncComplete ? "bg-emerald-500" : "bg-purple-500"}`}
                        style={{ width: syncComplete ? "100%" : `${Math.min(80, count * 5)}%` }}
                      />
                    </div>
                    <p className="text-xs text-white/40">
                      {count} {count === 1 ? "entity" : "entities"}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-3">
              <div className="wf-soft p-4 text-center">
                <div className="text-2xl font-semibold text-white/90">{totalEntities}</div>
                <div className="text-xs text-white/40 mt-1">Total entities</div>
              </div>
              <div className="wf-soft p-4 text-center">
                <div className="text-2xl font-semibold text-white/90">{totalRelationships}</div>
                <div className="text-xs text-white/40 mt-1">Relationships</div>
              </div>
            </div>

            {syncComplete && (
              <div className="flex justify-center pt-4">
                <Button variant="primary" size="lg" onClick={handleStep6Finish}>
                  Ready! Let&apos;s talk about your business &rarr;
                </Button>
              </div>
            )}

            {!syncComplete && (
              <p className="text-xs text-white/25 text-center">
                This may take a moment depending on your data volume.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/*  Extraction Diff Modal (Step 4)                                */}
      {/* ============================================================ */}
      <Modal
        open={!!diffModal}
        onClose={() => setDiffModal(null)}
        title={diffModal ? `Review: ${DOCUMENT_SLOT_TYPES[diffModal.slotType as SlotType]?.label ?? diffModal.slotType} Changes` : "Review Changes"}
        wide
      >
        {diffModal && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">{diffModal.diff.summary}</p>

            {/* People diffs */}
            {diffModal.diff.people && diffModal.diff.people.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-white/30 uppercase tracking-wider">People</div>
                {diffModal.diff.people.map((p, i) => (
                  <label key={i} className="flex items-start gap-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={() => {
                        const updated = { ...diffModal.diff };
                        if (updated.people) {
                          updated.people = [...updated.people];
                          updated.people[i] = { ...updated.people[i], selected: !updated.people[i].selected };
                        }
                        setDiffModal({ ...diffModal, diff: updated });
                      }}
                      className="mt-0.5 accent-purple-500"
                    />
                    <div>
                      <span className={`text-sm ${
                        p.action === "create" ? "text-emerald-400" : p.action === "update" ? "text-amber-400" : "text-white/40"
                      }`}>
                        {p.action === "create" ? "+" : p.action === "update" ? "~" : "?"} {p.name}
                      </span>
                      {p.role && <span className="text-xs text-white/30 ml-2">{p.role}</span>}
                      {p.changes && Object.entries(p.changes).map(([key, val]) => (
                        <div key={key} className="text-[10px] text-white/25 ml-4">
                          {key}: {val.from} &rarr; {val.to}
                        </div>
                      ))}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Property diffs */}
            {diffModal.diff.properties && diffModal.diff.properties.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-white/30 uppercase tracking-wider">Properties</div>
                {diffModal.diff.properties.map((p, i) => (
                  <label key={i} className="flex items-start gap-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={() => {
                        const updated = { ...diffModal.diff };
                        if (updated.properties) {
                          updated.properties = [...updated.properties];
                          updated.properties[i] = { ...updated.properties[i], selected: !updated.properties[i].selected };
                        }
                        setDiffModal({ ...diffModal, diff: updated });
                      }}
                      className="mt-0.5 accent-purple-500"
                    />
                    <div>
                      <span className="text-sm text-white/80">{p.label}</span>
                      <span className="text-xs text-white/30 ml-2">on {p.targetEntityName}</span>
                      {p.oldValue && (
                        <div className="text-[10px] text-white/25 ml-4">
                          {p.oldValue} &rarr; {p.newValue}
                        </div>
                      )}
                      {!p.oldValue && (
                        <div className="text-[10px] text-emerald-400/60 ml-4">= {p.newValue}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="default" size="sm" onClick={() => setDiffModal(null)}>
                Skip
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmDiff} disabled={confirming}>
                {confirming ? "Applying..." : "Apply Selected Changes"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small helper components                                            */
/* ------------------------------------------------------------------ */

function CheckCircle({ done }: { done: boolean }) {
  return (
    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
      done ? "bg-emerald-500/20" : "bg-white/[0.06]"
    }`}>
      {done ? (
        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <div className="w-2 h-2 rounded-full bg-white/20" />
      )}
    </div>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 text-white/30 transition ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function EmbeddingBadge({ status }: { status: string }) {
  if (status === "complete" || status === "embedded") {
    return <span className="text-[10px] text-emerald-400/60">Embedded</span>;
  }
  if (status === "processing" || status === "pending") {
    return <span className="text-[10px] text-amber-400/60">Processing...</span>;
  }
  if (status === "error") {
    return <span className="text-[10px] text-red-400/60">Error</span>;
  }
  return null;
}
