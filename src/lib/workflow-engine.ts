import { prisma } from "@/lib/db";
import { logAction } from "./audit-logger";
import { evaluatePolicy } from "./policy-engine";
import { createWorkflowRun, completeWorkflowRun } from "./workflow-store";

export type WorkflowNode = {
  id: string;
  type: "trigger" | "condition" | "action" | "output";
  config: Record<string, unknown>;
};

export type WorkflowEdge = {
  from: string;
  to: string;
  label?: string;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

/**
 * Execute a workflow graph. Walks from trigger node through conditions and actions.
 */
export async function executeWorkflow(
  operatorId: string,
  workflowId: string,
  triggerData?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, operatorId, status: "active" },
  });
  if (!workflow || !workflow.graph) {
    return { success: false, error: "Workflow not found or not active" };
  }

  const graph: WorkflowGraph = JSON.parse(workflow.graph);
  const run = await createWorkflowRun(workflowId);

  try {
    // Find trigger node
    const triggerNode = graph.nodes.find((n) => n.type === "trigger");
    if (!triggerNode) throw new Error("No trigger node found");

    // Walk the graph
    const visited = new Set<string>();
    const queue = [triggerNode.id];
    const context: Record<string, unknown> = { trigger: triggerData };

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      if (node.type === "condition") {
        const passed = evaluateCondition(node.config, context);
        const outEdges = graph.edges.filter((e) => e.from === nodeId);
        const nextEdge = outEdges.find((e) => (passed ? e.label !== "false" : e.label === "false"));
        if (nextEdge) queue.push(nextEdge.to);
      } else if (node.type === "action") {
        // Check policy before executing
        const policyResult = await evaluatePolicy(operatorId, "execute", {});
        if (policyResult.effect === "DENY") {
          await logAction(operatorId, {
            action: "workflow_action_denied",
            actorType: "system",
            outcome: "denied",
            policyRuleId: policyResult.matchedRule?.id,
          });
          continue;
        }

        await executeAction(operatorId, node.config, context);

        // Continue to next nodes
        const outEdges = graph.edges.filter((e) => e.from === nodeId);
        for (const edge of outEdges) queue.push(edge.to);
      } else {
        // Trigger/output — just continue
        const outEdges = graph.edges.filter((e) => e.from === nodeId);
        for (const edge of outEdges) queue.push(edge.to);
      }
    }

    await prisma.workflow.update({
      where: { id: workflowId },
      data: { lastRunAt: new Date() },
    });

    await completeWorkflowRun(run.id, "completed", context);
    await logAction(operatorId, {
      action: "workflow_executed",
      actorType: "system",
      outcome: "success",
      inputSnapshot: { workflowId, triggerData },
    });

    return { success: true };
  } catch (err) {
    await completeWorkflowRun(run.id, "failed", { error: String(err) });
    return { success: false, error: String(err) };
  }
}

function evaluateCondition(
  config: Record<string, unknown>,
  context: Record<string, unknown>,
): boolean {
  // Simple condition evaluation
  if (config.field && config.operator && config.value) {
    const fieldValue = String(context[config.field as string] ?? "");
    const compareValue = String(config.value);
    switch (config.operator) {
      case "equals": return fieldValue === compareValue;
      case "contains": return fieldValue.includes(compareValue);
      case "gt": return parseFloat(fieldValue) > parseFloat(compareValue);
      case "lt": return parseFloat(fieldValue) < parseFloat(compareValue);
    }
  }
  return true;
}

async function executeAction(
  _operatorId: string,
  config: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<void> {
  // Action types: create_entity, update_entity, send_notification, etc.
  const actionType = config.actionType as string;
  context[`action_${actionType}`] = { executed: true, timestamp: new Date().toISOString() };
}
