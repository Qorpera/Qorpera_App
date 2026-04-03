"use client";

import { useTranslations } from "next-intl";
import type { PreviewProps } from "./get-preview-component";
import { isActMode } from "./get-preview-component";
import { escapeHtml } from "./html-helpers";

function TicketIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2M13 17v2M13 11v2" />
    </svg>
  );
}

const INTERNAL_SLUGS = ["add_internal_note", "add_note"];

export function TicketReplyPreview({ step, inPanel }: PreviewProps) {
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};
  const slug = step.actionCapability?.slug ?? "";

  const ticketId = (params.ticketId ?? params.conversationId ?? "") as string;
  const message = (params.message ?? "") as string;
  const currentStatus = (params.currentStatus ?? "") as string;
  const newStatus = (params.newStatus ?? "") as string;
  const tag = (params.tag ?? "") as string;
  const isInternal = INTERNAL_SLUGS.includes(slug) || params.isInternal === true;

  const isStatusChange = slug === "update_ticket_status";
  const isTagAction = slug === "tag_conversation";
  const isConversation = slug.includes("conversation") || slug === "add_note";
  const showAiDisclosure = isActMode(step);

  // Determine reference label
  const refLabel = ticketId
    ? (isConversation ? t("conversationRef", { id: ticketId }) : t("ticketRef", { id: ticketId }))
    : null;

  return (
    <div className={inPanel ? "" : "rounded-md overflow-hidden border border-border bg-surface"}>
      {!inPanel && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
          <TicketIcon size={14} className="text-accent flex-shrink-0" />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{t("ticketReply")}</span>
          {!isStatusChange && !isTagAction && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 3,
              background: isInternal ? "color-mix(in srgb, var(--warn) 12%, transparent)" : "color-mix(in srgb, var(--ok) 12%, transparent)",
              color: isInternal ? "var(--warn)" : "var(--ok)",
              marginLeft: "auto",
            }}>
              {isInternal ? t("internalNote") : t("publicReply")}
            </span>
          )}
        </div>
      )}

      <div className="px-4 py-3 space-y-2.5">
        {/* Ticket reference */}
        {refLabel && (
          <div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", padding: "2px 8px", borderRadius: 3 }}>
              {refLabel}
            </span>
          </div>
        )}

        {/* Status change */}
        {isStatusChange && currentStatus && newStatus && (
          <div>
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500 }}>{t("statusChange")}</span>
            <div className="flex items-center gap-2 mt-1">
              <span style={{ fontSize: 13, color: "var(--fg2)", padding: "2px 8px", borderRadius: 3, background: "var(--hover)" }}>
                {currentStatus}
              </span>
              <span style={{ fontSize: 12, color: "var(--fg3)" }}>&rarr;</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ok)", padding: "2px 8px", borderRadius: 3, background: "color-mix(in srgb, var(--ok) 8%, transparent)" }}>
                {newStatus}
              </span>
            </div>
          </div>
        )}

        {/* Tag */}
        {isTagAction && tag && (
          <div>
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500 }}>{t("tagApplied")}</span>
            <div className="mt-1">
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", padding: "2px 8px", borderRadius: 3, background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
                {tag}
              </span>
            </div>
          </div>
        )}

        {/* Message */}
        {message && !isStatusChange && !isTagAction && (
          <div>
            <div
              style={{ fontSize: 13, lineHeight: 1.65, color: "var(--muted)" }}
              dangerouslySetInnerHTML={{ __html: escapeHtml(message).replace(/\n/g, "<br>") }}
            />
          </div>
        )}

        {/* AI Disclosure footer */}
        {showAiDisclosure && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
            <p style={{ fontSize: 11, color: "var(--fg2)", fontStyle: "italic" }}>
              {t("aiDisclosure")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
