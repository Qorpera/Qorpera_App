import { NextRequest, NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow } from "@/lib/workflow-store";
import { WORKFLOW_TEMPLATES } from "@/lib/workflow-templates";

export async function GET() {
  const operatorId = await getOperatorId();
  const workflows = await listWorkflows(operatorId);
  return NextResponse.json({ workflows, templates: WORKFLOW_TEMPLATES });
}

export async function POST(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();

  // If templateSlug provided, create from template
  if (body.templateSlug) {
    const template = WORKFLOW_TEMPLATES.find((t) => t.slug === body.templateSlug);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const workflow = await createWorkflow(operatorId, {
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      graph: template.graph,
    });
    return NextResponse.json(workflow, { status: 201 });
  }

  const workflow = await createWorkflow(operatorId, body);
  return NextResponse.json(workflow, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const operatorId = await getOperatorId();
  const body = await req.json();
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const updated = await updateWorkflow(operatorId, id, fields);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const operatorId = await getOperatorId();
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const ok = await deleteWorkflow(operatorId, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
