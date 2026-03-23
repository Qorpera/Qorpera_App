import { Skeleton } from "./skeleton";

export function SkeletonChat() {
  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="px-5 py-3 border-b border-border">
        <Skeleton className="h-4 w-16" />
      </div>
      {/* Messages area */}
      <div className="flex-1 p-6 space-y-6 max-w-[720px] mx-auto w-full">
        <div>
          <Skeleton className="h-3 w-8 mb-1.5" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div>
          <Skeleton className="h-3 w-12 mb-1.5" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
        <div>
          <Skeleton className="h-3 w-8 mb-1.5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      {/* Input bar */}
      <div className="border-t border-border px-6 py-4">
        <div className="max-w-[720px] mx-auto flex items-end gap-3">
          <Skeleton className="h-12 flex-1 rounded-xl" />
          <Skeleton className="h-12 w-12 rounded-xl flex-shrink-0" />
        </div>
      </div>
    </div>
  );
}
