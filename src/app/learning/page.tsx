"use client";

import { useEffect, useState, useCallback } from "react";
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

interface DeptData {
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
  departmentName: string | null;
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

function daysAgo(dateStr: string): string {
  const d = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

const OUTCOME_COLORS: Record<string, string> = {
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#6b7280",
  unknown: "rgba(255,255,255,0.15)",
};

const AUTONOMY_COLORS: Record<string, string> = {
  supervised: "#a855f7",
  notify: "#f59e0b",
  autonomous: "#22c55e",
};

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: "rgba(15,20,25,0.95)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "rgba(255,255,255,0.5)" },
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LearningPage() {
  const [period, setPeriod] = useState(30);
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [departments, setDepartments] = useState<DeptData[]>([]);
  const [feedbackImpact, setFeedbackImpact] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [typeDetail, setTypeDetail] = useState<TypeDetail | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = `days=${period}`;
    Promise.all([
      fetch(`/api/learning/overview?${params}`).then((r) => r.json()),
      fetch(`/api/learning/departments?${params}`).then((r) => r.json()),
      fetch(`/api/learning/feedback-impact?${params}`).then((r) => r.json()),
    ]).then(([ov, dept, fb]) => {
      setOverview(ov);
      setDepartments(dept.departments ?? []);
      setFeedbackImpact(fb);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [period]);

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
  const filteredDepts = departmentFilter
    ? departments.filter((d) => d.id === departmentFilter)
    : departments;

  const allSituationTypes = filteredDepts.flatMap((d) =>
    d.situationTypes.map((st) => ({ ...st, departmentName: d.name, departmentId: d.id })),
  ).sort((a, b) => b.count - a.count);

  const filteredFeedback = feedbackImpact
    ? departmentFilter
      ? {
          ...feedbackImpact,
          recentFeedback: feedbackImpact.recentFeedback.filter((f) => {
            const dept = departments.find((d) => d.id === departmentFilter);
            return dept && f.departmentName === dept.name;
          }),
        }
      : feedbackImpact
    : null;

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 sticky top-0 z-10 bg-[rgba(8,12,16,0.95)] py-3 -mt-3 backdrop-blur-sm">
          <h1 className="text-2xl font-semibold text-white/90">Learning</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="wf-soft px-3 py-1.5 text-sm text-white/70 bg-transparent border-0 outline-none cursor-pointer"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <select
              value={departmentFilter ?? ""}
              onChange={(e) => setDepartmentFilter(e.target.value || null)}
              className="wf-soft px-3 py-1.5 text-sm text-white/70 bg-transparent border-0 outline-none cursor-pointer"
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
              className="wf-soft px-3 py-1.5 text-sm text-white/60 hover:text-white/90 transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Panel 1: Overview */}
            <OverviewPanel overview={overview} />

            {/* Panel 2: Department Breakdown */}
            <DepartmentTable
              departments={filteredDepts}
              onSelectDepartment={setDepartmentFilter}
              activeDepartment={departmentFilter}
            />

            {/* Panel 3: Situation Types */}
            <SituationTypesPanel
              situationTypes={allSituationTypes}
              expandedType={expandedType}
              typeDetail={typeDetail}
              onExpandType={expandType}
            />

            {/* Panel 4: Feedback Impact */}
            <FeedbackPanel feedback={filteredFeedback} />
          </>
        )}
      </div>
    </AppShell>
  );
}

// ── Panel 1: Overview ────────────────────────────────────────────────────────

