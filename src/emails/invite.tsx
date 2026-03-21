import { Text } from "@react-email/components";
import * as React from "react";

import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface InviteEmailProps {
  inviterName: string;
  operatorName: string;
  inviteUrl: string;
}

export function InviteEmail({
  inviterName,
  operatorName,
  inviteUrl,
}: InviteEmailProps) {
  return (
    <BaseLayout
      previewText={`${inviterName} invited you to join ${operatorName} on Qorpera`}
    >
      <Section>
        <Text style={heading}>You've been invited</Text>
        <Text style={paragraph}>
          {inviterName} invited you to join <strong>{operatorName}</strong> on
          Qorpera.
        </Text>
        <Text style={paragraph}>
          Click the button below to accept the invitation and set up your
          account.
        </Text>
      </Section>
      <Section>
        <Button href={inviteUrl}>Accept Invitation</Button>
      </Section>
      <Section>
        <Text style={muted}>
          If you weren't expecting this invitation, you can safely ignore this
          email.
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

const muted: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: "20px",
  color: "#888888",
  margin: "0",
};
