import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface SystemAlertEmailProps {
  alertTitle: string;
  message: string;
  severity: string;
  viewUrl?: string;
}

export function SystemAlertEmail({
  alertTitle,
  message,
  severity,
  viewUrl,
}: SystemAlertEmailProps) {
  return (
    <BaseLayout previewText={`[${severity}] ${alertTitle}`}>
      <Section>
        <Text style={heading}>System Alert</Text>
        <Text style={label}>Alert</Text>
        <Text style={value}>{alertTitle}</Text>
        <Text style={label}>Severity</Text>
        <Text style={severityBadge}>{severity.toUpperCase()}</Text>
        <Text style={label}>Message</Text>
        <Text style={value}>{message}</Text>
      </Section>
      {viewUrl && (
        <Section>
          <Button href={viewUrl}>View Details</Button>
        </Section>
      )}
    </BaseLayout>
  );
}

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#0a0a0a",
  margin: "0 0 16px",
};

const label: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "#666666",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "12px 0 2px",
};

const value: React.CSSProperties = {
  fontSize: "15px",
  color: "#1a1a1a",
  margin: "0 0 4px",
  lineHeight: "1.5",
};

const severityBadge: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#991b1b",
  backgroundColor: "#fee2e2",
  padding: "4px 10px",
  borderRadius: "4px",
  margin: "4px 0",
  display: "inline-block",
  letterSpacing: "0.05em",
};