function OverviewPanel({ overview }: { overview: OverviewData | null }) {
  if (!overview) return null;

  const metrics = [
    { label: "Detected", value: overview.totalDetected },
    { label: "Approved", value: overview.totalApproved },
    { label: "Rejected", value: overview.totalRejected },
    { label: "Approval Rate", value: pct(overview.overallApprovalRate) },
    { label: "Auto-Resolved", value: overview.totalAutoResolved },
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
      <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider">Overview</h2>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="wf-soft p-4">
            <div className="text-2xl font-semibold text-white/90">{m.value}</div>
            <div className="text-xs text-white/40 mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Approval Rate Over Time */}
        <div className="wf-soft p-4 flex-1 lg:w-[60%]">
          <h3 className="text-xs text-white/40 mb-3">Approval Rate Over Time</h3>
          {hasChartData ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={overview.approvalRateOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip
                  {...CHART_TOOLTIP_STYLE}
                  formatter={(v) => [`${(Number(v) * 100).toFixed(1)}%`, "Approval Rate"]}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={{ fill: "#a855f7", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-sm text-white/25">
              Not enough data yet
            </div>
          )}
        </div>

        {/* Outcome Distribution */}
        <div className="wf-soft p-4 lg:w-[40%]">
          <h3 className="text-xs text-white/40 mb-3">Outcome Distribution</h3>
          {hasOutcomeData ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={outcomeData} layout="vertical">
                <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
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
            <div className="flex items-center justify-center h-[200px] text-sm text-white/25">
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
  departments,
  onSelectDepartment,
  activeDepartment,
}: {
  departments: DeptData[];
  onSelectDepartment: (id: string | null) => void;
  activeDepartment: string | null;
}) {
  if (departments.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider">
          Department Breakdown
        </h2>
        <div className="wf-soft p-8 text-center text-sm text-white/30">
          Complete onboarding to see department breakdown
        </div>
      </section>
    );
  }

  const sorted = [...departments].sort((a, b) => b.situationCount - a.situationCount);

  function highestAutonomy(dept: DeptData): string {
    const levels = dept.situationTypes.map((st) => st.autonomyLevel);
    if (levels.includes("autonomous")) return "autonomous";
    if (levels.includes("notify")) return "notify";
    return "supervised";
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider">
          Department Breakdown
        </h2>
        {activeDepartment && (
          <button
            onClick={() => onSelectDepartment(null)}
            className="text-xs text-purple-400 hover:text-purple-300"
          >
            Clear filter
          </button>
        )}
      </div>
      <div className="wf-soft overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-white/30 text-xs border-b border-white/5">
              <th className="text-left py-3 px-4 font-medium">Department</th>
              <th className="text-right py-3 px-4 font-medium">Situations</th>
              <th className="text-right py-3 px-4 font-medium">Approval Rate</th>
              <th className="text-right py-3 px-4 font-medium">Situation Types</th>
              <th className="text-right py-3 px-4 font-medium">Top Autonomy</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((dept) => {
              const top = highestAutonomy(dept);
              const isActive = activeDepartment === dept.id;
              return (
                <tr
                  key={dept.id ?? "unscoped"}
                  onClick={() => dept.id && onSelectDepartment(isActive ? null : dept.id)}
                  className={`border-b border-white/5 transition-colors ${
                    dept.id ? "cursor-pointer hover:bg-white/[0.02]" : ""
                  } ${isActive ? "bg-purple-500/5" : ""}`}
                >
                  <td className="py-3 px-4 text-white/80">{dept.name}</td>
                  <td className="py-3 px-4 text-right text-white/60">{dept.situationCount}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500/60 rounded-full"
                          style={{ width: `${dept.approvalRate * 100}%` }}
                        />
                      </div>
                      <span className="text-white/60 w-10 text-right">
                        {pct(dept.approvalRate)}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-white/60">
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
}: {
  situationTypes: Array<{
    id: string;
    name: string;
    autonomyLevel: string;
    count: number;
    departmentName: string;
    departmentId: string | null;
  }>;
  expandedType: string | null;
  typeDetail: TypeDetail | null;
  onExpandType: (id: string) => void;
}) {
  if (situationTypes.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider">
          Situation Types
        </h2>
        <div className="wf-soft p-8 text-center text-sm text-white/30">
          No situation types created yet. Complete orientation to teach the AI what to watch for.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider">
        Situation Types
      </h2>
      <div className="space-y-3">
        {situationTypes.map((st) => (
          <SituationTypeCard
            key={st.id}
            st={st}
            isExpanded={expandedType === st.id}
            detail={expandedType === st.id ? typeDetail : null}
            onToggle={() => onExpandType(st.id)}
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
}: {
  st: {
    id: string;
    name: string;
    autonomyLevel: string;
    count: number;
    departmentName: string;
  };
  isExpanded: boolean;
  detail: TypeDetail | null;
  onToggle: () => void;
}) {
  const autonomyColor = AUTONOMY_COLORS[st.autonomyLevel] ?? AUTONOMY_COLORS.supervised;

  return (
    <div className="wf-soft overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-4 text-left hover:bg-white/[0.01] transition-colors"
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-white/90 font-medium">{st.name}</span>
            <span className="text-xs text-white/30">{st.departmentName}</span>
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
            <div className="flex items-center gap-4 text-xs text-white/50 mb-2">
              <span>{detail.metrics.totalProposed} proposed</span>
              <span>{detail.metrics.totalApproved} approved</span>
              <span>{detail.metrics.totalRejected} rejected</span>
              <span className="text-white/70">{pct(detail.metrics.approvalRate)} rate</span>
              <span>{detail.metrics.consecutiveApprovals} consecutive</span>
            </div>

            {/* Approval rate bar */}
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-purple-500/60 rounded-full transition-all"
                style={{ width: `${detail.metrics.approvalRate * 100}%` }}
              />
            </div>

            {/* Outcome + confidence */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1">
                <span className="text-white/30">Outcomes:</span>
                {Object.entries(detail.outcomeDistribution)
                  .filter(([, v]) => v > 0)
                  .map(([key, val]) => (
                    <span key={key} className="flex items-center gap-0.5">
                      <span
                        className="inline-block w-2 h-2 rounded-sm"
                        style={{ background: OUTCOME_COLORS[key] }}
                      />
                      <span className="text-white/40">
                        {val} {key}
                      </span>
                    </span>
                  ))}
              </div>
              <span className="text-white/40">
                Avg confidence: {detail.metrics.avgConfidence.toFixed(2)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4 text-xs text-white/50">
            <span>{st.count} situations</span>
          </div>
        )}
      </button>

      {/* Expanded section */}
      {isExpanded && (
        <div className="border-t border-white/5 p-4 space-y-4">
          {!detail ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Mini approval rate chart */}
              {detail.approvalRateOverTime.length > 0 && (
                <div>
                  <h4 className="text-xs text-white/30 mb-2">Approval Trend</h4>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={detail.approvalRateOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
                        tickFormatter={(v: string) => v.slice(5)}
                      />
                      <YAxis
                        domain={[0, 1]}
                        tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }}
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
                        stroke="#a855f7"
                        strokeWidth={1.5}
                        dot={{ fill: "#a855f7", r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Recent feedback */}
              {detail.recentFeedback.length > 0 ? (
                <div>
                  <h4 className="text-xs text-white/30 mb-2">Recent Feedback</h4>
                  <div className="space-y-2">
                    {detail.recentFeedback.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-start gap-2 text-xs text-white/50"
                      >
                        {f.feedbackCategory && (
                          <span className="text-amber-400/70 shrink-0">
                            [{f.feedbackCategory.replace(/_/g, " ")}]
                          </span>
                        )}
                        <span className="text-white/60">
                          &quot;{f.feedback}&quot;
                        </span>
                        <span className="text-white/20 shrink-0 ml-auto">
                          {daysAgo(f.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-white/20">No feedback yet for this type.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel 4: Feedback Impact ─────────────────────────────────────────────────

function FeedbackPanel({ feedback }: { feedback: FeedbackData | null }) {
  if (!feedback) return null;

  if (feedback.recentFeedback.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider">
          Your Teaching
        </h2>
        <div className="wf-soft p-8 text-center text-sm text-white/30">
          No feedback given yet. Approve, reject, or teach on situations to help the AI learn.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-white/40 uppercase tracking-wider">
        Your Teaching
      </h2>
      <p className="text-xs text-white/30">
        Recent feedback and its impact on AI performance:
      </p>

      <div className="space-y-3">
        {feedback.recentFeedback.map((f) => (
          <div key={f.id} className="wf-soft p-4 space-y-2">
            <p className="text-sm text-white/80">
              &quot;{f.feedback}&quot;
            </p>
            <div className="flex items-center gap-2 text-xs text-white/40 flex-wrap">
              <span>{f.situationTypeName}</span>
              {f.departmentName && (
                <>
                  <span className="text-white/15">&#x2022;</span>
                  <span>{f.departmentName}</span>
                </>
              )}
              {f.feedbackCategory && (
                <>
                  <span className="text-white/15">&#x2022;</span>
                  <span>{f.feedbackCategory.replace(/_/g, " ")}</span>
                </>
              )}
              <span className="text-white/15">&#x2022;</span>
              <span>{daysAgo(f.createdAt)}</span>
            </div>

            {/* Before/After comparison */}
            <div className="flex items-center gap-2 text-xs">
              {f.approvalRateBefore !== null && (
                <span className="text-white/40">
                  Before: {pct(f.approvalRateBefore)}
                </span>
              )}
              {f.approvalRateBefore !== null && f.approvalRateAfter !== null && (
                <span className="text-white/20">&rarr;</span>
              )}
              {f.approvalRateAfter !== null && (
                <span className="text-white/40">
                  After: {pct(f.approvalRateAfter)}
                </span>
              )}
              {f.likelyLearned ? (
                <span className="text-green-400 ml-1">&#x2713; Improved</span>
              ) : f.approvalRateBefore !== null && f.approvalRateAfter !== null ? (
                <span className="text-white/25 ml-1">&mdash; No clear impact yet</span>
              ) : (
                <span className="text-white/25 ml-1">Not enough data to compare</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Theme summary */}
      {feedback.feedbackThemeSummary && (
        <div className="wf-soft p-4">
          <h3 className="text-xs text-white/30 mb-2">Feedback Themes</h3>
          <p className="text-sm text-white/50">{feedback.feedbackThemeSummary}</p>
        </div>
      )}
    </section>
  );
}
