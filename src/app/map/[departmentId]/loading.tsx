import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/skeletons/skeleton";

export default function DepartmentLoading() {
  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Back link */}
        <Skeleton className="h-4 w-28" />
        {/* Department header */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        {/* Members section */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-20" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#161616", border: "1px solid #222" }}>
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
          ))}
        </div>
        {/* Documents section */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    </AppShell>
  );
}
