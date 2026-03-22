import { getLocale } from "next-intl/server";
import { QorperaLogo } from "@/components/qorpera-logo";

export default async function TermsPage() {
  const locale = await getLocale();
  return (
    <div className="min-h-screen bg-[#0e1418] text-white/80">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex items-center gap-3 mb-10">
          <QorperaLogo width={28} />
          <span className="font-heading text-lg text-white/90 tracking-[-0.02em]">qorpera</span>
        </div>

        {locale === "da" ? (
          <>
            <h1 className="text-2xl font-medium text-white/90 mb-2">Servicevilkår — Qorpera ApS</h1>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-5 py-4 mb-8 mt-8">
              <p className="text-sm text-amber-400/80">Servicevilkår — Dansk version under udarbejdelse. Kontakt os på support@qorpera.com for spørgsmål.</p>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-medium text-white/90 mb-2">Terms of Service — Qorpera ApS</h1>
            <p className="text-sm text-white/40 mb-8">Last updated: March 21, 2026</p>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-5 py-4 mb-8">
              <p className="text-sm text-amber-400/80">[PLACEHOLDER — Full legal review pending before production launch]</p>
            </div>

            <p className="mb-6 text-sm leading-relaxed">These Terms of Service govern your use of the Qorpera platform.</p>

            <ol className="list-decimal list-inside space-y-4 text-sm leading-relaxed text-white/70">
              <li><strong className="text-white/80">Account Registration</strong> — You must provide accurate information and are responsible for maintaining account security.</li>
              <li><strong className="text-white/80">Acceptable Use</strong> — The platform is for legitimate business operations. You may not use it for unlawful purposes.</li>
              <li><strong className="text-white/80">Connected Services</strong> — You authorize Qorpera to access data from services you connect (Gmail, Slack, CRM, etc.) solely to provide decision intelligence features.</li>
              <li><strong className="text-white/80">AI Operations</strong> — Qorpera&apos;s AI analyzes your business data to detect situations and propose actions. You control the level of AI autonomy.</li>
              <li><strong className="text-white/80">Data Ownership</strong> — You retain ownership of your business data. Qorpera processes it to provide the service.</li>
              <li><strong className="text-white/80">Intellectual Property</strong> — The Qorpera platform, including its AI models and algorithms, is owned by Qorpera ApS.</li>
              <li><strong className="text-white/80">Limitation of Liability</strong> — Qorpera is provided &quot;as is.&quot; We are not liable for decisions made based on AI recommendations.</li>
              <li><strong className="text-white/80">Termination</strong> — Either party may terminate. Upon termination, your data is deleted per our Privacy Policy.</li>
              <li><strong className="text-white/80">Governing Law</strong> — These terms are governed by the laws of Denmark.</li>
            </ol>

            <p className="mt-8 text-sm text-white/40">For questions: legal@qorpera.com</p>
          </>
        )}

        <div className="mt-12 pt-6 border-t border-white/[0.06] text-center text-xs text-white/30">
          <a href="/terms" className="hover:text-white/50">Terms</a>
          {" · "}
          <a href="/privacy" className="hover:text-white/50">Privacy</a>
          {" · "}
          <a href="/dpa" className="hover:text-white/50">DPA</a>
        </div>
      </div>
    </div>
  );
}
