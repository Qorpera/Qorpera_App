import { Skeleton } from "./skeleton";

export function SkeletonAccount() {
  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      {/* Role + org */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      {/* AI assistant */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
      {/* Connected accounts */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 rounded-lg" style={{ background: "#161616", border: "1px solid #222" }}>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded" />
              <div className="space-y-1">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-2.5 w-40" />
              </div>
            </div>
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
