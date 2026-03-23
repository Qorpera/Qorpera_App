import { Skeleton } from "./skeleton";

export function SkeletonLearning() {
  return (
    <div className="p-6 space-y-6">
      {/* Title */}
      <Skeleton className="h-7 w-24" />
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--elevated)" }}>
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-4 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--elevated)" }}>
          <Skeleton className="h-4 w-28 mb-4" />
          <Skeleton className="h-40 w-full rounded" />
        </div>
        <div className="p-4 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--elevated)" }}>
          <Skeleton className="h-4 w-36 mb-4" />
          <Skeleton className="h-40 w-full rounded" />
        </div>
      </div>
    </div>
  );
}
