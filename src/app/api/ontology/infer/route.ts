import { NextResponse } from "next/server";
import { getOperatorId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProvider } from "@/lib/connectors/registry";
import { inferOntology } from "@/lib/ontology-inference";
import { listEntityTypes } from "@/lib/entity-model-store";

export async function POST(req: Request) {
  try {
    const operatorId = await getOperatorId();
    const body = await req.json().catch(() => ({}));
    const connectorIds: string[] | undefined = body.connectorIds;

    // Load connectors
    const connectors = await prisma.sourceConnector.findMany({
      where: {
        operatorId,
        status: "active",
        ...(connectorIds?.length ? { id: { in: connectorIds } } : {}),
      },
    });

    if (connectors.length === 0) {
      return NextResponse.json(
        { error: "No active connectors found" },
        { status: 400 }
      );
    }

    // Infer schemas from each connector
    const sources = [];
    for (const connector of connectors) {
      const provider = getProvider(connector.provider);
      if (!provider) continue;

      const config = connector.config ? JSON.parse(connector.config) : {};
      const schemas = await provider.inferSchema(config);

      if (schemas.length > 0) {
        sources.push({
          connectorId: connector.id,
          connectorName: connector.name || connector.provider,
          providerType: connector.provider,
          schemas,
        });
      }
    }

    if (sources.length === 0) {
      return NextResponse.json(
        { error: "No schemas could be inferred from the connectors" },
        { status: 400 }
      );
    }

    // Load existing entity types for additive inference
    const existingTypes = await listEntityTypes(operatorId);
    const existingEntityTypes = existingTypes.map((t) => ({
      name: t.name,
      slug: t.slug,
      properties: t.properties.map((p) => p.slug),
    }));

    // Run ontology inference
    const proposal = await inferOntology(
      sources,
      existingEntityTypes.length > 0 ? existingEntityTypes : undefined
    );

    return NextResponse.json({
      proposal,
      sources: sources.map((s) => ({
        connectorId: s.connectorId,
        connectorName: s.connectorName,
        schemasFound: s.schemas.length,
      })),
    });
  } catch (err) {
    console.error("[ontology/infer] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Inference failed" },
      { status: 500 }
    );
  }
}
