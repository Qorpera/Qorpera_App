import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { estimateTokens } from "@/lib/reasoning-tools";

export async function logToolCall(params: {
  situationId: string;
  cycleNumber: number;
  callIndex: number;
  toolName: string;
  arguments: Record<string, unknown>;
  result: string;
  durationMs: number;
}): Promise<void> {
  try {
    await prisma.toolCallTrace.create({
      data: {
        situationId: params.situationId,
        cycleNumber: params.cycleNumber,
        callIndex: params.callIndex,
        toolName: params.toolName,
        arguments: params.arguments as Prisma.InputJsonValue,
        resultSummary: params.result.slice(0, 500),
        resultTokens: estimateTokens(params.result),
        durationMs: params.durationMs,
      },
    });
  } catch (err) {
    // Telemetry must never crash the reasoning loop
    console.error("[tool-call-trace] Failed to log tool call:", err);
  }
}

export async function getReasoningTrace(situationId: string): Promise<{
  totalCalls: number;
  totalTokens: number;
  totalDurationMs: number;
  calls: Array<{
    callIndex: number;
    cycleNumber: number;
    toolName: string;
    arguments: Record<string, unknown>;
    resultSummary: string | null;
    resultTokens: number;
    durationMs: number;
    createdAt: Date;
  }>;
}> {
  const traces = await prisma.toolCallTrace.findMany({
    where: { situationId },
    orderBy: [{ cycleNumber: "asc" }, { callIndex: "asc" }],
  });

  return {
    totalCalls: traces.length,
    totalTokens: traces.reduce((sum, t) => sum + t.resultTokens, 0),
    totalDurationMs: traces.reduce((sum, t) => sum + t.durationMs, 0),
    calls: traces.map((t) => ({
      callIndex: t.callIndex,
      cycleNumber: t.cycleNumber,
      toolName: t.toolName,
      arguments: t.arguments as Record<string, unknown>,
      resultSummary: t.resultSummary,
      resultTokens: t.resultTokens,
      durationMs: t.durationMs,
      createdAt: t.createdAt,
    })),
  };
}
