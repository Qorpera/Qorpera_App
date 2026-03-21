import {
  Section as EmailSection,
  Text,
} from "@react-email/components";
import * as React from "react";

interface SectionProps {
  title?: string;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <EmailSection style={section}>
      {title && <Text style={heading}>{title}</Text>}
      {children}
    </EmailSection>
  );
}

const section: React.CSSProperties = {
  margin: "16px 0",
};

const heading: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "#0a0a0a",
  margin: "0 0 8px",
};
