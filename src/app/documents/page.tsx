"use client";

import { AppShell } from "@/components/app-shell";

export default function DocumentsPage() {
  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-white/90">Documents</h1>
        <div className="wf-soft p-10 text-center">
          <svg className="w-12 h-12 text-white/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-white/40">
            Upload internal documents — org charts, team rosters, process docs, escalation guides — to help the AI understand your business. Coming soon.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
