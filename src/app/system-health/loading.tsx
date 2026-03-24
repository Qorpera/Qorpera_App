export default function SystemHealthLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-skeleton rounded-lg p-6 animate-pulse">
        <div className="h-6 w-48 bg-skeleton rounded mb-2" />
        <div className="h-4 w-32 bg-skeleton rounded" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-skeleton rounded-lg p-6 animate-pulse">
          <div className="h-5 w-40 bg-skeleton rounded mb-4" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-skeleton rounded" />
            <div className="h-4 w-3/4 bg-skeleton rounded" />
            <div className="h-4 w-1/2 bg-skeleton rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
