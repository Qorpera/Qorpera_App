import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface StepReadyEmailProps {
  stepTitle: string;
  planSource: string;
  description: string;
  viewUrl: string;
}

export function StepReadyEmail({
  stepTitle,
  planSource,
  description,
  viewUrl,
}: StepReadyEmailProps) {
  return (
    <BaseLayout previewText={`Action needed: ${stepTitle}`}>
      <Section>
        <Text style={heading}>An execution step needs your attention</Text>
        <Text style={label}>Step</Text>
        <Text style={value}>{stepTitle}</Text>
        <Text style={label}>Plan</Text>
        <Text style={value}>{planSource}</Text>
        <Text style={label}>Description</Text>
        <Text style={value}>{description}</Text>
      </Section>
      <Section>
        <Button href={viewUrl}>View Step</Button>
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
