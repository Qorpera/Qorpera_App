"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";
import { useUser } from "@/components/user-provider";
import { AppShell } from "@/components/app-shell";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

interface OverviewData {
  totalDetected: number;
  totalProposed: number;
  totalApproved: number;
  totalRejected: number;
  totalAutoResolved: number;
  totalResolved: number;
  overallApprovalRate: number;
  autonomyDistribution: Record<string, number>;
  approvalRateOverTime: Array<{ date: string; rate: number; count: number }>;
  outcomeDistribution: Record<string, number>;
}

interface DomainData {
  id: string | null;
  name: string;
  situationCount: number;
  approvalRate: number;
  outcomeDistribution: Record<string, number>;
  situationTypes: Array<{
    id: string;
    name: string;
    autonomyLevel: string;
    count: number;
  }>;
}

interface FeedbackEntry {
  id: string;
  situationTypeName: string;
  domainName: string | null;
  feedbackCategory: string | null;
  feedback: string | null;
  createdAt: string;
  approvalRateBefore: number | null;
  approvalRateAfter: number | null;
  likelyLearned: boolean;
}

interface FeedbackData {
  recentFeedback: FeedbackEntry[];
  feedbackThemeSummary: string;
}

interface TypeDetail {
  id: string;
  name: string;
  description: string;
  autonomyLevel: string;
  department: { id: string; name: string } | null;
  metrics: {
    totalProposed: number;
    totalApproved: number;
    totalRejected: number;
    approvalRate: number;
    consecutiveApprovals: number;
    avgConfidence: number;
  };
  outcomeDistribution: Record<string, number>;
  approvalRateOverTime: Array<{ date: string; rate: number; count: number }>;
  recentFeedback: Array<{
    id: string;
    feedbackCategory: string | null;
    feedback: string | null;
    createdAt: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

const OUTCOME_COLORS: Record<string, string> = {
  positive: "var(--ok)",
  negative: "var(--danger)",
  neutral: "var(--fg3)",
  unknown: "var(--border)",
};

const AUTONOMY_COLORS: Record<string, string> = {
  supervised: "var(--accent)",
  notify: "var(--warn)",
  autonomous: "var(--ok)",
};

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--fg2)" },
};

// ── Page ─────────────────────────────────────────────────────────────────────

interface AiLearningEntry {
  id: string;
  name: string;
  ownerName: string;
  department: string;
  counts: { supervised: number; notify: number; autonomous: number };
  topTask: { name: string; level: string } | null;
}

