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

export function TicketReplyPreview({ step }: PreviewProps) {
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
    <div className="rounded-md overflow-hidden" style={{ border: "1px solid #2a2a2a", background: "#141414" }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid #222", background: "#181818" }}>
        <TicketIcon size={14} className="text-purple-400 flex-shrink-0" />
        <span style={{ fontSize: 12, fontWeight: 500, color: "#b0b0b0" }}>{t("ticketReply")}</span>
        {/* Internal / Public badge */}
        {!isStatusChange && !isTagAction && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            borderRadius: 3,
            background: isInternal ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)",
            color: isInternal ? "#f59e0b" : "#22c55e",
            marginLeft: "auto",
          }}>
            {isInternal ? t("internalNote") : t("publicReply")}
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Ticket reference */}
        {refLabel && (
          <div>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#b0b0b0", background: "rgba(168,85,247,0.08)", padding: "2px 8px", borderRadius: 3 }}>
              {refLabel}
            </span>
          </div>
        )}

        {/* Status change */}
        {isStatusChange && currentStatus && newStatus && (
          <div>
            <span style={{ fontSize: 11, color: "#585858", fontWeight: 500 }}>{t("statusChange")}</span>
            <div className="flex items-center gap-2 mt-1">
              <span style={{ fontSize: 13, color: "#707070", padding: "2px 8px", borderRadius: 3, background: "rgba(255,255,255,0.04)" }}>
                {currentStatus}
              </span>
              <span style={{ fontSize: 12, color: "#484848" }}>&rarr;</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#22c55e", padding: "2px 8px", borderRadius: 3, background: "rgba(34,197,94,0.08)" }}>
                {newStatus}
              </span>
            </div>
          </div>
        )}

        {/* Tag */}
        {isTagAction && tag && (
          <div>
            <span style={{ fontSize: 11, color: "#585858", fontWeight: 500 }}>{t("tagApplied")}</span>
            <div className="mt-1">
              <span style={{ fontSize: 13, fontWeight: 500, color: "#c084fc", padding: "2px 8px", borderRadius: 3, background: "rgba(168,85,247,0.08)" }}>
                {tag}
              </span>
            </div>
          </div>
        )}

        {/* Message */}
        {message && !isStatusChange && !isTagAction && (
          <div>
            <div
              style={{ fontSize: 13, lineHeight: 1.65, color: "#909090" }}
              dangerouslySetInnerHTML={{ __html: escapeHtml(message).replace(/\n/g, "<br>") }}
            />
          </div>
        )}

        {/* AI Disclosure footer */}
        {showAiDisclosure && (
          <div style={{ borderTop: "1px solid #222", paddingTop: 8, marginTop: 8 }}>
            <p style={{ fontSize: 11, color: "#585858", fontStyle: "italic" }}>
              {t("aiDisclosure")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
