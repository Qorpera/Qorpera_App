export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-sidebar text-foreground px-6">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-[var(--fg3)] mb-4">404</h1>
        <h2 className="text-lg font-semibold text-foreground mb-2">Page not found</h2>
        <p className="text-sm text-[var(--fg2)] mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <a
          href="/map"
          className="px-4 py-2 bg-accent hover:bg-accent text-foreground text-sm rounded-lg transition inline-block"
        >
          Go to Map
        </a>
      </div>
    </div>
  );
}