export default function LearningPage() {
  const t = useTranslations("learning");
  const { isAdmin } = useUser();
  const [period, setPeriod] = useState(30);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [departments, setDepartments] = useState<DomainData[]>([]);
  const [feedbackImpact, setFeedbackImpact] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [typeDetail, setTypeDetail] = useState<TypeDetail | null>(null);
  const [aiLearning, setAiLearning] = useState<AiLearningEntry[]>([]);

  useEffect(() => {
    setLoading(true);
    const params = `days=${period}`;
    Promise.all([
      fetch(`/api/learning/overview?${params}`).then((r) => r.json()),
      fetch(`/api/learning/domains?${params}`).then((r) => r.json()),
      fetch(`/api/learning/feedback-impact?${params}`).then((r) => r.json()),
    ]).then(([ov, dept, fb]) => {
      setOverview(ov);
      setDepartments(dept.domains ?? []);
      setFeedbackImpact(fb);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [period]);

  // Fetch AI learning overview for admins
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/ai-learning-overview")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setAiLearning(data))
      .catch(() => {});
  }, [isAdmin]);

  const expandType = useCallback(
    async (typeId: string) => {
      if (expandedType === typeId) {
        setExpandedType(null);
        setTypeDetail(null);
        return;
      }
      setExpandedType(typeId);
      setTypeDetail(null);
      const res = await fetch(`/api/learning/situation-types/${typeId}?days=${period}`);
      if (res.ok) setTypeDetail(await res.json());
    },
    [expandedType, period],
  );

  async function handleExport() {
    const res = await fetch(`/api/learning/export?days=${period}&format=csv`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qorpera-learning-${period}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Client-side department filtering
  const filteredDomains = domainFilter
    ? departments.filter((d) => d.id === domainFilter)
    : departments;

  const allSituationTypes = filteredDomains.flatMap((d) =>
    d.situationTypes.map((st) => ({ ...st, domainName: d.name, domainId: d.id })),
  ).sort((a, b) => b.count - a.count);

  const filteredFeedback = feedbackImpact
    ? domainFilter
      ? {
          ...feedbackImpact,
          recentFeedback: feedbackImpact.recentFeedback.filter((f) => {
            const dept = departments.find((d) => d.id === domainFilter);
            return dept && f.domainName === dept.name;
          }),
        }
      : feedbackImpact
    : null;

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 py-3 -mt-3">
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="wf-soft px-3 py-1.5 text-sm text-[var(--fg2)] bg-elevated border-0 outline-none cursor-pointer"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <select
              value={domainFilter ?? ""}
              onChange={(e) => setDomainFilter(e.target.value || null)}
              className="wf-soft px-3 py-1.5 text-sm text-[var(--fg2)] bg-elevated border-0 outline-none cursor-pointer"
            >
              <option value="">All Departments</option>
              {departments
                .filter((d) => d.id !== null)
                .map((d) => (
                  <option key={d.id} value={d.id!}>
                    {d.name}
                  </option>
                ))}
            </select>
            <button
              onClick={handleExport}
              className="wf-soft px-3 py-1.5 text-sm text-[var(--fg2)] hover:text-foreground transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-t-accent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Panel 1: Overview */}
            <OverviewPanel overview={overview} />

            {/* Panel 2: Department Breakdown */}
            <DepartmentTable
              domains={filteredDomains}
              onSelectDepartment={setDomainFilter}
              activeDomain={domainFilter}
            />

            {/* Panel 3: Situation Types */}
            <SituationTypesPanel
              situationTypes={allSituationTypes}
              expandedType={expandedType}
              typeDetail={typeDetail}
              onExpandType={expandType}
              isAdmin={isAdmin}
            />

            {/* Panel 4: Feedback Impact */}
            <FeedbackPanel feedback={filteredFeedback} />

            {/* Panel 5: AI Learning by Team Member (admin only) */}
            {isAdmin && (
              <AiLearningPanel entries={aiLearning} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

// ── Panel 1: Overview ────────────────────────────────────────────────────────

function OverviewPanel({ overview }: { overview: OverviewData | null }) {
  const t = useTranslations("learning");
  const locale = useLocale();
  if (!overview) return null;

  const metrics = [
    { label: t("kpi.totalDetected"), value: overview.totalDetected },
    { label: t("kpi.approved"), value: overview.totalApproved },
    { label: t("kpi.rejected"), value: overview.totalRejected },
    { label: t("approvalRate"), value: pct(overview.overallApprovalRate) },
    { label: t("kpi.autoResolved"), value: overview.totalAutoResolved },
  ];

  const outcomeData = Object.entries(overview.outcomeDistribution).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: OUTCOME_COLORS[name] ?? "rgba(255,255,255,0.15)",
  }));

  const hasChartData = overview.approvalRateOverTime.length > 0;
  const hasOutcomeData = outcomeData.some((d) => d.value > 0);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-[var(--fg2)] uppercase tracking-wider">{t("tabs.overview")}</h2>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="wf-soft p-4">
            <div className="text-2xl font-semibold text-foreground">{m.value}</div>
            <div className="text-xs text-[var(--fg2)] mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Approval Rate Over Time */}
        <div className="wf-soft p-4 flex-1 lg:w-[60%]">
          <h3 className="text-xs text-[var(--fg2)] mb-3">{t("approvalRateOverTime")}</h3>
          {hasChartData ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={overview.approvalRateOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--fg3)", fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fill: "var(--fg3)", fontSize: 10 }}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, t("approvalRate")]}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ fill: "var(--accent)", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-[var(--fg3)]">
              Not enough data yet
            </div>
          )}
        </div>

        {/* Outcome Distribution */}
        <div className="wf-soft p-4 lg:w-[40%]">
          <h3 className="text-xs text-[var(--fg2)] mb-3">{t("outcomes")}</h3>
          {hasOutcomeData ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={outcomeData} layout="vertical">
                <XAxis type="number" tick={{ fill: "var(--fg3)", fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "var(--fg2)", fontSize: 11 }}
                  width={70}
                />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {outcomeData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-[var(--fg3)]">
              Not enough data yet
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Panel 2: Department Breakdown ────────────────────────────────────────────

function DepartmentTable({
  domains,
  onSelectDepartment,
  activeDomain,
}: {
  domains: DomainData[];
  onSelectDepartment: (id: string | null) => void;
  activeDomain: string | null;
}) {
  const t = useTranslations("learning");
  if (domains.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--fg2)] uppercase tracking-wider">
          {t("domainPerformance")}
        </h2>
        <div className="wf-soft p-8 text-center text-sm text-[var(--fg3)]">
          Complete onboarding to see department breakdown
        </div>
      </section>
    );
  }

  const sorted = [...domains].sort((a, b) => b.situationCount - a.situationCount);

  function highestAutonomy(dept: DomainData): string {
    const levels = dept.situationTypes.map((st) => st.autonomyLevel);
    if (levels.includes("autonomous")) return "autonomous";
    if (levels.includes("notify")) return "notify";
    return "supervised";
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-[var(--fg2)] uppercase tracking-wider">
          {t("domainPerformance")}
        </h2>
        {activeDomain && (
          <button
            onClick={() => onSelectDepartment(null)}
            className="text-xs text-accent hover:text-accent"
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="wf-soft overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--fg3)] text-xs border-b border-border">
              <th className="text-left py-3 px-4 font-medium">Department</th>
              <th className="text-right py-3 px-4 font-medium">Situations</th>
              <th className="text-right py-3 px-4 font-medium">{t("approvalRate")}</th>
              <th className="text-right py-3 px-4 font-medium">Situation Types</th>
              <th className="text-right py-3 px-4 font-medium">Top Autonomy</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((dept) => {
              const top = highestAutonomy(dept);
              const isActive = activeDomain === dept.id;
              return (
                <tr
                  key={dept.id ?? "unscoped"}
                  onClick={() => dept.id && onSelectDepartment(isActive ? null : dept.id)}
                  className={`border-b border-border transition-colors ${
                    dept.id ? "cursor-pointer hover:bg-hover" : ""
                  } ${isActive ? "bg-accent-light" : ""}`}
                >
                  <td className="py-3 px-4 text-foreground">{dept.name}</td>
                  <td className="py-3 px-4 text-right text-[var(--fg2)]">{dept.situationCount}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-hover rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent/60 rounded-full"
                          style={{ width: `${dept.approvalRate * 100}%` }}
                        />
                      </div>
                      <span className="text-[var(--fg2)] w-10 text-right">
                        {pct(dept.approvalRate)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-[var(--fg2)]">
                    {dept.situationTypes.length}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        color: AUTONOMY_COLORS[top],
                        background: `${AUTONOMY_COLORS[top]}15`,
                      }}
                    >
                      {top}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Panel 3: Situation Types ─────────────────────────────────────────────────

function SituationTypesPanel({
  situationTypes,
  expandedType,
  typeDetail,
  onExpandType,
  isAdmin,
}: {
  situationTypes: Array<{
    id: string;
    name: string;
    autonomyLevel: string;
    count: number;
    domainName: string;
    domainId: string | null;
  }>;
  expandedType: string | null;
  typeDetail: TypeDetail | null;
  onExpandType: (id: string) => void;
  isAdmin: boolean;
}) {
  const t = useTranslations("learning");
  if (situationTypes.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--fg2)] uppercase tracking-wider">
          {t("typeDetails")}
        </h2>
        <div className="wf-soft p-8 text-center text-sm text-[var(--fg3)]">
          No situation types created yet. Complete orientation to teach the AI what to watch for.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-[var(--fg2)] uppercase tracking-wider">
        {t("typeDetails")}
      </h2>
      <div className="space-y-3">
        {situationTypes.map((st) => (
          <SituationTypeCard
            key={st.id}
            st={st}
            isExpanded={expandedType === st.id}
            detail={expandedType === st.id ? typeDetail : null}
            onToggle={() => onExpandType(st.id)}
            isAdmin={isAdmin}
          />
        ))}
      </div>
    </section>
  );
}

function SituationTypeCard({
  st,
  isExpanded,
  detail,
  onToggle,
  isAdmin,
}: {
  st: {
    id: string;
    name: string;
    autonomyLevel: string;
    count: number;
    domainName: string;
  };
  isExpanded: boolean;
  detail: TypeDetail | null;
  onToggle: () => void;
  isAdmin: boolean;
}) {
  const t = useTranslations("learning");
  const autonomyColor = AUTONOMY_COLORS[st.autonomyLevel] ?? AUTONOMY_COLORS.supervised;

  const locale = useLocale();

  return (
    <div className="wf-soft overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 text-left hover:bg-hover transition-colors"
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-foreground font-medium">{st.name}</span>
            <span className="text-xs text-[var(--fg3)]">{st.domainName}</span>
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ color: autonomyColor, background: `${autonomyColor}15` }}
          >
            {st.autonomyLevel}
          </span>
        </div>

        {detail ? (
          <>
            {/* Metrics row */}
            <div className="flex items-center gap-4 text-xs text-[var(--fg2)] mb-2">
              <span>{detail.metrics.totalProposed} {t("kpi.proposed")}</span>
              <span>{detail.metrics.totalApproved} {t("kpi.approved")}</span>
              <span>{detail.metrics.totalRejected} {t("kpi.rejected")}</span>
              <span className="text-[var(--fg2)]">{pct(detail.metrics.approvalRate)} {t("rate")}</span>
              <span>{detail.metrics.consecutiveApprovals} {t("consecutive")}</span>
            </div>

            {/* Approval rate bar */}
            <div className="w-full h-1.5 bg-hover rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-accent/60 rounded-full transition-all"
                style={{ width: `${detail.metrics.approvalRate * 100}%` }}
              />
            </div>

            {/* Outcome + confidence */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <span className="text-[var(--fg3)]">Outcomes:</span>
                {Object.entries(detail.outcomeDistribution)
                  .filter(([, v]) => v > 0)
                  .map(([key, val]) => (
                    <span key={key} className="flex items-center gap-0.5">
                      <span
                        className="inline-block w-2 h-2 rounded-sm"
                        style={{ background: OUTCOME_COLORS[key] }}
                      />
                      <span className="text-[var(--fg2)]">
                        {val} {key}
                      </span>
                    </span>
                  ))}
              </div>
              <span className="text-[var(--fg2)]">
                Avg confidence: {detail.metrics.avgConfidence.toFixed(2)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4 text-xs text-[var(--fg2)]">
            <span>{st.count} situations</span>
          </div>
        )}
      </button>

      {/* Expanded section */}
      {isExpanded && (
        <div className="border-t border-border p-4 space-y-4">
          {!detail ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-4 h-4 border-2 border-[color-mix(in_srgb,var(--accent)_30%,transparent)] border-t-accent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Mini approval rate chart */}
              {detail.approvalRateOverTime.length > 0 && (
                <div>
                  <h4 className="text-xs text-[var(--fg3)] mb-2">{t("approvalRateOverTime")}</h4>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={detail.approvalRateOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "var(--fg3)", fontSize: 9 }}
                        tickFormatter={(v: string) => v.slice(5)}
                      />
                      <YAxis
                        domain={[0, 1]}
                        tick={{ fill: "var(--fg3)", fontSize: 9 }}
                        tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                        width={35}
                      />
                      <Tooltip
                        {...CHART_TOOLTIP_STYLE}
                        formatter={(v) => [
                          `${(Number(v) * 100).toFixed(1)}%`,
                          "Rate",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="rate"
                        stroke="var(--accent)"
                        strokeWidth={1.5}
                        dot={{ fill: "var(--accent)", r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Recent feedback */}
              {detail.recentFeedback.length > 0 ? (
                <div>
                  <h4 className="text-xs text-[var(--fg3)] mb-2">{t("recentFeedback")}</h4>
                  <div className="space-y-2">
                    {detail.recentFeedback.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-start gap-2 text-xs text-[var(--fg2)]"
                      >
                        {f.feedbackCategory && (
                          <span className="text-warn/70 shrink-0">
                            [{f.feedbackCategory.replace(/_/g, " ")}]
                          </span>
                        )}
                        <span className="text-[var(--fg2)]">
                          &quot;{f.feedback}&quot;
                        </span>
                        <span className="text-[var(--fg3)] shrink-0 ml-auto">
                          {formatRelativeTime(f.createdAt, locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--fg3)]">{t("noFeedback")}</p>
              )}

              {/* Admin promote button */}
              {isAdmin && st.autonomyLevel !== "autonomous" && (
                <PromoteButton situationTypeId={st.id} currentLevel={st.autonomyLevel} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PromoteButton({
  situationTypeId,
  currentLevel,
}: {
  situationTypeId: string;
  currentLevel: string;
}) {
  const [promoting, setPromoting] = useState(false);
  const nextLevel = currentLevel === "supervised" ? "notify" : "autonomous";
  const label = currentLevel === "supervised" ? "Promote to Notify" : "Promote to Act";

  async function handlePromote() {
    if (!confirm(`This will change autonomy to "${nextLevel}" for this situation type. Are you sure?`)) return;
    setPromoting(true);
    try {
      const res = await fetch(`/api/situation-types/${situationTypeId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: nextLevel }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setPromoting(false);
    }
  }

  return (
    <button
      onClick={handlePromote}
      disabled={promoting}
      className="mt-2 text-xs px-3 py-1.5 rounded border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-accent hover:bg-accent-light transition-colors disabled:opacity-50"
    >
      {promoting ? "Promoting..." : label}
    </button>
  );
}

// ── Panel 4: Feedback Impact ─────────────────────────────────────────────────

function FeedbackPanel({ feedback }: { feedback: FeedbackData | null }) {
  const t = useTranslations("learning");
  const locale = useLocale();
  if (!feedback) return null;

  if (feedback.recentFeedback.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-[var(--fg2)] uppercase tracking-wider">
          {t("recentFeedback")}
        </h2>
        <div className="wf-soft p-8 text-center text-sm text-[var(--fg3)]">
          No feedback given yet. Approve, reject, or teach on situations to help the AI learn.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-[var(--fg2)] uppercase tracking-wider">
        {t("recentFeedback")}
      </h2>
      <p className="text-xs text-[var(--fg3)]">
        Recent feedback and its impact on AI performance:
      </p>

      <div className="space-y-3">
        {feedback.recentFeedback.map((f) => (
          <div key={f.id} className="wf-soft p-4 space-y-2">
            <p className="text-sm text-foreground">
              &quot;{f.feedback}&quot;
            </p>
            <div className="flex items-center gap-2 text-xs text-[var(--fg2)] flex-wrap">
              <span>{f.situationTypeName}</span>
              {f.domainName && (
                <>
                  <span className="text-[var(--fg3)]">&#x2022;</span>
                  <span>{f.domainName}</span>
                </>
              )}
              {f.feedbackCategory && (
                <>
                  <span className="text-[var(--fg3)]">&#x2022;</span>
                  <span>{f.feedbackCategory.replace(/_/g, " ")}</span>
                </>
              )}
              <span className="text-[var(--fg3)]">&#x2022;</span>
              <span>{formatRelativeTime(f.createdAt, locale)}</span>
            </div>

            {/* Before/After comparison */}
            <div className="flex items-center gap-2 text-xs">
              {f.approvalRateBefore !== null && (
                <span className="text-[var(--fg2)]">
                  Before: {pct(f.approvalRateBefore)}
                </span>
              )}
              {f.approvalRateBefore !== null && f.approvalRateAfter !== null && (
                <span className="text-[var(--fg3)]">&rarr;</span>
              )}
              {f.approvalRateAfter !== null && (
                <span className="text-[var(--fg2)]">
                  After: {pct(f.approvalRateAfter)}
                </span>
              )}
              {f.likelyLearned ? (
                <span className="text-green-400 ml-1">&#x2713; Improved</span>
              ) : f.approvalRateBefore !== null && f.approvalRateAfter !== null ? (
                <span className="text-[var(--fg3)] ml-1">&mdash; No clear impact yet</span>
              ) : (
                <span className="text-[var(--fg3)] ml-1">Not enough data to compare</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Theme summary */}
      {feedback.feedbackThemeSummary && (
        <div className="wf-soft p-4">
          <h3 className="text-xs text-[var(--fg3)] mb-2">{t("feedbackThemeSummary")}</h3>
          <p className="text-sm text-[var(--fg2)]">{feedback.feedbackThemeSummary}</p>
        </div>
      )}
    </section>
  );
}

// ── Panel 5: AI Learning by Team Member ─────────────────────────────────────

function AiLearningPanel({ entries }: { entries: AiLearningEntry[] }) {
  const LEVEL_COLORS: Record<string, string> = {
    supervised: "bg-skeleton text-[var(--fg2)] border-border",
    notify: "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn border-[color-mix(in_srgb,var(--warn)_20%,transparent)]",
    autonomous: "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok border-[color-mix(in_srgb,var(--ok)_20%,transparent)]",
  };

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-[var(--fg2)] uppercase tracking-wider">
        AI Learning by Team Member
      </h2>

      {entries.length === 0 ? (
        <div className="wf-soft p-6 text-center">
          <p className="text-sm text-[var(--fg3)]">No AI assistants have been created yet.</p>
        </div>
      ) : (
        <div className="wf-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-[var(--fg3)] uppercase tracking-wider border-b border-border">
                <th className="text-left px-4 py-3 font-medium">AI Assistant</th>
                <th className="text-left px-4 py-3 font-medium">Owner</th>
                <th className="text-left px-4 py-3 font-medium">Department</th>
                <th className="text-center px-4 py-3 font-medium">Tasks (S / N / A)</th>
                <th className="text-left px-4 py-3 font-medium">Top Task</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-3 text-[var(--fg2)]">{e.name}</td>
                  <td className="px-4 py-3 text-[var(--fg2)]">{e.ownerName}</td>
                  <td className="px-4 py-3 text-[var(--fg2)]">{e.department}</td>
                  <td className="px-4 py-3 text-center text-[var(--fg2)]">
                    {e.counts.supervised} / {e.counts.notify} / {e.counts.autonomous}
                  </td>
                  <td className="px-4 py-3">
                    {e.topTask ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[var(--fg2)]">{e.topTask.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${LEVEL_COLORS[e.topTask.level] ?? LEVEL_COLORS.supervised}`}>
                          {e.topTask.level}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[var(--fg3)]">No tasks yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
