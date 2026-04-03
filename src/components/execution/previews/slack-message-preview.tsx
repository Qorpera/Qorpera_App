"use client";

import { useTranslations } from "next-intl";
import type { PreviewProps } from "./get-preview-component";
import { isActMode } from "./get-preview-component";
import { escapeHtml } from "./html-helpers";

function HashIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="4" x2="20" y1="9" y2="9" /><line x1="4" x2="20" y1="15" y2="15" /><line x1="10" x2="8" y1="3" y2="21" /><line x1="16" x2="14" y1="3" y2="21" />
    </svg>
  );
}

function formatSlackText(text: string): string {
  let html = escapeHtml(text);
  // Bold: *text*
  html = html.replace(/\*(.*?)\*/g, "<strong>$1</strong>");
  // Code: `text`
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.06);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>');
  // Newlines
  html = html.replace(/\n/g, "<br>");
  return html;
}

export function SlackMessagePreview({ step, inPanel }: PreviewProps) {
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};

  const channel = (params.channel ?? "") as string;
  const message = (params.message ?? "") as string;
  const showAiPrefix = isActMode(step);

  return (
    <div className={inPanel ? "" : "rounded-md overflow-hidden border border-border bg-surface"}>
      {!inPanel && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
          <HashIcon size={14} className="text-accent flex-shrink-0" />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>Slack</span>
        </div>
      )}

      <div className="px-4 py-3 space-y-2.5">
        {/* Channel */}
        <div className="flex items-baseline gap-2">
          <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 56 }}>{t("channel")}</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", padding: "1px 6px", borderRadius: 3 }}>
            #{channel.replace(/^#/, "")}
          </span>
        </div>

        {/* Message */}
        <div>
          <div
            style={{ fontSize: 13, lineHeight: 1.65, color: "var(--muted)" }}
            dangerouslySetInnerHTML={{
              __html: (showAiPrefix ? `<span style="font-size:12px">${t("aiPrefix")}</span> ` : "") + formatSlackText(message),
            }}
          />
        </div>
      </div>
    </div>
  );
}
