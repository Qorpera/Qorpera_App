import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/skeletons/skeleton";

export default function GovernanceLoading() {
  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <Skeleton className="h-7 w-28" />
        {/* Trust gradient */}
        <div className="p-4 rounded-lg" style={{ background: "#161616", border: "1px solid #222" }}>
          <Skeleton className="h-4 w-28 mb-3" />
          <Skeleton className="h-8 w-full rounded" />
        </div>
        {/* Rules */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
        {/* Goals */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-14" />
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
