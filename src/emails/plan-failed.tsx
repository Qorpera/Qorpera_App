import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface PlanFailedEmailProps {
  planTitle: string;
  failureReason: string;
  source: string;
  viewUrl: string;
  isLoopBreaker?: boolean;
}

export function PlanFailedEmail({
  planTitle,
  failureReason,
  source,
  viewUrl,
  isLoopBreaker,
}: PlanFailedEmailProps) {
  return (
    <BaseLayout previewText={`Plan failed: ${planTitle}`}>
      <Section>
        <Text style={heading}>A plan has failed</Text>
        <Text style={label}>Plan</Text>
        <Text style={value}>{planTitle}</Text>
        <Text style={label}>Source</Text>
        <Text style={value}>{source}</Text>
        <Text style={label}>Failure Reason</Text>
        <Text style={value}>{failureReason}</Text>
        {isLoopBreaker && (
          <Text style={warning}>
            Execution was stopped because the plan exceeded the maximum step
            execution limit.
          </Text>
        )}
      </Section>
      <Section>
        <Button href={viewUrl}>View Plan</Button>
      </Section>
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

const warning: React.CSSProperties = {
  fontSize: "14px",
  color: "#b45309",
  backgroundColor: "#fef3c7",
  padding: "12px 16px",
  borderRadius: "6px",
  margin: "12px 0 0",
  lineHeight: "1.5",
};
