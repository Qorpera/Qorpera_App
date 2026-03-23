import { getLocale } from "next-intl/server";
import { QorperaLogo } from "@/components/qorpera-logo";

export default async function DpaPage() {
  const locale = await getLocale();

  return (
    <div className="min-h-screen bg-sidebar text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-10">
          <QorperaLogo width={28} />
          <span className="font-heading text-lg text-foreground tracking-[-0.02em]">qorpera</span>
        </div>

        {locale === "da" ? (
          <div className="rounded-lg border border-border bg-hover px-5 py-4 mb-8">
            <p className="text-sm text-warn">Databehandleraftale — Dansk version under udarbejdelse. Kontakt os på support@qorpera.com for spørgsmål.</p>
          </div>
        ) : (
        <>
        <h1 className="text-2xl font-medium text-foreground mb-2">Data Processing Agreement — Qorpera ApS</h1>
        <p className="text-sm text-[var(--fg2)] mb-8">Last updated: March 21, 2026</p>

        <div className="rounded-lg border border-border bg-hover px-5 py-4 mb-8">
          <p className="text-sm text-warn">[PLACEHOLDER — Full legal review pending before production launch]</p>
        </div>

        <p className="mb-6 text-sm leading-relaxed">This DPA applies when Qorpera ApS (&quot;Processor&quot;) processes personal data on behalf of the Customer (&quot;Controller&quot;) as part of the Qorpera platform service.</p>

        <ol className="list-decimal list-inside space-y-4 text-sm leading-relaxed text-[var(--fg2)]">
          <li><strong className="text-foreground">Processing purposes</strong> — Qorpera processes personal data solely to provide decision intelligence services as instructed by the Customer.</li>
          <li><strong className="text-foreground">Types of data</strong> — Contact information, business communications, calendar data, CRM records, financial documents, as connected by the Customer.</li>
          <li><strong className="text-foreground">Data subjects</strong> — Customer employees, Customer&apos;s business contacts and clients.</li>
          <li><strong className="text-foreground">Security measures</strong> — AES-256-GCM encryption at rest, TLS 1.3 in transit, role-based access controls, session management, audit logging.</li>
          <li><strong className="text-foreground">Sub-processors</strong> — Vercel (hosting, EU), Neon (database, EU), OpenAI (AI processing), Anthropic (AI processing), Resend (email delivery), Stripe (billing).</li>
          <li><strong className="text-foreground">Data transfers</strong> — Where sub-processors are outside the EU/EEA, Standard Contractual Clauses (SCCs) apply.</li>
          <li><strong className="text-foreground">Breach notification</strong> — Processor will notify Controller within 72 hours of becoming aware of a personal data breach.</li>
          <li><strong className="text-foreground">Audit rights</strong> — Controller may audit Processor&apos;s compliance with this DPA upon reasonable notice.</li>
          <li><strong className="text-foreground">Deletion on termination</strong> — Upon termination, all Customer data is deleted within 48 hours unless retention is required by law.</li>
          <li><strong className="text-foreground">Liability</strong> — As per the main Terms of Service.</li>
        </ol>

        <p className="mt-8 text-sm text-[var(--fg2)]">Contact: dpa@qorpera.com</p>
        </>
        )}

        <div className="mt-12 pt-6 border-t border-border text-center text-xs text-[var(--fg3)]">
          <a href="/terms" className="hover:text-[var(--fg2)]">Terms</a>
          {" · "}
          <a href="/privacy" className="hover:text-[var(--fg2)]">Privacy</a>
          {" · "}
          <a href="/dpa" className="hover:text-[var(--fg2)]">DPA</a>
        </div>
      </div>
    </div>
  );
}
