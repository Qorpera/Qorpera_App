export default function SystemHealthLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-white/[0.06] rounded-lg p-6 animate-pulse">
        <div className="h-6 w-48 bg-white/[0.06] rounded mb-2" />
        <div className="h-4 w-32 bg-white/[0.06] rounded" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white/[0.06] rounded-lg p-6 animate-pulse">
          <div className="h-5 w-40 bg-white/[0.06] rounded mb-4" />
          <div className="space-y-3">
            <div className="h-4 w-full bg-white/[0.06] rounded" />
            <div className="h-4 w-3/4 bg-white/[0.06] rounded" />
            <div className="h-4 w-1/2 bg-white/[0.06] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
