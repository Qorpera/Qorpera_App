import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface SituationResolvedEmailProps {
  situationTitle: string;
  entityName: string;
  resolution: string;
  viewUrl: string;
}

export function SituationResolvedEmail({
  situationTitle,
  entityName,
  resolution,
  viewUrl,
}: SituationResolvedEmailProps) {
  return (
    <BaseLayout previewText={`Resolved: ${situationTitle}`}>
      <Section>
        <Text style={heading}>A situation has been resolved</Text>
        <Text style={label}>Situation</Text>
        <Text style={value}>{situationTitle}</Text>
        <Text style={label}>Entity</Text>
        <Text style={value}>{entityName}</Text>
        <Text style={label}>Resolution</Text>
        <Text style={value}>{resolution}</Text>
      </Section>
      <Section>
        <Button href={viewUrl}>View Details</Button>
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
