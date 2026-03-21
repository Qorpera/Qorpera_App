import { Text } from "@react-email/components";
import * as React from "react";

import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface EmailVerificationProps {
  verifyUrl: string;
  userName: string;
}

export function EmailVerificationEmail({
  verifyUrl,
  userName,
}: EmailVerificationProps) {
  return (
    <BaseLayout previewText="Verify your email to get started">
      <Section>
        <Text style={heading}>
          Hi {userName}, verify your email to get started
        </Text>
        <Text style={paragraph}>
          Please confirm your email address by clicking the button below. This
          helps us keep your account secure.
        </Text>
      </Section>
      <Section>
        <Button href={verifyUrl}>Verify Email</Button>
      </Section>
      <Section>
        <Text style={muted}>
          If you didn't create an account, you can safely ignore this email.
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
