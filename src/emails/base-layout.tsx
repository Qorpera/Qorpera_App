import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Text,
  Hr,
} from "@react-email/components";
import * as React from "react";

interface BaseLayoutProps {
  previewText?: string;
  children: React.ReactNode;
}

export function BaseLayout({ previewText, children }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      {previewText && <Preview>{previewText}</Preview>}
      <Body style={body}>
        <Container style={container}>
          {/* Header */}
          <Text style={logo}>Qorpera</Text>
          <Hr style={divider} />

          {/* Content */}
          {children}

          {/* Footer */}
          <Hr style={divider} />
          <Text style={footer}>
            Qorpera — Operational Intelligence for Leadership
          </Text>
          <Text style={footerSmall}>
            You can manage your notification preferences in Settings.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f6f6f6",
  fontFamily:
    "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "32px 24px",
  maxWidth: "580px",
  borderRadius: "8px",
};

const logo: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 600,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
  margin: "0 0 8px",
};

const divider: React.CSSProperties = {
  borderColor: "#e5e5e5",
  margin: "24px 0",
};

const footer: React.CSSProperties = {
  color: "#666666",
  fontSize: "13px",
  margin: "0 0 4px",
};

const footerSmall: React.CSSProperties = {
  color: "#999999",
  fontSize: "11px",
  margin: "0",
};
