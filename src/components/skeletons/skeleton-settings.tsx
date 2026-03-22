import { Skeleton } from "./skeleton";

export function SkeletonSettings() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Title */}
      <Skeleton className="h-7 w-28" />
      {/* Tab strip */}
      <div className="flex gap-2 border-b border-white/[0.06] pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded" />
        ))}
      </div>
      {/* Form fields */}
      <div className="space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
