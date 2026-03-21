import { Text } from "@react-email/components";
import * as React from "react";

import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface GenericNotificationProps {
  content: string;
  viewUrl?: string;
}

export function GenericNotificationEmail({
  content,
  viewUrl,
}: GenericNotificationProps) {
  return (
    <BaseLayout previewText={content}>
      <Section>
        <Text style={paragraph}>{content}</Text>
      </Section>
      {viewUrl && (
        <Section>
          <Button href={viewUrl}>View in Qorpera</Button>
        </Section>
      )}
    </BaseLayout>
  );
}

const paragraph: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "24px",
  color: "#333333",
  margin: "0",
};
