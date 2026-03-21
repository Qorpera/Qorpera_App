import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface SituationProposedEmailProps {
  situationTitle: string;
  entityName: string;
  summary: string;
  viewUrl: string;
}

export function SituationProposedEmail({
  situationTitle,
  entityName,
  summary,
  viewUrl,
}: SituationProposedEmailProps) {
  return (
    <BaseLayout previewText={`New situation: ${situationTitle}`}>
      <Section>
        <Text style={heading}>A new situation has been detected</Text>
        <Text style={label}>Situation</Text>
        <Text style={value}>{situationTitle}</Text>
        <Text style={label}>Entity</Text>
        <Text style={value}>{entityName}</Text>
        <Text style={label}>Summary</Text>
        <Text style={value}>{summary}</Text>
      </Section>
      <Section>
        <Button href={viewUrl}>Review in Qorpera</Button>
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
