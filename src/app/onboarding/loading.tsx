import { Skeleton } from "@/components/skeletons/skeleton";

export default function OnboardingLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0e1418" }}>
      <div className="w-full max-w-lg mx-auto px-6 space-y-8">
        {/* Step indicator */}
        <div className="flex justify-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-2 w-2 rounded-full" />
          ))}
        </div>
        {/* Title */}
        <div className="text-center space-y-2">
          <Skeleton className="h-7 w-64 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </div>
        {/* Form fields */}
        <div className="space-y-4">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        {/* Button */}
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
