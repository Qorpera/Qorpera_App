import { AppShell } from "@/components/app-shell";
import { getOperatorId } from "@/lib/auth";
import { getEntityCounts } from "@/lib/entity-model-store";

export default async function DashboardPage() {
  const operatorId = await getOperatorId();

  const counts = await getEntityCounts(operatorId);

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
  ];

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto space-y-8">
        {/* Page title */}
        <h1 className="text-2xl font-semibold text-white/90">Dashboard</h1>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
      </div>
    </AppShell>
  );
}
