"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Onboarding] Error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-6">
      <div className="text-center max-w-md">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] flex items-center justify-center">
          <svg className="w-6 h-6 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h2>
        <p className="text-sm text-[var(--fg2)] mb-1">
          This page encountered an error. You can try reloading.
        </p>
        {error.message && (
          <p className="text-xs text-[var(--fg3)] mb-4 font-mono truncate max-w-full">
            {error.message}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-accent hover:bg-accent text-foreground text-sm rounded-lg transition"
          >
            Try again
          </button>
          <a
            href="/map"
            className="px-4 py-2 bg-hover hover:bg-hover text-[var(--fg2)] text-sm rounded-lg transition"
          >
            Go to Map
          </a>
        </div>
      </div>
    </div>
  );
}
