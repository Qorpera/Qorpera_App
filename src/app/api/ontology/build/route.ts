import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { buildOntology } from "@/lib/ontology-builder";
import type { OntologyProposal } from "@/lib/ontology-inference";

export async function POST(req: Request) {
  try {
    const operatorId = await getOperatorId();
    const body = await req.json();

    const proposal = body.proposal as OntologyProposal;
    if (!proposal || !Array.isArray(proposal.entityTypes)) {
      return NextResponse.json(
        { error: "Missing or invalid proposal in request body" },
        { status: 400 }
      );
    }

    const result = await buildOntology(operatorId, proposal);

    return NextResponse.json({ result });
  } catch (err) {
    console.error("[ontology/build] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Build failed" },
      { status: 500 }
    );
  }
}
