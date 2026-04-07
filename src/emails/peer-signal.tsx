import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface PeerSignalEmailProps {
  fromDomain: string;
  toDomain: string;
  signalSummary: string;
  viewUrl: string;
}

export function PeerSignalEmail({
  fromDomain,
  toDomain,
  signalSummary,
  viewUrl,
}: PeerSignalEmailProps) {
  return (
    <BaseLayout
      previewText={`Signal from ${fromDomain} to ${toDomain}`}
    >
      <Section>
        <Text style={heading}>
          Cross-domain signal from {fromDomain}
        </Text>
        <Text style={label}>From</Text>
        <Text style={value}>{fromDomain}</Text>
        <Text style={label}>To</Text>
        <Text style={value}>{toDomain}</Text>
        <Text style={label}>Summary</Text>
        <Text style={value}>{signalSummary}</Text>
      </Section>
      <Section>
        <Button href={viewUrl}>View Signal</Button>
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
