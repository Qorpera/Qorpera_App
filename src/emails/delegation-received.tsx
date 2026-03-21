import * as React from "react";
import { Text } from "@react-email/components";
import { BaseLayout } from "./base-layout";
import { Button } from "./components/Button";
import { Section } from "./components/Section";

interface DelegationReceivedEmailProps {
  taskTitle: string;
  fromAiName: string;
  description: string;
  dueDate?: string;
  viewUrl: string;
}

export function DelegationReceivedEmail({
  taskTitle,
  fromAiName,
  description,
  dueDate,
  viewUrl,
}: DelegationReceivedEmailProps) {
  return (
    <BaseLayout previewText={`New task: ${taskTitle}`}>
      <Section>
        <Text style={heading}>
          You have a new task from {fromAiName}
        </Text>
        <Text style={label}>Task</Text>
        <Text style={value}>{taskTitle}</Text>
        <Text style={label}>Description</Text>
        <Text style={value}>{description}</Text>
        {dueDate && (
          <>
            <Text style={label}>Due Date</Text>
            <Text style={value}>{dueDate}</Text>
          </>
        )}
      </Section>
      <Section>
        <Button href={viewUrl}>View Task</Button>
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
