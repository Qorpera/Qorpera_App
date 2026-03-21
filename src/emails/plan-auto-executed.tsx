import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface PlanAutoExecutedEmailProps {
  planTitle: string;
  stepsCompleted: number;
  source: string;
  summary: string;
  viewUrl: string;
}

export function PlanAutoExecutedEmail({
  planTitle,
  stepsCompleted,
  source,
  summary,
  viewUrl,
}: PlanAutoExecutedEmailProps) {
  return (
    <BaseLayout previewText={`Auto-executed: ${planTitle}`}>
      <Section>
        <Text style={heading}>A plan was automatically executed</Text>
        <Text style={label}>Plan</Text>
        <Text style={value}>{planTitle}</Text>
        <Text style={label}>Steps Completed</Text>
        <Text style={value}>{stepsCompleted}</Text>
        <Text style={label}>Source</Text>
        <Text style={value}>{source}</Text>
        <Text style={label}>Summary</Text>
        <Text style={value}>{summary}</Text>
      </Section>
      <Section>
        <Button href={viewUrl}>View Results</Button>
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
