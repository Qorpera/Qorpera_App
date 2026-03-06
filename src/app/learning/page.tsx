"use client";

import { AppShell } from "@/components/app-shell";

export default function LearningPage() {
  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-white/90">Learning</h1>
        <div className="wf-soft p-10 text-center">
          <svg className="w-12 h-12 text-white/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>
          <p className="text-sm text-white/40">
            Learning dashboard coming soon. This will show approval rates, outcome tracking, and autonomy levels.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
