import { z } from "zod";

export const DraftAttachmentSchema = z.object({
  type: z.enum(["spreadsheet", "document"]),
  title: z.string(),
  description: z.string().optional(),
  data: z.union([
    z.object({
      format: z.literal("spreadsheet"),
      headers: z.array(z.string()),
      rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
    }),
    z.object({
      format: z.literal("document"),
      content: z.string(),
    }),
  ]),
});

export const DraftPayloadSchema = z.object({
  actionType: z.string(),
  provider: z.enum(["gmail", "outlook", "slack", "teams", "google_drive", "onedrive"]).optional(),
  payload: z.record(z.unknown()),
  attachments: z.array(DraftAttachmentSchema).optional(),
});

export const ReasoningOutputSchema = z.object({
  analysis: z.string().min(10),
  evidenceSummary: z.string().min(10),
  consideredActions: z.array(z.object({
    action: z.string(),
    evidenceFor: z.array(z.string()),
    evidenceAgainst: z.array(z.string()),
    expectedOutcome: z.string(),
  })),
  chosenAction: z.object({
    action: z.string(),
    connector: z.string(),
    params: z.record(z.any()),
    justification: z.string().min(10),
  }).nullable(),
  confidence: z.number().min(0).max(1),
  missingContext: z.array(z.string()).nullable(),
  draftPayloads: z.array(DraftPayloadSchema).optional().default([]),
});

export type ReasoningOutput = z.infer<typeof ReasoningOutputSchema>;
export type DraftPayload = z.infer<typeof DraftPayloadSchema>;
export type DraftAttachment = z.infer<typeof DraftAttachmentSchema>;
