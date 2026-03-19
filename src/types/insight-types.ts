import { z } from "zod";

export const InsightEvidenceSchema = z.object({
  sampleSize: z.number().int().min(1),
  successRate: z.number().min(0).max(1),
  situationTypeId: z.string(),
  situationTypeName: z.string(),
  actionCapabilityId: z.string().optional(),
  actionCapabilityName: z.string().optional(),
  timeRange: z.object({
    from: z.string(),
    to: z.string(),
  }),
  exampleSituationIds: z.array(z.string()).max(5),
  averageResolutionTimeHours: z.number().optional(),
  comparisons: z.array(z.object({
    actionCapabilityId: z.string(),
    actionCapabilityName: z.string(),
    sampleSize: z.number().int(),
    successRate: z.number().min(0).max(1),
    aiEntityIds: z.array(z.string()),
    averageResolutionTimeHours: z.number().optional(),
  })).optional(),
});

export type InsightEvidence = z.infer<typeof InsightEvidenceSchema>;

export const InsightExtractionOutputSchema = z.object({
  insights: z.array(z.object({
    insightType: z.enum([
      "approach_effectiveness",
      "timing_pattern",
      "entity_preference",
      "escalation_pattern",
      "resolution_pattern",
    ]),
    description: z.string().max(500),
    evidence: InsightEvidenceSchema,
    confidence: z.number().min(0).max(1),
    promptModification: z.string().max(200).nullable(),
  })),
});

export type InsightExtractionOutput = z.infer<typeof InsightExtractionOutputSchema>;
