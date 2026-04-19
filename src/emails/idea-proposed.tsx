import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface IdeaProposedEmailProps {
  ideaTitle: string;
  domainName: string;
  rationale: string;
  viewUrl: string;
}

export function IdeaProposedEmail({
  ideaTitle,
  domainName,
  rationale,
  viewUrl,
}: IdeaProposedEmailProps) {
  return (
    <BaseLayout previewText={`New idea: ${ideaTitle}`}>
      <Section>
        <Text style={heading}>New idea proposed</Text>
        <Text style={label}>Idea</Text>
        <Text style={value}>{ideaTitle}</Text>
        <Text style={label}>Department</Text>
        <Text style={value}>{domainName}</Text>
        <Text style={label}>Rationale</Text>
        <Text style={value}>{rationale}</Text>
      </Section>
      <Section>
        <Button href={viewUrl}>Review Idea</Button>
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
