import * as React from "react";
import { Text, Link } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Section } from "./components/Section";

interface DigestNotification {
  type: string;
  title: string;
  summary: string;
  viewUrl: string;
  createdAt: string;
}

interface WeeklyDigestEmailProps {
  userName: string;
  notifications: DigestNotification[];
  periodStart: string;
  periodEnd: string;
}

function groupByType(
  notifications: DigestNotification[]
): Record<string, DigestNotification[]> {
  const groups: Record<string, DigestNotification[]> = {};
  for (const n of notifications) {
    if (!groups[n.type]) {
      groups[n.type] = [];
    }
    groups[n.type].push(n);
  }
  return groups;
}

export function WeeklyDigestEmail({
  userName,
  notifications,
  periodStart,
  periodEnd,
}: WeeklyDigestEmailProps) {
  const grouped = groupByType(notifications);
  const typeNames = Object.keys(grouped);

  return (
    <BaseLayout previewText={`Your digest: ${periodStart} — ${periodEnd}`}>
      <Section>
        <Text style={heading}>Weekly Digest</Text>
        <Text style={paragraph}>
          Hi {userName}, here's your digest for {periodStart} — {periodEnd}.
        </Text>
      </Section>

      {typeNames.map((type) => {
        const items = grouped[type];
        return (
          <Section key={type} title={`${type} (${items.length})`}>
            {items.map((item, idx) => (
              <Text key={idx} style={notificationRow}>
                <Link href={item.viewUrl} style={notificationTitle}>
                  {item.title}
                </Link>
                {" — "}
                {item.summary}
              </Text>
            ))}
          </Section>
        );
      })}

      <Section>
        <Text style={statsText}>
          Total notifications this period: {notifications.length}
        </Text>
      </Section>
    </BaseLayout>
  );
}

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#0a0a0a",
  margin: "0 0 12px",
};

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#333333",
  margin: "0 0 12px",
};

const notificationRow: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#333333",
  margin: "0 0 8px",
};

const notificationTitle: React.CSSProperties = {
  color: "#7c3aed",
  fontWeight: 500,
  textDecoration: "none",
};

const statsText: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#666666",
  margin: "0",
  paddingTop: "8px",
  borderTop: "1px solid #e5e5e5",
};
