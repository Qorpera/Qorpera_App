import { AppShell } from "@/components/app-shell";
import { getOperatorId } from "@/lib/auth";
import { getEntityCounts } from "@/lib/entity-model-store";
import { getPendingProposalCount } from "@/lib/action-executor";
import { listAuditEntries } from "@/lib/audit-logger";
import { formatRelative } from "@/lib/format";

export default async function DashboardPage() {
  const operatorId = await getOperatorId();

  const [counts, pendingApprovals, auditResult] = await Promise.all([
    getEntityCounts(operatorId),
    getPendingProposalCount(operatorId),
    listAuditEntries(operatorId, { limit: 10 }),
  ]);

  const stats = [
    {
      label: "Total Entities",
      value: counts.totalEntities,
      icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
    },
    {
      label: "Entity Types",
      value: counts.totalTypes,
      icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
    },
    {
      label: "Relationships",
      value: counts.totalRelationships,
      icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
    },
    {
      label: "Pending Approvals",
      value: pendingApprovals,
      icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    },
  ];

  const outcomeColor: Record<string, string> = {
    success: "text-emerald-400",
    denied: "text-red-400",
    error: "text-red-400",
    proposal_created: "text-amber-400",
  };

  return (
    <AppShell pendingApprovals={pendingApprovals}>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        {/* Page title */}
        <h1 className="text-2xl font-semibold text-white/90">Dashboard</h1>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="wf-soft p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-semibold text-white/90">
                  {stat.value.toLocaleString()}
                </span>
                <svg
                  className="w-5 h-5 text-white/20"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={stat.icon}
                  />
                </svg>
              </div>
              <span className="text-sm text-white/50">{stat.label}</span>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <section>
          <h2 className="text-lg font-medium text-white/80 mb-4">
            Recent Activity
          </h2>
          {auditResult.entries.length === 0 ? (
            <p className="text-sm text-white/40">No activity yet.</p>
          ) : (
            <div className="wf-soft divide-y divide-white/[0.06]">
              {auditResult.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-xs font-medium ${outcomeColor[entry.outcome] ?? "text-white/50"}`}
                    >
                      {entry.outcome}
                    </span>
                    <span className="text-sm text-white/70 truncate">
                      {entry.action}
                    </span>
                    {entry.entityTypeSlug && (
                      <span className="text-xs text-white/30">
                        {entry.entityTypeSlug}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-white/30 shrink-0 ml-4">
                    {formatRelative(entry.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recommendations placeholder */}
        <section>
          <h2 className="text-lg font-medium text-white/80 mb-4">
            Recommendations
          </h2>
          <div className="wf-soft p-6 text-center">
            <p className="text-sm text-white/40">
              No recommendations yet. As you add data, the AI co-pilot will
              suggest improvements and actions here.
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
