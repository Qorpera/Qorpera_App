import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface FollowUpTriggeredEmailProps {
  followUpTitle: string;
  triggerReason: string;
  originalSituation: string;
  viewUrl: string;
}

export function FollowUpTriggeredEmail({
  followUpTitle,
  triggerReason,
  originalSituation,
  viewUrl,
}: FollowUpTriggeredEmailProps) {
  return (
    <BaseLayout previewText={`Follow-up: ${followUpTitle}`}>
      <Section>
        <Text style={heading}>A follow-up condition has been met</Text>
        <Text style={label}>Follow-up</Text>
        <Text style={value}>{followUpTitle}</Text>
        <Text style={label}>Trigger Reason</Text>
        <Text style={value}>{triggerReason}</Text>
        <Text style={label}>Original Situation</Text>
        <Text style={value}>{originalSituation}</Text>
      </Section>
      <Section>
        <Button href={viewUrl}>View Follow-up</Button>
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
