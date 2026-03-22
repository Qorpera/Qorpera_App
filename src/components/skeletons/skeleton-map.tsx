import { Skeleton } from "./skeleton";

export function SkeletonMap() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-36 mb-1.5" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>
      {/* Map area */}
      <div className="relative" style={{ minHeight: 400 }}>
        <Skeleton className="h-24 w-48 mx-auto mb-8 rounded-lg" />
        <div className="flex justify-center gap-6 flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-36 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
