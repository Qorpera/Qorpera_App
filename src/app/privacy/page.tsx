import { getLocale } from "next-intl/server";
import { QorperaLogo } from "@/components/qorpera-logo";

export default async function PrivacyPage() {
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
            <p className="text-sm text-warn">Privatlivspolitik — Dansk version under udarbejdelse. Kontakt os på support@qorpera.com for spørgsmål.</p>
          </div>
        ) : (
        <>
        <h1 className="text-2xl font-medium text-foreground mb-2">Privacy Policy — Qorpera ApS</h1>
        <p className="text-sm text-[var(--fg2)] mb-8">Last updated: March 21, 2026</p>

        <div className="rounded-lg border border-border bg-hover px-5 py-4 mb-8">
          <p className="text-sm text-warn">[PLACEHOLDER — Full legal review pending before production launch]</p>
        </div>

        <p className="mb-6 text-sm leading-relaxed">Data Controller: Qorpera ApS, Denmark</p>

        <h2 className="text-lg font-medium text-foreground mt-8 mb-3">What data we collect</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-[var(--fg2)] leading-relaxed">
          <li>Account information (name, email, role)</li>
          <li>Connected service data (emails, calendar events, CRM records, documents via OAuth integrations)</li>
          <li>Activity data (usage patterns, interaction signals across connected services)</li>
          <li>AI-generated content (reasoning outputs, operational insights, action proposals)</li>
        </ul>

        <h2 className="text-lg font-medium text-foreground mt-8 mb-3">How we use it</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-[var(--fg2)] leading-relaxed">
          <li>Operating the Qorpera decision intelligence platform</li>
          <li>AI-powered situation detection, reasoning, and action proposals</li>
          <li>Generating operational insights and organizational knowledge</li>
          <li>Sending notifications and transactional emails</li>
        </ul>

        <p className="mt-6 text-sm leading-relaxed"><strong className="text-foreground">Legal basis:</strong> Legitimate interest (business operations optimization) and contract performance.</p>

        <p className="mt-4 text-sm leading-relaxed"><strong className="text-foreground">Data storage:</strong> EU region (Neon PostgreSQL, Vercel EU). AI processing via OpenAI and Anthropic APIs (data processing agreements in place).</p>

        <p className="mt-4 text-sm leading-relaxed"><strong className="text-foreground">Data retention:</strong> Active account data retained while account is active. Deleted within 48 hours of deletion request per GDPR Article 17.</p>

        <h2 className="text-lg font-medium text-foreground mt-8 mb-3">Your rights under GDPR</h2>
        <ul className="list-disc list-inside space-y-2 text-sm text-[var(--fg2)] leading-relaxed">
          <li>Right of access (Article 15)</li>
          <li>Right to rectification (Article 16)</li>
          <li>Right to erasure (Article 17) — request via Settings or contact privacy@qorpera.com</li>
          <li>Right to data portability (Article 20) — export via Settings</li>
          <li>Right to restriction of processing (Article 18)</li>
          <li>Right to object (Article 21)</li>
        </ul>

        <h2 className="text-lg font-medium text-foreground mt-8 mb-3">Sub-processors</h2>
        <p className="text-sm text-[var(--fg2)] leading-relaxed">Vercel (hosting), Neon (database), OpenAI (AI reasoning), Anthropic (AI reasoning), Resend (email delivery), Stripe (billing).</p>

        <p className="mt-6 text-sm text-[var(--fg2)]">Contact DPO: privacy@qorpera.com</p>
        <p className="text-sm text-[var(--fg2)]">Supervisory authority: Datatilsynet (Danish Data Protection Agency)</p>
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
