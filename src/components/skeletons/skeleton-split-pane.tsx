import { Skeleton } from "./skeleton";
import { SkeletonList } from "./skeleton-list";

export function SkeletonSplitPane() {
  return (
    <div className="flex h-full">
      {/* List panel */}
      <div className="w-full lg:w-[300px] flex-shrink-0 lg:border-r border-border">
        <div className="px-4 py-3 border-b border-border">
          <Skeleton className="h-5 w-28 mb-1.5" />
          <Skeleton className="h-3 w-44" />
        </div>
        <div className="px-4 py-2 flex gap-1.5 border-b border-border">
          <Skeleton className="h-6 w-14 rounded-full" />
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
        <SkeletonList rows={6} />
      </div>
      {/* Detail panel — hidden on mobile */}
      <div className="hidden lg:block flex-1 p-6 space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-32 w-full mt-4 rounded-lg" />
      </div>
    </div>
  );
}
